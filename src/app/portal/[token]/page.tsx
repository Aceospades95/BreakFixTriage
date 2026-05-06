import { notFound } from "next/navigation";
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
 * Shows: all open tickets plus the last 20 closed tickets for the
 * school. No ticket detail page, no attachments, no comments — the
 * goal is "let the school's IT lead see status without calling us",
 * not "give them a full operator UI".
 */
export default async function PortalPage({
  params,
}: {
  params: { token: string };
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

  const [openTickets, closedTickets, counts] = await Promise.all([
    prisma.ticket.findMany({
      where: { schoolId: resolved.schoolId, state: { not: "CLOSED" } },
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
          <Kpi label="Open Tickets" value={totalOpen} />
          <Kpi
            label="In Warehouse"
            value={
              counts.find((c) => c.state === "IN_WAREHOUSE")?._count._all ?? 0
            }
          />
          <Kpi
            label="Awaiting Delivery"
            value={
              (counts.find((c) => c.state === "PENDING_DELIVERY")?._count._all ?? 0) +
              (counts.find((c) => c.state === "DELIVERY_SCHEDULED")?._count._all ?? 0)
            }
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-200">
            Open Tickets ({openTickets.length})
          </h2>
          {openTickets.length === 0 ? (
            <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
              No open tickets for your school. 🎉
            </div>
          ) : (
            <ul className="space-y-2">
              {openTickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
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
                  className="flex items-center gap-3 rounded border border-surface-border bg-surface-muted/40 px-3 py-1.5"
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

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted p-4">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
