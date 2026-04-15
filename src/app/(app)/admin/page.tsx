import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const [users, districts, schools, devices] = await Promise.all([
    prisma.user.count(),
    prisma.district.count(),
    prisma.school.count(),
    prisma.device.count(),
  ]);

  const cards = [
    {
      href: "/admin/users",
      title: "Users",
      count: users,
      description: "Create, edit, disable, and reset passwords",
    },
    {
      href: "/admin/districts",
      title: "Districts",
      count: districts,
      description: "School district definitions",
    },
    {
      href: "/admin/schools",
      title: "Schools",
      count: schools,
      description: "School records, addresses, and contacts",
    },
    {
      href: "/admin/devices",
      title: "Devices",
      count: devices,
      description: "Manual device entries and profile history",
    },
    {
      href: "/admin/permissions",
      title: "Permissions",
      count: null,
      description: "Customize what each role can access and do",
    },
    {
      href: "/admin/statuses",
      title: "Statuses",
      count: null,
      description: "Configure workflow states, transitions, and SLA thresholds",
    },
    {
      href: "/admin/settings",
      title: "Settings",
      count: null,
      description: "Hold-window, SLA thresholds, digest recipients",
    },
    {
      href: "/audit",
      title: "Audit log",
      count: null,
      description: "Who did what, when — filterable by entity and actor",
    },
  ];

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Manage users, districts, schools, devices, and review the audit trail."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary"
          >
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">{card.title}</div>
              {card.count != null && (
                <span className="rounded bg-surface-border px-2 py-0.5 text-xs tabular-nums">
                  {card.count}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {card.description}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
