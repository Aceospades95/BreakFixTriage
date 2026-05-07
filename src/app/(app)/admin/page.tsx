import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AdminCardKebab, type KebabAction } from "@/components/admin-card-kebab";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { resetStatusConfigAction } from "@/server/actions/statuses";
import { seedFederalHolidaysAction } from "@/server/actions/holidays";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const [users, districts, schools, devices, deviceModels, parts] =
    await Promise.all([
      prisma.user.count(),
      prisma.district.count(),
      prisma.school.count(),
      prisma.device.count(),
      prisma.deviceModel.count(),
      prisma.part.count(),
    ]);

  const cards: Array<{
    href: string;
    title: string;
    count: number | null;
    description: string;
    actions: KebabAction[];
  }> = [
    {
      href: "/admin/users",
      title: "Users",
      count: users,
      description: "Create, edit, disable, and reset passwords",
      actions: [
        { label: "+ New user", href: "/admin/users/new" },
        { label: "Export users CSV", href: "/api/exports/users" },
        {
          label: "View user audit log",
          href: "/admin/audit?entityType=User",
        },
      ],
    },
    {
      href: "/admin/districts",
      title: "Districts",
      count: districts,
      description: "School district definitions",
      actions: [
        { label: "+ New district", href: "/admin/districts#add" },
        {
          label: "View district audit log",
          href: "/admin/audit?entityType=District",
        },
      ],
    },
    {
      href: "/admin/schools",
      title: "Schools",
      count: schools,
      description: "School records, addresses, and contacts",
      actions: [
        { label: "+ New school", href: "/admin/schools/new" },
        { label: "Export schools CSV", href: "/api/exports/schools" },
      ],
    },
    {
      href: "/admin/devices",
      title: "Devices",
      count: devices,
      description: "Manual device entries and profile history",
      actions: [
        { label: "+ New device", href: "/admin/devices/new" },
        { label: "Export devices CSV", href: "/api/exports/devices" },
      ],
    },
    {
      href: "/admin/device-models",
      title: "Device models",
      count: deviceModels,
      description: "Device model catalog, warranty, repair notes",
      actions: [{ label: "+ New model", href: "/admin/device-models#add" }],
    },
    {
      href: "/admin/parts",
      title: "Parts",
      count: parts,
      description: "Parts inventory, stock levels, compatibility",
      actions: [{ label: "+ New part", href: "/admin/parts/new" }],
    },
    {
      href: "/admin/permissions",
      title: "Permissions",
      count: null,
      description: "Customize what each role can access and do",
      actions: [{ label: "View role matrix", href: "/admin/permissions" }],
    },
    {
      href: "/admin/statuses",
      title: "Statuses",
      count: null,
      description: "Configure workflow states, transitions, and SLA thresholds",
      actions: [
        { label: "+ New status", href: "/admin/statuses#add" },
        {
          label: "Reset to defaults",
          formAction: resetStatusConfigAction,
          confirm:
            "Reset all status configs to the seed defaults? Custom labels and thresholds will be lost.",
          destructive: true,
        },
      ],
    },
    {
      href: "/admin/templates",
      title: "Templates",
      count: null,
      description: "Email and notification templates",
      actions: [{ label: "+ New template", href: "/admin/templates#add" }],
    },
    {
      href: "/admin/settings",
      title: "Settings",
      count: null,
      description: "Hold-window, SLA thresholds, digest recipients",
      actions: [
        {
          label: "View change history",
          href: "/admin/audit?entityType=AppSetting",
        },
      ],
    },
    {
      href: "/admin/email-rules",
      title: "Email rules",
      count: null,
      description: "Recipient + template per event",
      actions: [
        { label: "+ New rule", href: "/admin/email-rules#add" },
        { label: "View email log", href: "/admin/email-log" },
      ],
    },
    {
      href: "/admin/email-templates",
      title: "Email templates",
      count: null,
      description: "Pre-seeded notification template library",
      actions: [
        { label: "+ New template", href: "/admin/email-templates#add" },
        { label: "View email log", href: "/admin/email-log" },
      ],
    },
    {
      href: "/admin/email-log",
      title: "Email log",
      count: null,
      description: "Every send with status, recipients, and provider id",
      actions: [
        {
          label: "Export last 30 days CSV",
          href: "/api/exports/email-log",
        },
      ],
    },
    {
      href: "/admin/holidays",
      title: "Holidays",
      count: null,
      description: "Non-business days that exclude from SLA math",
      actions: [
        { label: "+ New holiday", href: "/admin/holidays#add" },
        {
          label: "Auto-seed US federal holidays",
          formAction: seedFederalHolidaysAction,
          confirm:
            "Seed the eleven US federal holidays for the current year? Existing rows on the same date are kept as-is.",
        },
      ],
    },
    {
      href: "/admin/tools/bulk-close",
      title: "Bulk close stale",
      count: null,
      description: "Preview-then-confirm close of long-stuck tickets",
      actions: [{ label: "Preview now", href: "/admin/tools/bulk-close" }],
    },
    {
      href: "/admin/audit",
      title: "Audit log",
      count: null,
      description: "Who did what, when — filterable by entity and actor",
      actions: [
        {
          label: "Export last 7 days CSV",
          href: `/api/exports/audit?from=${ymdDaysAgo(7)}`,
        },
      ],
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
          <div
            key={card.href}
            className="relative rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary"
          >
            <div className="absolute right-2 top-2">
              <AdminCardKebab actions={card.actions} />
            </div>
            <Link
              href={card.href}
              className="block pr-8 focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">{card.title}</div>
                {card.count != null && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {card.count}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {card.description}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

function ymdDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
