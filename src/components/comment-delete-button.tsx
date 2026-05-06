"use client";

/**
 * Submit button for the comment-delete form on the comment thread.
 *
 * Closes findings §3.A7. Single-click delete with no confirmation
 * is gone — clicking now pops a native confirm() and the action
 * only runs if the user OKs.
 *
 * Native confirm is intentionally minimal. A portal modal can
 * replace this primitive without touching call sites once we
 * standardise on a dialog component (tracked in
 * docs/proposed-issues.md).
 *
 * Soft-delete vs. hard-delete is filed in proposed-issues.md;
 * today's behavior is hard delete (with full audit). That stays
 * unchanged here — this PR only adds the confirmation gate.
 */
export function CommentDeleteButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (
          !window.confirm(
            "Delete this comment? This cannot be undone.",
          )
        ) {
          e.preventDefault();
        }
      }}
      className="text-[10px] text-slate-500 hover:text-red-200"
    >
      delete
    </button>
  );
}
