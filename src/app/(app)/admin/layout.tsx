import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { AdminSidebar } from "@/components/admin-sidebar";

/**
 * Admin sub-shell. Everything under /admin requires USERS_MANAGE
 * (which only ADMIN has today). We re-check on every page load so a
 * role change mid-session takes effect immediately.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <AdminSidebar />
      </aside>
      <section>{children}</section>
    </div>
  );
}
