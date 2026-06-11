import Link from "next/link";
import type { Attachment } from "@prisma/client";
import {
  deleteAttachmentAction,
  uploadAttachmentAction,
} from "@/server/actions/attachments";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";

/**
 * Render a list of attachments with an inline upload form.
 *
 * `ownerKind` decides which column on the Attachment row we'll set
 * (TICKET / ROUTE_STOP / QUOTE) and `ownerId` is the foreign key.
 * The `returnTo` path tells the server action where to redirect
 * after the upload / delete completes — usually the page you're
 * rendering this component on.
 */
export function AttachmentList({
  attachments,
  ownerKind,
  ownerId,
  returnTo,
  canWrite,
}: {
  attachments: (Attachment & { uploadedBy: { name: string } | null })[];
  ownerKind: "TICKET" | "ROUTE_STOP" | "QUOTE" | "EXPENSE";
  ownerId: string;
  returnTo: string;
  canWrite: boolean;
}) {
  const ownerIdField =
    ownerKind === "TICKET"
      ? "ticketId"
      : ownerKind === "ROUTE_STOP"
        ? "routeStopId"
        : ownerKind === "EXPENSE"
          ? "expenseId"
          : "quoteId";

  return (
    <div>
      {attachments.length === 0 ? (
        <p className="text-sm text-slate-400">No files attached.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded border border-surface-border bg-surface px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  className="truncate font-medium text-accent hover:underline"
                >
                  {a.filename}
                </Link>
                {a.signerName && (
                  <span className="ml-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                    Signed by {a.signerName}
                  </span>
                )}
                <div className="mt-0.5 text-xs text-slate-400">
                  {formatSize(a.sizeBytes)} · {a.mimeType}
                  {a.uploadedBy && <> · uploaded by {a.uploadedBy.name}</>}
                  <span className="ml-1">
                    · <LocalTime date={a.createdAt} mode="datetime" />
                  </span>
                </div>
                {a.note && (
                  <div className="mt-0.5 text-xs italic text-slate-400">
                    “{a.note}”
                  </div>
                )}
              </div>
              {canWrite && (
                <form action={deleteAttachmentAction}>
                  <input
                    type="hidden"
                    name="attachmentId"
                    value={a.id}
                  />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <ConfirmButton
                    message={`Delete ${a.filename}? Proof files are part of the work record — this cannot be undone.`}
                    className="ml-3 rounded border border-surface-border bg-transparent px-2 py-0.5 text-[10px] font-normal text-slate-400 hover:border-red-500/60 hover:bg-transparent hover:text-red-200"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form
          action={uploadAttachmentAction}
          encType="multipart/form-data"
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-surface-border pt-3"
        >
          <input type="hidden" name="kind" value={ownerKind} />
          <input type="hidden" name={ownerIdField} value={ownerId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input
            type="file"
            name="file"
            required
            accept="image/*,application/pdf,text/plain,text/csv"
            className="flex-1 min-w-0 cursor-pointer rounded border border-surface-border bg-surface px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-0.5 file:text-[10px] file:font-semibold file:text-white"
          />
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
          >
            Upload
          </button>
        </form>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
