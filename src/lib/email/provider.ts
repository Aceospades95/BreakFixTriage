/**
 * Email provider abstraction.
 *
 * Round-2 §3. Four implementations:
 *
 *   - "stdout"  — logs to console; useful in dev / CI / when the
 *                 deploy target has no SMTP gateway. Default.
 *   - "smtp"    — reuses the existing nodemailer-backed
 *                 NotificationTransport from src/lib/notifications/.
 *                 SMTP_* envs are the contract.
 *   - "memory"  — Round-15 (graduates backlog B12 option b): an
 *                 in-process inbox for tests. Messages append to an
 *                 array readable via getMemoryInbox(); nothing
 *                 leaves the process. Selected via
 *                 EMAIL_PROVIDER=memory or the explicit arg.
 *   - "resend"  — placeholder. The brief calls Resend the preferred
 *                 default; wiring requires `RESEND_API_KEY`. Until
 *                 that env is provisioned, the implementation falls
 *                 back to stdout with a warning. Tracked in
 *                 docs/proposed-issues.md (Round-2 deferrals).
 *
 * Provider creds live ONLY in env. Settings carries the selection
 * (Settings.emailProvider) and the From / Reply-To addresses.
 */

import {
  buildSmtpTransport,
  isSmtpConfigured,
} from "@/lib/notifications/smtp";

export interface EmailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  /** From address. Falls back to env DEFAULT_FROM if not supplied. */
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface ProviderResult {
  ok: true;
  providerMessageId: string | null;
}

export interface ProviderError {
  ok: false;
  error: string;
}

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<ProviderResult | ProviderError>;
}

const StdoutProvider: EmailProvider = {
  name: "stdout",
  async send(msg) {
    console.log(
      `[email:stdout] to=${msg.to.join(",")} subject=${JSON.stringify(msg.subject)}`,
    );
    if (msg.cc?.length) console.log(`[email:stdout]   cc=${msg.cc.join(",")}`);
    if (msg.bcc?.length) console.log(`[email:stdout]   bcc=${msg.bcc.join(",")}`);
    return { ok: true, providerMessageId: `stdout-${Date.now()}` };
  },
};

// Round-15 (B12 option b) — in-memory inbox for integration tests.
// Append-only within a process; tests clear between cases.
const memoryInbox: EmailMessage[] = [];

const MemoryProvider: EmailProvider = {
  name: "memory",
  async send(msg) {
    memoryInbox.push(msg);
    return { ok: true, providerMessageId: `memory-${memoryInbox.length}` };
  },
};

/** Test-only: messages "sent" through the memory provider. */
export function getMemoryInbox(): readonly EmailMessage[] {
  return memoryInbox;
}

/** Test-only: empty the memory inbox between cases. */
export function clearMemoryInbox(): void {
  memoryInbox.length = 0;
}

function buildSmtpProvider(): EmailProvider | null {
  const t = buildSmtpTransport();
  if (!t) return null;
  return {
    name: "smtp",
    async send(msg) {
      const all = [...msg.to, ...(msg.cc ?? []), ...(msg.bcc ?? [])];
      // The legacy NotificationTransport only takes a single
      // `recipientEmail`; dispatchEmailEvent walks the list and
      // sends one envelope per address (provider-side fan-out is
      // a follow-up). We reuse `t.send` per recipient here so the
      // existing SMTP wiring stays in one place.
      let lastErr: string | null = null;
      for (const r of all) {
        const res = await t.send({
          recipientEmail: r,
          subject: msg.subject,
          // Prefer HTML body when present; transport is plaintext
          // today, so we send the text body through SMTP and the
          // HTML lives in EmailLog.bodyHtml for the audit / re-render.
          body: msg.bodyText || msg.bodyHtml,
        });
        if (!res.ok) {
          lastErr = res.error ?? "send failed";
        }
      }
      if (lastErr) return { ok: false, error: lastErr };
      return { ok: true, providerMessageId: null };
    },
  };
}

let cached: EmailProvider | null = null;

/**
 * Resolve the configured provider. Cached because we only need to
 * build the SMTP transport object once.
 *
 * @param explicit  Override the cached resolution. Used by tests.
 */
export function getEmailProvider(
  explicit?: "stdout" | "smtp" | "resend" | "memory",
): EmailProvider {
  const choice =
    explicit ??
    (process.env.EMAIL_PROVIDER as
      | "stdout"
      | "smtp"
      | "resend"
      | "memory"
      | undefined) ??
    (isSmtpConfigured() ? "smtp" : "stdout");

  if (choice === "memory") {
    cached = MemoryProvider;
    return MemoryProvider;
  }

  if (choice === "smtp") {
    const smtp = buildSmtpProvider();
    if (smtp) {
      cached = smtp;
      return smtp;
    }
    console.warn(
      "[email] EMAIL_PROVIDER=smtp but SMTP_* envs are not set; falling back to stdout",
    );
  }

  if (choice === "resend") {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "[email] EMAIL_PROVIDER=resend but RESEND_API_KEY is not set; falling back to stdout",
      );
    } else {
      // Round-2 deferral: the brief names Resend as the preferred
      // default but the wiring requires `resend` SDK + a templating
      // contract. Tracked in docs/proposed-issues.md. Until then,
      // stdout is the safe default.
      console.warn(
        "[email] Resend provider not wired in this branch; using stdout fallback. See docs/proposed-issues.md.",
      );
    }
  }

  cached = StdoutProvider;
  return StdoutProvider;
}

/** Test-only helper. Resets the cached provider. */
export function resetEmailProviderCache(): void {
  cached = null;
}
