/**
 * SMTP transport built on nodemailer. Compatible with Google Workspace
 * SMTP relay, Gmail with an app password, Amazon SES SMTP, SendGrid
 * SMTP, Mailgun SMTP, Postfix, or any other RFC-compliant server.
 *
 * Environment variables:
 *
 *   SMTP_HOST      (required)  e.g. smtp-relay.gmail.com
 *   SMTP_PORT      (required)  e.g. 587 or 465
 *   SMTP_USER      (optional)  SMTP auth username
 *   SMTP_PASS      (optional)  SMTP auth password
 *   SMTP_SECURE    (optional)  "true" for implicit TLS (usually port 465)
 *   SMTP_FROM      (required)  From header, e.g. "BreakFix Triage <ops@nyc.gov>"
 *   SMTP_REPLY_TO  (optional)  Reply-To header
 *
 * We lazy-import nodemailer so installs that leave SMTP unconfigured
 * don't pay the module load cost on boot.
 */

import type { Transporter } from "nodemailer";
import type { NotificationTransport } from "./types";

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM,
  );
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

/**
 * Build the nodemailer transporter lazily. Returns null when SMTP is
 * not configured so callers can fall back to stdout.
 */
export function buildSmtpTransport(): NotificationTransport | null {
  const config = readSmtpConfig();
  if (!config) return null;
  cachedConfig = config;

  return {
    name: "smtp",
    async send({ recipientEmail, subject, body }) {
      try {
        if (!cachedTransporter) {
          // Lazy import so that stdout-only deployments never load the
          // nodemailer module tree at all.
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
          to: recipientEmail,
          subject,
          text: body,
          replyTo: config.replyTo,
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Test helper: clear the cached transporter so tests that mutate env
 * vars between runs get a fresh instance.
 */
export function resetSmtpCache(): void {
  cachedTransporter = null;
  cachedConfig = null;
}

export function currentSmtpConfig(): SmtpConfig | null {
  return cachedConfig;
}
