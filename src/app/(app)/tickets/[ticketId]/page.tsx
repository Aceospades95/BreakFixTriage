import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteStatus, TicketPriority } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentList } from "@/components/attachment-list";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { allowedNextStates } from "@/lib/workflow";
import {
  transitionTicketAction,
  updateTicketAction,
} from "@/server/actions/tickets";
import {
  cancelQuoteAction,
  createQuoteAction,
  respondQuoteAction,
  sendQuoteAction,
  updateDraftQuoteAction,
} from "@/server/actions/quotes";

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
  const canWrite = can(session.role, PERMISSIONS.TICKETS_WRITE);
  const canWriteQuotes = can(session.role, PERMISSIONS.QUOTES_WRITE);

  const [ticket, assignableUsers, siblingTickets] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: params.ticketId },
      include: {
        school: { include: { district: true, address: true } },
        device: { include: { model: true } },
        assignee: { select: { id: true, name: true, email: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { actor: { select: { name: true, email: true } } },
        },
        quotes: {
          orderBy: { createdAt: "desc" },
          include: {
            purchaseOrder: true,
            activities: {
              orderBy: { createdAt: "desc" },
              take: 10,
              include: { actor: { select: { name: true } } },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["TECHNICIAN", "WAREHOUSE", "DISPATCHER", "OPS_MANAGER", "ADMIN"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.ticket.findMany({
      where: {
        NOT: { id: params.ticketId },
        OR: [{ schoolId: { in: [] } }],
      },
      take: 0,
    }),
  ]);
  if (!ticket) notFound();

  // Related tickets: same device (if any), same school excluding this ticket.
  const [deviceTickets, schoolOpenTickets] = await Promise.all([
    ticket.deviceId
      ? prisma.ticket.findMany({
          where: { deviceId: ticket.deviceId, NOT: { id: ticket.id } },
          orderBy: { reportedAt: "desc" },
          take: 5,
          select: {
            id: true,
            incidentNumber: true,
            state: true,
            reportedAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.ticket.findMany({
      where: {
        schoolId: ticket.schoolId,
        state: { not: "CLOSED" },
        NOT: { id: ticket.id },
      },
      orderBy: { reportedAt: "desc" },
      take: 5,
      select: {
        id: true,
        incidentNumber: true,
        state: true,
        reportedAt: true,
      },
    }),
  ]);

  void siblingTickets;

  const nextStates = allowedNextStates(ticket.state);
  const returnTo = `/tickets/${ticket.id}`;

  return (
    <>
      <PageHeader
        title={ticket.incidentNumber}
        subtitle={ticket.shortDescription}
        actions={
          <div className="flex items-center gap-2">
            <SlaBadge ticket={ticket} />
            <StatePill state={ticket.state} />
          </div>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <Card title="Details">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <Dt>Reported</Dt>
              <Dd>
                {ticket.reportedAt.toISOString().slice(0, 16).replace("T", " ")}
              </Dd>
              <Dt>Priority</Dt>
              <Dd>
                {canWrite ? (
                  <form action={updateTicketAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <select
                      name="priority"
                      defaultValue={ticket.priority}
                      className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
                    >
                      {Object.values(TicketPriority).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="text-[10px] text-accent hover:underline"
                    >
                      save
                    </button>
                  </form>
                ) : (
                  ticket.priority
                )}
              </Dd>
              <Dt>Assignee</Dt>
              <Dd>
                {canWrite ? (
                  <form action={updateTicketAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <select
                      name="assignedUserId"
                      defaultValue={ticket.assignedUserId ?? ""}
                      className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
                    >
                      <option value="">— unassigned —</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="text-[10px] text-accent hover:underline"
                    >
                      save
                    </button>
                  </form>
                ) : (
                  ticket.assignee?.name ?? (
                    <span className="text-slate-500">—</span>
                  )
                )}
              </Dd>
              <Dt>School</Dt>
              <Dd>
                <Link
                  href={`/admin/schools/${ticket.schoolId}`}
                  className="text-accent hover:underline"
                >
                  {ticket.school.name}
                </Link>
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
                    <Link
                      href={`/admin/devices/${ticket.device.id}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {ticket.device.serialNumber}
                    </Link>
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
              <Dd>
                {canWrite ? (
                  <form action={updateTicketAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <select
                      name="invoiceRequired"
                      defaultValue={String(ticket.invoiceRequired)}
                      className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                    <button
                      type="submit"
                      className="text-[10px] text-accent hover:underline"
                    >
                      save
                    </button>
                  </form>
                ) : (
                  ticket.invoiceRequired ? "Yes" : "No"
                )}
              </Dd>
            </dl>

            {canWrite ? (
              <form
                action={updateTicketAction}
                className="mt-4 space-y-2 border-t border-surface-border pt-3"
              >
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                  Short description
                </label>
                <input
                  type="text"
                  name="shortDescription"
                  defaultValue={ticket.shortDescription}
                  maxLength={500}
                  className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                />
                <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                  Long description
                </label>
                <textarea
                  name="longDescription"
                  rows={4}
                  defaultValue={ticket.longDescription ?? ""}
                  className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
                >
                  Save description
                </button>
              </form>
            ) : (
              ticket.longDescription && (
                <>
                  <div className="mt-4 text-xs uppercase tracking-wide text-slate-400">
                    Description
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                    {ticket.longDescription}
                  </p>
                </>
              )
            )}
          </Card>

          <Card title={`Comments (${ticket.comments.length})`}>
            <CommentThread
              ticketId={ticket.id}
              comments={ticket.comments}
              currentUserId={session.userId}
              currentUserRole={session.role}
              canWrite={canWrite}
            />
          </Card>

          <Card title={`Attachments (${ticket.attachments.length})`}>
            <AttachmentList
              attachments={ticket.attachments}
              ownerKind="TICKET"
              ownerId={ticket.id}
              returnTo={returnTo}
              canWrite={canWrite}
            />
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
                      <input type="hidden" name="ticketId" value={ticket.id} />
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
              <ul className="space-y-3 text-sm">
                {ticket.quotes.map((q) => (
                  <li
                    key={q.id}
                    className="rounded border border-surface-border bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <QuoteStatusPill status={q.status} />
                      {q.amountCents != null ? (
                        <span className="font-mono">
                          ${(q.amountCents / 100).toFixed(2)}
                        </span>
                      ) : q.diagnosticOnly ? (
                        <span className="text-xs text-slate-400">
                          diagnostic
                        </span>
                      ) : null}
                    </div>
                    {q.holdUntil && (
                      <div className="mt-1 text-xs text-slate-500">
                        hold until {q.holdUntil.toISOString().slice(0, 10)}
                        {q.holdUntil.getTime() <= Date.now() && (
                          <span className="ml-1 text-amber-300">
                            (expired)
                          </span>
                        )}
                      </div>
                    )}
                    {q.notes && (
                      <p className="mt-1 text-xs text-slate-400">{q.notes}</p>
                    )}
                    {q.purchaseOrder && (
                      <div className="mt-2 rounded border border-surface-border bg-surface-muted/40 p-2 text-xs">
                        <div className="font-mono">
                          PO {q.purchaseOrder.poNumber}
                        </div>
                        <div className="text-slate-400">
                          ${(q.purchaseOrder.amountCents / 100).toFixed(2)}
                          {q.purchaseOrder.invoicedAt && (
                            <>
                              {" "}
                              · invoiced{" "}
                              {q.purchaseOrder.invoicedAt
                                .toISOString()
                                .slice(0, 10)}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {canWriteQuotes && (
                      <QuoteActions
                        ticketId={ticket.id}
                        quoteId={q.id}
                        status={q.status}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canWriteQuotes && ticket.state === "QUOTE_REQUIRED" && (
              <form
                action={createQuoteAction}
                className="mt-3 space-y-2 border-t border-surface-border pt-3 text-sm"
              >
                <input type="hidden" name="ticketId" value={ticket.id} />
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  New quote
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Amount ($)
                  </span>
                  <input
                    type="text"
                    name="amount"
                    inputMode="decimal"
                    placeholder="199.00"
                    className="rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    name="diagnosticOnly"
                    className="accent-accent"
                  />
                  Diagnostic only
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Internal notes"
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-accent px-2 py-1 text-xs font-semibold hover:bg-accent-strong"
                >
                  Create draft quote
                </button>
              </form>
            )}
          </Card>

          {(deviceTickets.length > 0 || schoolOpenTickets.length > 0) && (
            <Card title="Related">
              {deviceTickets.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                    Same device
                  </div>
                  <ul className="space-y-0.5">
                    {deviceTickets.map((t) => (
                      <li key={t.id} className="truncate text-xs">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="font-mono text-accent hover:underline"
                        >
                          {t.incidentNumber}
                        </Link>{" "}
                        <StatePill state={t.state} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {schoolOpenTickets.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                    Other open tickets at this school
                  </div>
                  <ul className="space-y-0.5">
                    {schoolOpenTickets.map((t) => (
                      <li key={t.id} className="truncate text-xs">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="font-mono text-accent hover:underline"
                        >
                          {t.incidentNumber}
                        </Link>{" "}
                        <StatePill state={t.state} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

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

function QuoteStatusPill({ status }: { status: QuoteStatus }) {
  const cls: Record<QuoteStatus, string> = {
    DRAFT: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    SENT: "bg-violet-500/20 text-violet-200 border-violet-500/40",
    APPROVED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    DECLINED: "bg-red-500/20 text-red-200 border-red-500/40",
    NO_RESPONSE: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    CANCELLED: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${cls[status]}`}
    >
      {status}
    </span>
  );
}

function QuoteActions({
  ticketId,
  quoteId,
  status,
}: {
  ticketId: string;
  quoteId: string;
  status: QuoteStatus;
}) {
  if (status === "DRAFT") {
    return (
      <div className="mt-3 space-y-2 border-t border-surface-border pt-2">
        <form
          action={sendQuoteAction}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Hold days
            </span>
            <input
              type="number"
              name="holdDays"
              min={0}
              max={90}
              defaultValue={7}
              className="w-16 rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-accent px-2 py-1 text-xs font-semibold hover:bg-accent-strong"
          >
            Send quote
          </button>
        </form>
        <form
          action={updateDraftQuoteAction}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              New amount
            </span>
            <input
              type="text"
              name="amount"
              inputMode="decimal"
              placeholder="$"
              className="w-24 rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-surface-border px-2 py-1 text-xs hover:border-accent"
          >
            Save draft
          </button>
        </form>
        <form action={cancelQuoteAction}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <button
            type="submit"
            className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
          >
            Cancel quote
          </button>
        </form>
      </div>
    );
  }
  if (status === "SENT") {
    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-surface-border pt-2">
        <form action={respondQuoteAction}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="response" value="APPROVED" />
          <button
            type="submit"
            className="rounded bg-emerald-500/80 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Mark approved
          </button>
        </form>
        <form action={respondQuoteAction}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="response" value="DECLINED" />
          <button
            type="submit"
            className="rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20"
          >
            Mark declined
          </button>
        </form>
        <form action={cancelQuoteAction}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <button
            type="submit"
            className="rounded border border-surface-border px-2 py-1 text-xs hover:border-accent"
          >
            Cancel
          </button>
        </form>
      </div>
    );
  }
  return null;
}
