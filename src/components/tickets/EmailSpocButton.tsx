"use client";

/**
 * Round-6 §3B — "Email SPOC" button on /tickets/[id].
 *
 * Click → drawer opens with subject + body pre-filled from the
 * `ticket_update_to_spoc` template. Operator edits, clicks Send,
 * the server action posts to dispatchEmailEvent. Success toasts via
 * the URL ?ok= param; failure toasts via ?error=. Both auto-dismiss
 * per the existing host policy.
 *
 * SPOC resolution happens server-side; the button is rendered only
 * when the caller has at least one SPOC email to send to (the
 * ticket detail page passes `hasSpoc`). When false, the button is
 * disabled with a tooltip pointing at the school admin page.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { emailSpocFromTicket } from "@/server/actions/tickets-email";

export function EmailSpocButton({
  ticketId,
  ticketIncidentNumber,
  ticketShortDescription,
  ticketState,
  schoolName,
  schoolId,
  hasSpoc,
}: {
  ticketId: string;
  ticketIncidentNumber: string;
  ticketShortDescription: string;
  ticketState: string;
  schoolName: string;
  schoolId: string;
  hasSpoc: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaultSubject = `Update on ${ticketIncidentNumber} (${schoolName})`;
  const defaultBody =
    `Hi,\n\nQuick update on ticket ${ticketIncidentNumber}:\n\n` +
    `${ticketShortDescription}\n\nCurrent status: ${ticketState}\n\n` +
    `Reply if you need anything else.`;
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  if (!hasSpoc) {
    return (
      <button
        type="button"
        disabled
        title="No SPOC contact with email is configured for this school."
        className="cursor-not-allowed rounded border border-surface-border px-2 py-1 text-xs text-slate-500"
      >
        Email SPOC ·{" "}
        <a
          href={`/admin/schools/${schoolId}`}
          className="underline hover:text-accent"
          onClick={(e) => e.stopPropagation()}
        >
          configure
        </a>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-surface-border px-2 py-1 text-xs text-slate-200 hover:border-accent hover:text-white"
      >
        Email SPOC
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Email SPOC"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-lg border border-surface-border bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-200">
              Email SPOC about {ticketIncidentNumber}
            </h2>

            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] tracking-wide text-slate-400">
                Subject
              </span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] tracking-wide text-slate-400">
                Body
              </span>
              <textarea
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:border-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !subject.trim() || !body.trim()}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      const result = await emailSpocFromTicket({
                        ticketId,
                        subject,
                        body,
                      });
                      setOpen(false);
                      router.replace(
                        `/tickets/${ticketId}?ok=${encodeURIComponent(
                          `Email sent to ${result.recipients} SPOC ${
                            result.recipients === 1 ? "contact" : "contacts"
                          }`,
                        )}`,
                      );
                      router.refresh();
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : "Send failed";
                      router.replace(
                        `/tickets/${ticketId}?error=${encodeURIComponent(msg)}`,
                      );
                    }
                  });
                }}
                className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
