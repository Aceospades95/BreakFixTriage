import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { QuoteStatus, TicketPriority, TicketState as TicketStateEnum } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentList } from "@/components/attachment-list";
import { ForceChangeForm } from "@/components/force-change-form";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { allowedNextStates } from "@/lib/workflow";
import { nextActionFor } from "@/lib/workflow/next-action";
import { readStatusConfig } from "@/lib/workflow/status-config";
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
import { recordPartUsageAction } from "@/server/actions/parts";
import {
  createRmaAction,
  markRmaReceivedAction,
  markRmaShippedAction,
} from "@/server/actions/rma";
import {
  startTimerAction,
  stopTimerAction,
} from "@/server/actions/time";
import { mergeTicketAction, unmergeTicketAction } from "@/server/actions/merge";
import { totalMinutesForTicket } from "@/lib/time/time-tracking";
import { formatCents, humanise } from "@/lib/format";
import { EmailSpocButton } from "@/components/tickets/EmailSpocButton";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: { ticketId: string };
  searchParams?: { error?: string; view?: string };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canTransition = can(session.role, PERMISSIONS.TICKETS_TRANSITION);
  const canWrite = can(session.role, PERMISSIONS.TICKETS_WRITE);
  const canWriteQuotes = can(session.role, PERMISSIONS.QUOTES_WRITE);
  const canForceTransition = can(session.role, PERMISSIONS.USERS_MANAGE);

  // Round-12 §1B — canonical URL is /tickets/<incidentNumber>, not
  // /tickets/<cuid>. R5 §2.11 originally went the other direction;
  // R12 reverses it because the cuid leaked into browser history,
  // copy-link sharing, and referrer headers. The lookup accepts
  // both forms, but a cuid hit responds with HTTP 308 to the
  // canonical incidentNumber URL.
  const isCuidParam =
    /^[a-z0-9]{20,}$/i.test(params.ticketId) &&
    !/^(INC|LOCAL|SYN-|LOCAL-RP)/i.test(params.ticketId);
  const isHumanReadableParam = /^(INC|LOCAL|SYN-|LOCAL-RP)/i.test(
    params.ticketId,
  );

  if (isCuidParam) {
    const byId = await prisma.ticket.findUnique({
      where: { id: params.ticketId },
      select: { incidentNumber: true },
    });
    if (!byId) notFound();
    if (byId.incidentNumber) {
      permanentRedirect(`/tickets/${byId.incidentNumber}`);
    }
    // Fall through with the cuid in place if the row has no
    // incident number (legacy data).
  }

  // Round-12 §1B — accept either incidentNumber or cuid. By the
  // time we reach here, a cuid param has already been redirected
  // away (above), but the cuid path is still hit when a ticket
  // has no incidentNumber yet.
  const ticketWhere = isHumanReadableParam
    ? { incidentNumber: params.ticketId.toUpperCase() }
    : { id: params.ticketId };

  const [ticket, assignableUsers, siblingTickets] = await Promise.all([
    prisma.ticket.findUnique({
      where: ticketWhere,
      include: {
        school: {
          include: {
            district: true,
            address: true,
            // Round-6 §3B — count SPOC contacts so the Email SPOC
            // button knows whether to render disabled.
            contacts: {
              where: { receivesTicketEmails: true, email: { not: null } },
              select: { id: true },
            },
          },
        },
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
        partUsages: {
          orderBy: { createdAt: "desc" },
          include: {
            part: { select: { id: true, sku: true, name: true, costCents: true } },
          },
        },
        manufacturerRmas: {
          orderBy: { createdAt: "desc" },
        },
        timeEntries: {
          orderBy: { startedAt: "desc" },
          take: 20,
          include: { user: { select: { id: true, name: true } } },
        },
        mergedInto: {
          select: { id: true, incidentNumber: true },
        },
        mergedFrom: {
          select: { id: true, incidentNumber: true },
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
    Promise.resolve([] as never[]),
  ]);
  if (!ticket) notFound();

  // If the ticket has been merged into another one, bounce to the
  // target so writes don't accidentally land on a closed source.
  // Skip the redirect when the caller explicitly asks to view the
  // source via `?view=source` or arrives with an error toast (e.g.
  // "writes go to the target" — see Merged-in card link).
  if (
    ticket.mergedIntoTicketId &&
    ticket.mergedInto &&
    searchParams?.error == null &&
    searchParams?.view !== "source"
  ) {
    // Round-12 §1B — canonical URL uses incidentNumber, not cuid.
    const targetSlug =
      ticket.mergedInto.incidentNumber ?? ticket.mergedIntoTicketId;
    const url = new URL(`/tickets/${targetSlug}`, "http://local");
    url.searchParams.set(
      "ok",
      `Merged — showing target ${ticket.mergedInto.incidentNumber}`,
    );
    url.searchParams.set("dur", "6000");
    redirect(url.pathname + url.search);
  }

  const totalMinutes = await totalMinutesForTicket(ticket.id);
  const myOpenTimer = ticket.timeEntries.find(
    (e) => e.endedAt == null && e.user?.id === session.userId,
  );

  // Parts compatible with this ticket's device model — shown in the
  // parts usage form so techs pick from a curated list. Falls back to
  // every active part if the device model is unknown.
  const compatibleParts = await prisma.part.findMany({
    where: {
      active: true,
      ...(ticket.device?.modelId
        ? { compatibleModels: { some: { id: ticket.device.modelId } } }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 100,
  });

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
  const spocCount = ticket.school.contacts.length;

  // Load admin status config for the "Change status" dropdown. Labels
  // may be customized and some states disabled — keep those out of the
  // picker.
  const statusConfig = canForceTransition ? await readStatusConfig() : null;
  const allStatesForPicker: { state: TicketStateEnum; label: string }[] =
    statusConfig
      ? (Object.values(TicketStateEnum) as TicketStateEnum[])
          .filter((s) => !statusConfig.disabled.includes(s))
          .filter((s) => s !== ticket.state)
          .map((s) => ({
            state: s,
            // Round-4 §pre-work-2: humanise() canonical surface.
            // Was an inline replace+lowercase+capitalise chain.
            label: statusConfig.labels?.[s] ?? humanise(s),
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
      : [];

  return (
    <>
      <PageHeader
        title={ticket.incidentNumber}
        subtitle={ticket.shortDescription}
        actions={
          <div className="flex items-center gap-2">
            <SlaBadge ticket={ticket} />
            <StatePill state={ticket.state} />
            {canWrite && (
              <EmailSpocButton
                ticketId={ticket.id}
                ticketIncidentNumber={ticket.incidentNumber}
                ticketShortDescription={ticket.shortDescription}
                ticketState={humanise(ticket.state)}
                schoolName={ticket.school.name}
                schoolId={ticket.schoolId}
                hasSpoc={spocCount > 0}
              />
            )}
            <Link
              href={`/tickets/${ticket.id}/print?autoprint=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-surface-border px-2 py-1 text-xs text-slate-200 hover:border-accent hover:text-white"
            >
              Print Work Order
            </Link>
          </div>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {ticket.mergedIntoTicketId && ticket.mergedInto && (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">Read-only: merged source</span>
            <span className="text-amber-200/80">
              This ticket was merged into{" "}
              <Link
                href={`/tickets/${ticket.mergedIntoTicketId}`}
                className="font-medium underline hover:text-amber-50"
              >
                {ticket.mergedInto.incidentNumber}
              </Link>
              . Edits and transitions go to the target.
            </span>
            {canForceTransition && (
              <form
                action={unmergeTicketAction}
                className="ml-auto flex items-center gap-2"
              >
                <input type="hidden" name="sourceTicketId" value={ticket.id} />
                <input
                  type="text"
                  name="reason"
                  placeholder="Reason (optional)"
                  className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs text-amber-100 placeholder:text-amber-200/40 focus:border-amber-300 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-500/30"
                >
                  Un-merge
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {!ticket.mergedIntoTicketId && (() => {
        // Round-18 §2 — answer "now what?" right under the header
        // instead of making operators reverse-engineer the state
        // machine from the transitions card.
        const next = nextActionFor(ticket.state);
        return (
          <div
            data-testid="next-action"
            className="mb-4 flex flex-wrap items-center gap-3 rounded border border-accent/40 bg-accent/5 px-3 py-2.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-slate-100">
                Next: {next.headline}.
              </span>{" "}
              <span className="text-slate-300">{next.body}</span>
            </div>
            {next.cta && (
              <Link
                href={next.cta.href}
                className="shrink-0 rounded border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
              >
                {next.cta.label} →
              </Link>
            )}
          </div>
        );
      })()}

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
                          {humanise(p)}
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
                  humanise(ticket.priority)
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
                          {u.name} ({humanise(u.role)})
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
                <span className="ml-2 font-medium tracking-tight text-xs text-slate-500">
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
                      className="font-medium tracking-tight text-accent hover:underline"
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
              <Dt>ServiceNow ID</Dt>
              <Dd className="font-medium tracking-tight text-xs text-slate-400">
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

          <Card title={`Time logged (${formatHours(totalMinutes)})`}>
            {canWrite && (
              <div className="mb-3 flex items-center gap-2 border-b border-surface-border pb-3">
                {myOpenTimer ? (
                  <form action={stopTimerAction} className="flex items-center gap-2">
                    <input type="hidden" name="entryId" value={myOpenTimer.id} />
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <span className="text-xs text-amber-200">
                      ⏱ running since{" "}
                      {myOpenTimer.startedAt
                        .toISOString()
                        .replace("T", " ")
                        .slice(11, 16)}
                    </span>
                    <input
                      type="text"
                      name="notes"
                      placeholder="notes (optional)"
                      className="w-40 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
                    >
                      Stop timer
                    </button>
                  </form>
                ) : (
                  <form action={startTimerAction} className="flex items-center gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input
                      type="text"
                      name="notes"
                      placeholder="what are you doing? (optional)"
                      className="w-56 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
                    >
                      Start timer
                    </button>
                  </form>
                )}
              </div>
            )}
            {ticket.timeEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No time logged yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ticket.timeEntries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded border border-surface-border bg-surface px-3 py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      {e.user?.name ?? "unknown"}
                      {e.endedAt == null && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                          running
                        </span>
                      )}
                      {e.notes && (
                        <span className="text-xs text-slate-400">
                          · {e.notes}
                        </span>
                      )}
                    </span>
                    <span className="font-medium tracking-tight text-xs text-slate-400">
                      {e.endedAt != null && e.minutes != null
                        ? formatHours(e.minutes)
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
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
          {canForceTransition && allStatesForPicker.length > 0 && (
            <Card title="Change status (admin)">
              <p className="mb-2 text-xs text-slate-400">
                Pick any state. This bypasses the workflow guard and the
                state-machine edge check. A reason is required and the
                change is audited.
              </p>
              {/* Key includes the current state + stateEnteredAt so a
                  successful force change re-mounts the form, clearing
                  every uncontrolled input. Closes findings §3.A6. */}
              <ForceChangeForm
                key={`force-${ticket.state}-${ticket.stateEnteredAt.toISOString()}`}
                ticketId={ticket.id}
                states={allStatesForPicker}
              />
            </Card>
          )}

          <Card title="Available transitions" testId="available-transitions">
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
                        <span className="font-medium tracking-tight tabular-nums">
                          {formatCents(q.amountCents)}
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
                        {(q.status === "SENT" || q.status === "APPROVED") &&
                          q.holdUntil.getTime() <= Date.now() && (
                            <span className="ml-1 text-amber-300">
                              (expired — pending sweep)
                            </span>
                          )}
                      </div>
                    )}
                    {q.notes && (
                      <p className="mt-1 text-xs text-slate-400">{q.notes}</p>
                    )}
                    {q.purchaseOrder && (
                      <div className="mt-2 rounded border border-surface-border bg-surface-muted/40 p-2 text-xs">
                        <div className="font-medium tracking-tight">
                          PO {q.purchaseOrder.poNumber}
                        </div>
                        <div className="tabular-nums text-slate-400">
                          {formatCents(q.purchaseOrder.amountCents)}
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

          <Card title={`Parts used (${ticket.partUsages.length})`}>
            {ticket.partUsages.length === 0 ? (
              <p className="text-sm text-slate-400">No parts used yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ticket.partUsages.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded border border-surface-border bg-surface px-3 py-1.5"
                  >
                    <div>
                      <Link
                        href={`/admin/parts/${u.part.id}`}
                        className="text-accent hover:underline"
                      >
                        {u.part.name}
                      </Link>
                      <span className="ml-2 font-medium tracking-tight text-xs text-slate-500">
                        {u.part.sku}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium tracking-tight text-xs">×{u.quantity}</span>
                      {u.part.costCents != null && (
                        <div className="text-[10px] tabular-nums text-slate-500">
                          {formatCents(u.part.costCents * u.quantity)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canWrite && compatibleParts.length > 0 && (
              <form
                action={recordPartUsageAction}
                className="mt-3 space-y-2 border-t border-surface-border pt-3"
              >
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                  Record part usage
                </label>
                <select
                  name="partId"
                  required
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                >
                  <option value="">— pick a part —</option>
                  {compatibleParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) · {p.onHand} on hand
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    name="quantity"
                    min={1}
                    defaultValue={1}
                    className="w-20 rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex-1 rounded bg-accent px-2 py-1 text-xs font-semibold hover:bg-accent-strong"
                  >
                    Use part
                  </button>
                </div>
              </form>
            )}
            {canWrite && compatibleParts.length === 0 && (
              <p className="mt-3 border-t border-surface-border pt-3 text-xs text-slate-500">
                No compatible parts registered. Add some from{" "}
                <Link href="/admin/parts" className="text-accent hover:underline">
                  /admin/parts
                </Link>
                .
              </p>
            )}
          </Card>

          <Card title={`Manufacturer RMA (${ticket.manufacturerRmas.length})`}>
            {ticket.manufacturerRmas.length === 0 ? (
              <p className="text-sm text-slate-400">
                No RMA records for this ticket.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {ticket.manufacturerRmas.map((rma) => (
                  <li
                    key={rma.id}
                    className="rounded border border-surface-border bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium tracking-tight text-xs">
                        {rma.rmaNumber}
                      </span>
                      <span className="text-xs text-slate-400">
                        {rma.vendor}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {rma.shippedAt ? (
                        <>
                          shipped{" "}
                          {rma.shippedAt.toISOString().slice(0, 10)}
                        </>
                      ) : (
                        <span className="text-amber-300">not shipped</span>
                      )}
                      {rma.receivedAt && (
                        <>
                          {" "}
                          · received{" "}
                          {rma.receivedAt.toISOString().slice(0, 10)}
                        </>
                      )}
                    </div>
                    {(rma.trackingOut || rma.trackingIn) && (
                      <div className="mt-1 font-medium tracking-tight text-[10px] text-slate-500">
                        {rma.trackingOut && <>out: {rma.trackingOut}</>}
                        {rma.trackingIn && (
                          <>
                            {rma.trackingOut ? " · " : ""}in: {rma.trackingIn}
                          </>
                        )}
                      </div>
                    )}
                    {canWrite && !rma.shippedAt && (
                      <form
                        action={markRmaShippedAction}
                        className="mt-2 flex gap-1"
                      >
                        <input type="hidden" name="rmaId" value={rma.id} />
                        <input
                          type="hidden"
                          name="ticketId"
                          value={ticket.id}
                        />
                        <input
                          type="text"
                          name="trackingOut"
                          placeholder="Tracking out"
                          className="flex-1 rounded border border-surface-border bg-surface-muted px-2 py-0.5 text-[10px] focus:border-accent focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded bg-accent px-2 text-[10px] font-semibold hover:bg-accent-strong"
                        >
                          Mark shipped
                        </button>
                      </form>
                    )}
                    {canWrite && rma.shippedAt && !rma.receivedAt && (
                      <form
                        action={markRmaReceivedAction}
                        className="mt-2 flex gap-1"
                      >
                        <input type="hidden" name="rmaId" value={rma.id} />
                        <input
                          type="hidden"
                          name="ticketId"
                          value={ticket.id}
                        />
                        <input
                          type="text"
                          name="trackingIn"
                          placeholder="Tracking in"
                          className="flex-1 rounded border border-surface-border bg-surface-muted px-2 py-0.5 text-[10px] focus:border-accent focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded bg-accent px-2 text-[10px] font-semibold hover:bg-accent-strong"
                        >
                          Mark received
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && ticket.state === "MANUFACTURER_RMA" && (
              <form
                action={createRmaAction}
                className="mt-3 space-y-2 border-t border-surface-border pt-3"
              >
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                  Open new RMA
                </label>
                <input
                  type="text"
                  name="rmaNumber"
                  required
                  placeholder="RMA #"
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  name="vendor"
                  required
                  placeholder="Vendor"
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  name="trackingOut"
                  placeholder="Outbound tracking (optional)"
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-accent px-2 py-1 text-xs font-semibold hover:bg-accent-strong"
                >
                  Create RMA record
                </button>
              </form>
            )}
          </Card>

          {ticket.device?.model?.repairNotes && (
            <Card title={`${ticket.device.model.manufacturer} ${ticket.device.model.modelName} — Repair notes`}>
              <p className="whitespace-pre-wrap text-xs text-slate-300">
                {ticket.device.model.repairNotes}
              </p>
              <div className="mt-2 text-[10px] text-slate-500">
                Shared knowledge base from{" "}
                <Link
                  href={`/admin/device-models/${ticket.device.model.id}`}
                  className="text-accent hover:underline"
                >
                  device models
                </Link>
                .
              </div>
            </Card>
          )}

          {canWrite && ticket.mergedIntoTicketId == null && (
            <Card title="Merge ticket">
              <p className="mb-2 text-xs text-slate-400">
                Fold this ticket into another one. The source closes
                with a comment linking both sides.
              </p>
              <form action={mergeTicketAction} className="space-y-2">
                <input
                  type="hidden"
                  name="sourceTicketId"
                  value={ticket.id}
                />
                <input
                  type="text"
                  name="targetIncidentNumber"
                  required
                  placeholder="Target incident #"
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs font-medium tracking-tight focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  name="reason"
                  placeholder="Reason (optional)"
                  className="w-full rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full rounded border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20"
                >
                  Merge into target
                </button>
              </form>
            </Card>
          )}

          {ticket.mergedFrom.length > 0 && (
            <Card title={`Merged in (${ticket.mergedFrom.length})`}>
              <ul className="text-xs">
                {ticket.mergedFrom.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/tickets/${m.id}?view=source`}
                      className="font-medium tracking-tight text-accent hover:underline"
                    >
                      {m.incidentNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
                          href={`/tickets/${t.incidentNumber}`}
                          className="font-medium tracking-tight text-accent hover:underline"
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
                          href={`/tickets/${t.incidentNumber}`}
                          className="font-medium tracking-tight text-accent hover:underline"
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
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
    >
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
      className={`rounded border px-2 py-0.5 font-medium tracking-tight text-[10px] uppercase tracking-wide ${cls[status]}`}
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

/** Format minutes as "Xh Ym" for readable totals. */
function formatHours(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
