/**
 * Round-13 §1G — SMTP provider chokepoint.
 *
 * Every nodemailer import in the codebase lives in
 * `lib/email/providers/`. The grep gate (G12) enforces that no
 * other file under `src/` imports `nodemailer` or calls
 * `transporter.sendMail`. Any future provider (resend, mailgun, ses,
 * etc.) lands as a sibling under this directory.
 *
 * Environment variables (consumed at provider build time):
 *
 *   SMTP_HOST      (required)  e.g. smtp-relay.gmail.com
 *   SMTP_PORT      (required)  e.g. 587 or 465
 *   SMTP_USER      (optional)  SMTP auth username
 *   SMTP_PASS      (optional)  SMTP auth password
 *   SMTP_SECURE    (optional)  "true" for implicit TLS (port 465)
 *   SMTP_FROM      (required)  e.g. "BreakFix Triage <ops@nyc.gov>"
 *   SMTP_REPLY_TO  (optional)
 */

import type { Transporter } from "nodemailer";

export interface SmtpSendInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmtpSendResult {
  ok: boolean;
  error?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  from: string;
  replyTo: string | undefined;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM,
  );
}

function readSmtpConfig(): SmtpConfig | null {
  if (!isSmtpConfigured()) return null;
  const portNum = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
    return null;
  }
  const secure =
    (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || portNum === 465;
  return {
    host: process.env.SMTP_HOST!,
    port: portNum,
    secure,
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM!,
    replyTo: process.env.SMTP_REPLY_TO || undefined,
  };
}

let cachedTransporter: Transporter | null = null;
let cachedConfig: SmtpConfig | null = null;

export async function sendViaSmtp(input: SmtpSendInput): Promise<SmtpSendResult> {
  const config = readSmtpConfig();
  if (!config) {
    return { ok: false, error: "SMTP not configured" };
  }
  cachedConfig = config;
  try {
    if (!cachedTransporter) {
      // Lazy-load nodemailer so deployments without SMTP never load
      // the module tree at all.
      const nodemailer = await import("nodemailer");
      cachedTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth:
          config.user && config.pass
            ? { user: config.user, pass: config.pass }
            : undefined,
      });
    }
    await cachedTransporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: config.replyTo,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function resetSmtpProviderCache(): void {
  cachedTransporter = null;
  cachedConfig = null;
}

export function currentSmtpConfig(): SmtpConfig | null {
  return cachedConfig;
}
