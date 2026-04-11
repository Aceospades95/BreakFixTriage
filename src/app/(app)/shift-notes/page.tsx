import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  createShiftNoteAction,
  deleteShiftNoteAction,
} from "@/server/actions/shift-notes";

export const dynamic = "force-dynamic";

/**
 * Shift handover notes.
 *
 * Reverse-chronological feed of plain-text notes ops can leave for
 * each other at the end of a shift. Writers post from the form at
 * the top; any reader role can view the feed. Authors and admins
 * can delete.
 */
export default async function ShiftNotesPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canWrite = can(session.role, PERMISSIONS.TICKETS_WRITE);

  const notes = await prisma.shiftNote.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return (
    <>
      <PageHeader
        title="Shift notes"
        subtitle="Quick handover notes between shifts. Most recent first."
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {canWrite && (
        <form
          action={createShiftNoteAction}
          className="mb-6 space-y-2 rounded-lg border border-surface-border bg-surface-muted p-4"
        >
          <label className="block text-[10px] uppercase tracking-wide text-slate-400">
            New note
          </label>
          <textarea
            name="body"
            rows={3}
            required
            placeholder="Chromebooks from P.S. 101 arrived with cracked screens — all 4 on the bench.  Loaner request from M.S. 220 pending."
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Visible to everyone on next login.
            </span>
            <button
              type="submit"
              className="rounded bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent-strong"
            >
              Post note
            </button>
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-10 text-center text-sm text-slate-400">
          No notes yet. Be the first to leave a handover.
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const canDelete =
              canWrite &&
              (n.authorUserId === session.userId ||
                session.role === "ADMIN");
            return (
              <li
                key={n.id}
                className="rounded-lg border border-surface-border bg-surface-muted p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-400">
                      <strong className="text-slate-100">
                        {n.author.name}
                      </strong>
                      <span className="ml-2 font-mono uppercase text-[10px]">
                        {n.author.role}
                      </span>
                      <span className="mx-2">·</span>
                      {n.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                      {n.body}
                    </p>
                  </div>
                  {canDelete && (
                    <form action={deleteShiftNoteAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        type="submit"
                        className="text-[10px] text-slate-500 hover:text-red-200"
                      >
                        delete
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
