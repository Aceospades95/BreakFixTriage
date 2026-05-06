import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

export default async function SchedulingCalendarPage({
  searchParams,
}: {
  searchParams?: { month?: string; date?: string; view?: string };
}) {
  await requireRole(PERMISSIONS.SCHEDULING_READ);

  const view: View =
    searchParams?.view === "day"
      ? "day"
      : searchParams?.view === "week"
        ? "week"
        : "month";

  const now = new Date();

  if (view === "day") {
    return await renderDay(searchParams?.date, now);
  }
  if (view === "week") {
    return await renderWeek(searchParams?.date, now);
  }
  return await renderMonth(searchParams?.month, now);
}

function ViewSwitcher({
  view,
  anchor,
}: {
  view: View;
  anchor: string;
}) {
  const opts: { key: View; label: string; href: string }[] = [
    { key: "day", label: "Day", href: `/scheduling/calendar?view=day&date=${anchor}` },
    { key: "week", label: "Week", href: `/scheduling/calendar?view=week&date=${anchor}` },
    { key: "month", label: "Month", href: `/scheduling/calendar?view=month&month=${anchor.slice(0, 7)}` },
  ];
  return (
    <div className="inline-flex items-center gap-px rounded-lg border border-surface-border bg-surface-muted p-0.5 text-xs">
      {opts.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          className={`rounded px-3 py-1.5 ${
            view === o.key
              ? "bg-accent text-white"
              : "text-slate-300 hover:bg-surface"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function parseISODate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  const d = new Date(
    Date.UTC(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10)),
  );
  return Number.isFinite(d.getTime()) ? d : fallback;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function renderDay(dateParam: string | undefined, now: Date) {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = parseISODate(dateParam, today);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  const prev = new Date(day.getTime() - 24 * 60 * 60 * 1000);

  const routes = await prisma.route.findMany({
    where: { date: { gte: day, lt: next } },
    include: {
      assignee: { select: { name: true } },
      stops: {
        select: {
          id: true,
          sequence: true,
          job: { select: { school: { select: { name: true } } } },
        },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: { date: "asc" },
  });

  const dayLabel = day.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
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
        subtitle={dayLabel}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ViewSwitcher view="day" anchor={ymd(day)} />
            <div className="flex items-center gap-2 text-sm">
              <Link
                href={`/scheduling/calendar?view=day&date=${ymd(prev)}`}
                className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
              >
                ← {ymd(prev)}
              </Link>
              <Link
                href={`/scheduling/calendar?view=day`}
                className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
              >
                Today
              </Link>
              <Link
                href={`/scheduling/calendar?view=day&date=${ymd(next)}`}
                className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
              >
                {ymd(next)} →
              </Link>
            </div>
          </div>
        }
      />

      {routes.length === 0 ? (
        <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-10 text-center text-sm text-slate-400">
          No routes scheduled for {ymd(day)}.
        </div>
      ) : (
        <ul className="space-y-2">
          {routes.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/scheduling/routes/${r.id}`}
                  className="font-semibold text-accent hover:underline"
                >
                  {r.assignee.name}
                </Link>
                <span className="text-xs text-slate-400">
                  {r.stops.length} stop{r.stops.length === 1 ? "" : "s"} ·{" "}
                  {humanise(r.status)}
                </span>
              </div>
              {r.stops.length > 0 && (
                <ol className="mt-2 list-inside list-decimal text-xs text-slate-300">
                  {r.stops.map((s) => (
                    <li key={s.id}>{s.job.school.name}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function renderWeek(dateParam: string | undefined, now: Date) {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const anchor = parseISODate(dateParam, today);
  const dow = anchor.getUTCDay();
  const start = new Date(anchor.getTime() - dow * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const prevWeek = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const routes = await prisma.route.findMany({
    where: { date: { gte: start, lt: end } },
    include: {
      assignee: { select: { name: true } },
      stops: { select: { id: true } },
    },
    orderBy: { date: "asc" },
  });

  const byDay = new Map<string, typeof routes>();
  for (const r of routes) {
    const k = ymd(r.date);
    const bucket = byDay.get(k) ?? [];
    bucket.push(r);
    byDay.set(k, bucket);
  }

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(start.getTime() + i * 24 * 60 * 60 * 1000));
  }

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
        subtitle={`Week of ${ymd(start)}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ViewSwitcher view="week" anchor={ymd(anchor)} />
            <div className="flex items-center gap-2 text-sm">
              <Link
                href={`/scheduling/calendar?view=week&date=${ymd(prevWeek)}`}
                className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
              >
                ← prev
              </Link>
              <Link
                href={`/scheduling/calendar?view=week`}
                className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
              >
                This week
              </Link>
              <Link
                href={`/scheduling/calendar?view=week&date=${ymd(nextWeek)}`}
                className="rounded border border-border px-3 py-1.5 transition hover:border-primary"
              >
                next →
              </Link>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-7 gap-px rounded-lg border border-surface-border bg-surface-border text-xs">
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className="bg-surface-muted px-2 py-2 text-center text-[10px] font-semibold tracking-wide text-slate-300"
          >
            {d.toLocaleDateString(undefined, {
              weekday: "short",
              timeZone: "UTC",
            })}
            <div className="text-slate-500">{d.getUTCDate()}</div>
          </div>
        ))}
        {days.map((d) => {
          const dayRoutes = byDay.get(ymd(d)) ?? [];
          const isToday = ymd(d) === ymd(today);
          return (
            <div
              key={`col-${d.toISOString()}`}
              className={`min-h-[160px] space-y-1 p-1.5 ${
                isToday
                  ? "bg-accent/5 ring-1 ring-accent/60"
                  : "bg-surface-muted/60"
              }`}
            >
              {dayRoutes.length === 0 ? (
                <div className="text-[10px] text-slate-500">—</div>
              ) : (
                dayRoutes.map((r) => (
                  <Link
                    key={r.id}
                    href={`/scheduling/routes/${r.id}`}
                    className="block rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] leading-tight transition hover:border-accent"
                  >
                    <div className="truncate font-medium">
                      {r.assignee.name}
                    </div>
                    <div className="text-slate-500">
                      {r.stops.length} stop
                      {r.stops.length === 1 ? "" : "s"} · {humanise(r.status)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

async function renderMonth(monthParam: string | undefined, now: Date) {
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
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

  const firstWeekday = start.getUTCDay();

  const cells: { day: number | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length < 42) cells.push({ day: null });

  const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  const anchorYmd = `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;

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
          <div className="flex flex-wrap items-center gap-3">
            <ViewSwitcher view="month" anchor={anchorYmd} />
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
          </div>
        }
      />

      <div className="grid grid-cols-7 gap-px rounded-lg border border-surface-border bg-surface-border text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-surface-muted px-2 py-2 text-center text-[10px] font-semibold tracking-wide text-slate-300"
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
                    {humanise(r.status)}
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
