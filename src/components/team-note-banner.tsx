import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { ackTeamNoteAction } from "@/server/actions/team-notes";

/**
 * Round-20 — NY team: urgent team notes banner.
 *
 * Server component rendered by the app layout above the page
 * content. Shows every active, unexpired note the signed-in user
 * has NOT acknowledged yet; "Got it — acknowledge" records a
 * durable TeamNoteAck row and the note disappears for that user.
 * Managers see who has(n't) signed off on /team-notes.
 */
export async function TeamNoteBanner({
  userId,
  canManage,
}: {
  userId: string;
  canManage: boolean;
}) {
  const notes = await prisma.teamNote.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      acks: { none: { userId } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { createdBy: { select: { name: true } } },
  });
  if (notes.length === 0) return null;

  return (
    <div className="mb-4 space-y-2 print:hidden" data-testid="team-note-banner">
      {notes.map((n) => (
        <div
          key={n.id}
          data-testid="team-note-item"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3"
        >
          <span aria-hidden className="text-lg">
            📣
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-100">
              {n.body}
            </div>
            <div className="mt-0.5 text-[11px] text-amber-200">
              {n.createdBy.name} ·{" "}
              {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              {canManage && (
                <>
                  {" · "}
                  <Link
                    href="/team-notes"
                    className="underline underline-offset-2 hover:text-amber-50"
                  >
                    manage notes
                  </Link>
                </>
              )}
            </div>
          </div>
          <form action={ackTeamNoteAction}>
            <input type="hidden" name="noteId" value={n.id} />
            <button
              type="submit"
              className="rounded border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30"
            >
              Got it — acknowledge
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
