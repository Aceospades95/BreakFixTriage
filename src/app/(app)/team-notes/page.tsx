import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  createTeamNoteAction,
  deactivateTeamNoteAction,
} from "@/server/actions/team-notes";

export const dynamic = "force-dynamic";

/**
 * Round-20 — NY team: manage the urgent-notes banner.
 *
 * Ops + dispatch post notes ("There is a toner down on the table,
 * must be taken to Kennedy school today"); everyone sees them as a
 * banner until they acknowledge. This page shows who has — and who
 * has NOT — signed off on each active note.
 */
export default async function TeamNotesPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  await requireRole(PERMISSIONS.TEAM_NOTES_MANAGE);

  const [notes, activeStaff] = await Promise.all([
    prisma.teamNote.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        createdBy: { select: { name: true } },
        acks: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { acknowledgedAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Team notes"
        subtitle="Urgent notes banner for the whole team — with a click sign-off so you know who saw them."
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      <section className="mb-6 rounded-lg border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
          Post a note
        </h2>
        <form
          action={createTeamNoteAction}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Note
            </span>
            <input
              type="text"
              name="body"
              required
              minLength={5}
              maxLength={1000}
              placeholder='e.g. "Toner on the table must be taken to Kennedy school today"'
              className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Auto-expire (hours, optional)
            </span>
            <input
              type="number"
              name="expiresInHours"
              min={1}
              max={336}
              placeholder="e.g. 24"
              className="w-40 rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Post note
          </button>
        </form>
      </section>

      {notes.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          No notes yet. Post one above — it banners for everyone until
          they acknowledge it.
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const expired = n.expiresAt != null && n.expiresAt <= now;
            const live = n.active && !expired;
            const ackedIds = new Set(n.acks.map((a) => a.user.id));
            const pending = activeStaff.filter((u) => !ackedIds.has(u.id));
            return (
              <li
                key={n.id}
                data-testid="team-note-row"
                className={`rounded-lg border p-4 ${
                  live
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-surface-border bg-surface-muted/30 opacity-80"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100">
                      {n.body}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {n.createdBy.name} ·{" "}
                      {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      {n.expiresAt && (
                        <>
                          {" "}
                          · {expired ? "expired" : "expires"}{" "}
                          {n.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
                        </>
                      )}
                      {!n.active && " · retired"}
                    </div>
                  </div>
                  {live && (
                    <form action={deactivateTeamNoteAction}>
                      <input type="hidden" name="noteId" value={n.id} />
                      <ConfirmButton
                        message="Retire this note? It stops bannering for everyone."
                        className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-accent"
                      >
                        Retire
                      </ConfirmButton>
                    </form>
                  )}
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-emerald-300/80">
                      Acknowledged ({n.acks.length})
                    </div>
                    <div className="mt-0.5 text-slate-300">
                      {n.acks.length === 0
                        ? "Nobody yet."
                        : n.acks.map((a) => a.user.name).join(", ")}
                    </div>
                  </div>
                  {live && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-amber-300/80">
                        Still pending ({pending.length})
                      </div>
                      <div className="mt-0.5 text-slate-400">
                        {pending.length === 0
                          ? "Everyone has signed off."
                          : pending.map((u) => u.name).join(", ")}
                      </div>
                    </div>
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
