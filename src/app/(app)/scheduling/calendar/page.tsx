import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Month calendar view of routes.
 *
 * Shows every route whose date falls inside the selected month,
 * keyed by day. Each cell lists the driver and stop count; clicking
 * a route opens its detail page. Navigate with ?month=YYYY-MM in
 * the URL.
 */
export default async function SchedulingCalendarPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  await requireRole(PERMISSIONS.SCHEDULING_READ);

  const now = new Date();
  const param = searchParams?.month;
  const match = param?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? parseInt(match[1]!, 10) : now.getUTCFullYear();
  const monthIdx = match ? parseInt(match[2]!, 10) - 1 : now.getUTCMonth();

  const start = new Date(Date.UTC(year, monthIdx, 1));
  const end = new Date(Date.UTC(year, monthIdx + 1, 1));
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const routes = await prisma.route.findMany({
    where: { date: { gte: start, lt: end } },
    include: {
      assignee: { select: { name: true } },
      stops: { select: { id: true } },
    },
    orderBy: { date: "asc" },
  });

  const byDay = new Map<number, typeof routes>();
  for (const r of routes) {
    const d = r.date.getUTCDate();
    const bucket = byDay.get(d) ?? [];
    bucket.push(r);
    byDay.set(d, bucket);
  }

  const prevMonth =
    monthIdx === 0
      ? `${year - 1}-12`
      : `${year}-${String(monthIdx).padStart(2, "0")}`;
  const nextMonth =
    monthIdx === 11
      ? `${year + 1}-01`
      : `${year}-${String(monthIdx + 2).padStart(2, "0")}`;

  const firstWeekday = start.getUTCDay(); // 0=Sun

  // Build a grid of 42 cells (6 weeks × 7 days) so the layout stays
  // stable regardless of month length.
  const cells: { day: number | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length < 42) cells.push({ day: null });

  const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <>
      <div className="mb-2">
        <Link
          href="/scheduling"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-white"
        >
          ← Back to scheduling
        </Link>
      </div>

      <PageHeader
        title="Route calendar"
        subtitle={monthLabel}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/scheduling/calendar?month=${prevMonth}`}
              className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
            >
              ← {prevMonth}
            </Link>
            <Link
              href="/scheduling/calendar"
              className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
            >
              Today
            </Link>
            <Link
              href={`/scheduling/calendar?month=${nextMonth}`}
              className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
            >
              {nextMonth} →
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-7 gap-px rounded-lg border border-surface-border bg-surface-border text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-surface-muted px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          >
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (cell.day == null) {
            return <div key={i} className="min-h-[100px] bg-surface/40" />;
          }
          const dayRoutes = byDay.get(cell.day) ?? [];
          const isToday =
            cell.day === now.getUTCDate() &&
            monthIdx === now.getUTCMonth() &&
            year === now.getUTCFullYear();
          return (
            <div
              key={i}
              className={`min-h-[100px] space-y-1 p-1.5 ${isToday ? "bg-accent/5 ring-1 ring-accent/60" : "bg-surface-muted/60"}`}
            >
              <div className="text-[10px] font-medium tracking-tight text-slate-400">
                {cell.day}
              </div>
              {dayRoutes.slice(0, 4).map((r) => (
                <Link
                  key={r.id}
                  href={`/scheduling/routes/${r.id}`}
                  className="block rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] leading-tight transition hover:border-accent"
                >
                  <div className="truncate font-medium">{r.assignee.name}</div>
                  <div className="text-slate-500">
                    {r.stops.length} stop{r.stops.length === 1 ? "" : "s"} ·{" "}
                    {r.status}
                  </div>
                </Link>
              ))}
              {dayRoutes.length > 4 && (
                <div className="text-[10px] text-slate-500">
                  +{dayRoutes.length - 4} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
