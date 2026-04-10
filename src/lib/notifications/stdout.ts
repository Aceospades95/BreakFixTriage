import type { NotificationTransport } from "./types";

/**
 * Dev-default transport that logs notifications to the container's
 * stdout. Always returns `ok: true` so it can be used as the fallback
 * when no real transport is configured.
 */
export const StdoutTransport: NotificationTransport = {
  name: "stdout",
  async send({ recipientEmail, subject, body }) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[notification:stdout] to=${recipientEmail}\n  subject: ${subject}\n  body: ${body}\n`,
    );
    return { ok: true };
  },
};
