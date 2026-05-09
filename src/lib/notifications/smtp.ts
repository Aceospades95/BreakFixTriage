/**
 * Legacy notification SMTP shim.
 *
 * Round-13 §1G — the actual nodemailer import has moved to
 * `lib/email/providers/smtp.ts` so the email-chokepoint grep gate
 * (G12) returns zero hits outside that directory. This file stays
 * as a thin delegator so existing call sites in
 * `lib/notifications/transport.ts` keep compiling while the
 * legacy `Notification` model is migrated to the rules-engine
 * path. ADR (R13 §1G) covers the deletion plan.
 */

import {
  isSmtpConfigured as providerIsConfigured,
  resetSmtpProviderCache,
  sendViaSmtp,
} from "@/lib/email/providers/smtp";
import type { NotificationTransport } from "./types";

export function isSmtpConfigured(): boolean {
  return providerIsConfigured();
}

export function buildSmtpTransport(): NotificationTransport | null {
  if (!providerIsConfigured()) return null;
  return {
    name: "smtp",
    async send({ recipientEmail, subject, body }) {
      const result = await sendViaSmtp({
        to: recipientEmail,
        subject,
        text: body,
      });
      if (result.ok) return { ok: true };
      return { ok: false, error: result.error ?? "send failed" };
    },
  };
}

export function resetSmtpCache(): void {
  resetSmtpProviderCache();
}

/**
 * Round-13 §1G — kept for compatibility but always returns null
 * because the SMTP config now lives in
 * `lib/email/providers/smtp.ts`.
 */
export function currentSmtpConfig(): null {
  return null;
}
