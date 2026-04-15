import type { Comment } from "@prisma/client";
import {
  createCommentAction,
  deleteCommentAction,
} from "@/server/actions/comments";
import { LocalTime } from "@/components/local-time";

type CommentWithAuthor = Comment & {
  author: { id: string; name: string } | null;
};

/**
 * Comment thread for a ticket. Renders oldest-first because ops
 * usually read top-to-bottom when catching up on a ticket, and
 * shows a compact post form underneath.
 */
export function CommentThread({
  ticketId,
  comments,
  currentUserId,
  currentUserRole,
  canWrite,
}: {
  ticketId: string;
  comments: CommentWithAuthor[];
  currentUserId: string;
  currentUserRole: string;
  canWrite: boolean;
}) {
  return (
    <div id="comments">
      {comments.length === 0 ? (
        <p className="text-sm text-slate-400">
          No comments yet. Be the first to leave a note.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const canDelete =
              canWrite &&
              (c.authorUserId === currentUserId ||
                currentUserRole === "ADMIN");
            return (
              <li
                key={c.id}
                className="rounded border border-surface-border bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    <strong className="text-slate-200">
                      {c.author?.name ?? "Unknown"}
                    </strong>
                    {" · "}
                    <LocalTime date={c.createdAt} mode="relative" />
                  </span>
                  {canDelete && (
                    <form action={deleteCommentAction}>
                      <input
                        type="hidden"
                        name="commentId"
                        value={c.id}
                      />
                      <input type="hidden" name="ticketId" value={ticketId} />
                      <button
                        type="submit"
                        className="text-[10px] text-slate-500 hover:text-red-200"
                      >
                        delete
                      </button>
                    </form>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                  {c.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <form
          action={createCommentAction}
          className="mt-4 space-y-2 border-t border-surface-border pt-3"
        >
          <input type="hidden" name="ticketId" value={ticketId} />
          <textarea
            name="body"
            rows={3}
            required
            placeholder="Leave a note for the team…"
            className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent-strong"
            >
              Post comment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
