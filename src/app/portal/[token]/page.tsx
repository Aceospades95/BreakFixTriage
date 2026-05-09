import Link from "next/link";
import { notFound } from "next/navigation";
import type { TicketState } from "@prisma/client";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { resolvePortalToken } from "@/lib/portal/tokens";

export const dynamic = "force-dynamic";

/**
 * Public school status portal.
 *
 * Lives outside the (app) layout and is whitelisted in the
 * middleware matcher, so it renders without a signed-in session.
 * Access is gated entirely on a cryptographically random magic-link
 * token created by an admin on the school profile page.
 *
 * Round-6 §2F — KPI tiles with a meaningful drill-down become
 * `<Link>` anchors with a `?status=...` query param the open-tickets
 * list filters by. Tiles without a drill-down (and the totals tile,
 * which already shows everything) stay as plain `<div>`s with
 * `cursor: default`.
 */

const STATUS_FILTERS: Record<
  string,
  { label: string; states: TicketState[] }
> = {
  open: {
    label: "Open Tickets",
    states: [], // empty list = "all open" (state != CLOSED)
  },
  "in-warehouse": {
    label: "In Warehouse",
    states: ["IN_WAREHOUSE"],
  },
  "awaiting-delivery": {
    label: "Awaiting Delivery",
    states: ["PENDING_DELIVERY", "DELIVERY_SCHEDULED"],
  },
  "in-repair": {
    label: "Devices in Repair",
    states: ["IN_REPAIR", "DIAGNOSIS"],
  },
};

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { status?: string };
}) {
  const resolved = await resolvePortalToken(params.token);
  if (!resolved) return notFound();

  const school = await prisma.school.findUnique({
    where: { id: resolved.schoolId },
    include: {
      district: { select: { name: true } },
    },
  });
  if (!school) return notFound();

  const filterKey = searchParams?.status ?? null;
  const filter = filterKey ? STATUS_FILTERS[filterKey] : null;

  const openWhereStateClause =
    filter && filter.states.length > 0
      ? { in: filter.states }
      : { not: "CLOSED" as TicketState };

  const [openTickets, closedTickets, counts] = await Promise.all([
    prisma.ticket.findMany({
      where: { schoolId: resolved.schoolId, state: openWhereStateClause },
      orderBy: { reportedAt: "desc" },
      include: {
        device: { select: { serialNumber: true, assetTag: true } },
      },
      take: 200,
    }),
    prisma.ticket.findMany({
      where: { schoolId: resolved.schoolId, state: "CLOSED" },
      orderBy: { closedAt: "desc" },
      include: {
        device: { select: { serialNumber: true, assetTag: true } },
      },
      take: 20,
    }),
    prisma.ticket.groupBy({
      by: ["state"],
      where: { schoolId: resolved.schoolId, state: { not: "CLOSED" } },
      _count: { _all: true },
    }),
  ]);

  const totalOpen = counts.reduce((a, c) => a + c._count._all, 0);
  const inRepair =
    (counts.find((c) => c.state === "IN_REPAIR")?._count._all ?? 0) +
    (counts.find((c) => c.state === "DIAGNOSIS")?._count._all ?? 0);
  const awaitingDelivery =
    (counts.find((c) => c.state === "PENDING_DELIVERY")?._count._all ?? 0) +
    (counts.find((c) => c.state === "DELIVERY_SCHEDULED")?._count._all ?? 0);
  const inWarehouse =
    counts.find((c) => c.state === "IN_WAREHOUSE")?._count._all ?? 0;

  const listHeading = filter
    ? `${filter.label} (${openTickets.length})`
    : `Open Tickets (${openTickets.length})`;

  return (
    <div className="min-h-screen bg-surface text-slate-200">
      <header className="border-b border-surface-border bg-surface-muted/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="text-xs tracking-wide text-slate-400">
            BreakFix Triage · status portal
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {school.name}
          </h1>
          <div className="text-sm text-slate-400">
            {school.district.name}
            {resolved.label && (
              <>
                <span className="mx-2">·</span>
                <span className="text-slate-500">{resolved.label}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <KpiLink
            label="Open Tickets"
            value={totalOpen}
            href={`/portal/${params.token}?status=open`}
            active={filterKey === "open" || filterKey == null}
          />
          <KpiLink
            label="In Warehouse"
            value={inWarehouse}
            href={`/portal/${params.token}?status=in-warehouse`}
            active={filterKey === "in-warehouse"}
          />
          <KpiLink
            label="Awaiting Delivery"
            value={awaitingDelivery}
            href={`/portal/${params.token}?status=awaiting-delivery`}
            active={filterKey === "awaiting-delivery"}
          />
        </section>

        {inRepair > 0 && (
          <section className="mb-6">
            <KpiLink
              label="Devices in Repair"
              value={inRepair}
              href={`/portal/${params.token}?status=in-repair`}
              active={filterKey === "in-repair"}
              compact
            />
          </section>
        )}

        {filter && (
          <div className="mb-4 flex items-center gap-3 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
            <span>
              Filtered: <strong>{filter.label}</strong>
            </span>
            <Link
              href={`/portal/${params.token}`}
              className="ml-auto text-slate-400 hover:text-slate-200"
            >
              clear
            </Link>
          </div>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-200">
            {listHeading}
          </h2>
          {openTickets.length === 0 ? (
            <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
              {filter
                ? "No tickets match this filter."
                : "No open tickets for your school."}
            </div>
          ) : (
            <ul className="space-y-2">
              {openTickets.map((t) => (
                <li
                  key={t.id}
                  id={`ticket-${t.incidentNumber}`}
                  className="scroll-mt-20 rounded-lg border border-surface-border bg-surface-muted/60 focus-within:border-accent"
                >
                  {/* Round-7 §2F — wrap the card body in an anchor so
                      keyboard nav (Tab) reaches each ticket and screen
                      readers announce them as a link rather than plain
                      text. The anchor target is the same card's id —
                      a token-scoped read-only detail page is filed for
                      R8 (see docs/round-7-backlog.md). */}
                  <a
                    href={`#ticket-${t.incidentNumber}`}
                    className="block rounded-lg p-4 hover:bg-surface-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`Ticket ${t.incidentNumber}`}
                  >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium tracking-tight text-sm text-accent">
                      {t.incidentNumber}
                    </span>
                    <StatePill state={t.state} />
                    {t.device && (
                      <span className="font-medium tracking-tight text-xs text-slate-500">
                        {t.device.assetTag ?? t.device.serialNumber}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-slate-500">
                      reported {t.reportedAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    {t.shortDescription}
                  </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-200">
            Recently Closed ({closedTickets.length})
          </h2>
          {closedTickets.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing closed recently.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {closedTickets.map((t) => (
                <li
                  key={t.id}
                  id={`ticket-${t.incidentNumber}`}
                  className="scroll-mt-20 rounded border border-surface-border bg-surface-muted/40 focus-within:border-accent"
                >
                  <a
                    href={`#ticket-${t.incidentNumber}`}
                    className="flex items-center gap-3 rounded px-3 py-1.5 hover:bg-surface-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`Ticket ${t.incidentNumber} (closed)`}
                  >
                    <span className="font-medium tracking-tight text-xs text-slate-400">
                      {t.incidentNumber}
                    </span>
                    {t.device && (
                      <span className="font-medium tracking-tight text-xs text-slate-500">
                        {t.device.assetTag ?? t.device.serialNumber}
                      </span>
                    )}
                    <span className="flex-1 truncate text-slate-300">
                      {t.shortDescription}
                    </span>
                    <span className="text-xs text-slate-500">
                      closed {t.closedAt?.toISOString().slice(0, 10) ?? "—"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 border-t border-surface-border pt-4 text-center text-xs text-slate-500">
          Questions? Contact your break-fix operations team. This link is
          valid until an administrator revokes it.
        </footer>
      </main>
    </div>
  );
}

function KpiLink({
  label,
  value,
  href,
  active,
  compact = false,
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
  compact?: boolean;
}) {
  // Round-6 §2F — every KPI tile is a real <Link> with focus ring.
  // `active` outlines the currently-applied filter so the user sees
  // their selection.
  const baseCls =
    "block rounded-lg border bg-surface-muted p-4 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const stateCls = active
    ? "border-accent/60 bg-accent/10"
    : "border-surface-border hover:border-accent";
  return (
    <Link href={href} className={`${baseCls} ${stateCls}`}>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div
        className={`${compact ? "mt-0 text-xl" : "mt-1 text-3xl"} font-semibold tabular-nums`}
      >
        {value}
      </div>
    </Link>
  );
}
