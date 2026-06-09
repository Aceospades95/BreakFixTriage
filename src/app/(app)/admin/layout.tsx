import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { AdminSidebar } from "@/components/admin-sidebar";

/**
 * Admin sub-shell.
 *
 * Round-14 — the gate used to require USERS_MANAGE for everything
 * under /admin, which locked OPS_MANAGER out of /admin/email-log and
 * /admin/email-templates despite the role holding EMAIL_WRITE (the
 * documented grant — see docs/sitemap.md and the Round-2 §8 note in
 * rbac.ts). The layout now admits any session holding at least one
 * admin-area permission; each page keeps its own precise gate, and
 * the sidebar only renders links the role can actually open.
 *
 * We re-check on every page load so a role change mid-session takes
 * effect immediately.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const canManageUsers = await canAsync(
    session.role,
    PERMISSIONS.USERS_MANAGE,
  );
  const canEmailWrite = await canAsync(session.role, PERMISSIONS.EMAIL_WRITE);
  if (!canManageUsers && !canEmailWrite) {
    redirect(
      `/forbidden?perm=${encodeURIComponent(PERMISSIONS.USERS_MANAGE)}`,
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <AdminSidebar canManageUsers={canManageUsers} />
      </aside>
      <section>{children}</section>
    </div>
  );
}
