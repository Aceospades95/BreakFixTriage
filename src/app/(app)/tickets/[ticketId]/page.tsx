import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { allowedNextStates } from "@/lib/workflow";
import { transitionTicketAction } from "@/server/actions/tickets";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: { ticketId: string };
  searchParams?: { error?: string };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canTransition = can(session.role, PERMISSIONS.TICKETS_TRANSITION);

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.ticketId },
    include: {
      school: { include: { district: true, address: true } },
      device: { include: { model: true } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true, email: true } } },
      },
      quotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!ticket) notFound();

  const nextStates = allowedNextStates(ticket.state);

  return (
    <>
      <PageHeader
        title={ticket.incidentNumber}
        subtitle={ticket.shortDescription}
        actions={<StatePill state={ticket.state} />}
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <Card title="Summary">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <Dt>Reported</Dt>
              <Dd>{ticket.reportedAt.toISOString().slice(0, 16).replace("T", " ")}</Dd>
              <Dt>Priority</Dt>
              <Dd>{ticket.priority}</Dd>
              <Dt>School</Dt>
              <Dd>
                {ticket.school.name}
                <span className="ml-2 font-mono text-xs text-slate-500">
                  {ticket.school.code}
                </span>
                <div className="text-xs text-slate-500">
                  {ticket.school.district.name}
                </div>
              </Dd>
              <Dt>Device</Dt>
              <Dd>
                {ticket.device ? (
                  <>
                    <span className="font-mono">
                      {ticket.device.serialNumber}
                    </span>
                    {ticket.device.model && (
                      <div className="text-xs text-slate-500">
                        {ticket.device.model.manufacturer}{" "}
                        {ticket.device.model.modelName}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </Dd>
              <Dt>ServiceNow sys_id</Dt>
              <Dd className="font-mono text-xs text-slate-400">
                {ticket.serviceNowSysId ?? "—"}
              </Dd>
              <Dt>Invoice required</Dt>
              <Dd>{ticket.invoiceRequired ? "Yes" : "No"}</Dd>
            </dl>

            {ticket.longDescription && (
              <>
                <div className="mt-4 text-xs uppercase tracking-wide text-slate-400">
                  Description
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                  {ticket.longDescription}
                </p>
              </>
            )}
          </Card>

          <Card title="Event timeline">
            {ticket.events.length === 0 ? (
              <p className="text-sm text-slate-400">
                No events yet. This ticket has not transitioned.
              </p>
            ) : (
              <ol className="space-y-3">
                {ticket.events.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded border border-surface-border bg-surface px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {ev.fromState && <StatePill state={ev.fromState} />}
                      <span className="text-slate-400">→</span>
                      <StatePill state={ev.toState} />
                      <span className="ml-auto text-[10px] text-slate-500">
                        {ev.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                      </span>
                    </div>
                    {ev.reason && (
                      <div className="mt-1 text-sm text-slate-300">
                        {ev.reason}
                      </div>
                    )}
                    {ev.actor && (
                      <div className="mt-1 text-xs text-slate-500">
                        by {ev.actor.name}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>

        <aside className="space-y-6">
          <Card title="Available transitions">
            {!canTransition ? (
              <p className="text-sm text-slate-400">
                Your role cannot transition tickets.
              </p>
            ) : nextStates.length === 0 ? (
              <p className="text-sm text-slate-400">
                This ticket is in a terminal state.
              </p>
            ) : (
              <ul className="space-y-2">
                {nextStates.map((to) => (
                  <li key={to}>
                    <form
                      action={transitionTicketAction}
                      className="flex flex-col gap-2 rounded border border-surface-border bg-surface p-2"
                    >
                      <input
                        type="hidden"
                        name="ticketId"
                        value={ticket.id}
                      />
                      <input type="hidden" name="to" value={to} />
                      <div className="flex items-center justify-between gap-2">
                        <StatePill state={to} />
                        <button
                          type="submit"
                          className="rounded bg-accent px-2 py-1 text-xs font-semibold hover:bg-accent-strong"
                        >
                          Apply
                        </button>
                      </div>
                      <input
                        type="text"
                        name="reason"
                        placeholder="Reason (optional)"
                        className="rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                      />
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Quotes">
            {ticket.quotes.length === 0 ? (
              <p className="text-sm text-slate-400">No quotes yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {ticket.quotes.map((q) => (
                  <li
                    key={q.id}
                    className="rounded border border-surface-border bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{q.status}</span>
                      {q.amountCents != null && (
                        <span>${(q.amountCents / 100).toFixed(2)}</span>
                      )}
                    </div>
                    {q.holdUntil && (
                      <div className="text-xs text-slate-500">
                        hold until {q.holdUntil.toISOString().slice(0, 10)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Link
            href="/tickets"
            className="block rounded border border-surface-border px-3 py-2 text-center text-sm text-slate-300 hover:border-accent"
          >
            ← Back to tickets
          </Link>
        </aside>
      </div>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted/60 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs uppercase tracking-wide text-slate-500">{children}</dt>;
}
function Dd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <dd className={`text-slate-200 ${className}`}>{children}</dd>;
}
