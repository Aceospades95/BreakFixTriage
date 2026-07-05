import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { LocalTime } from "@/components/local-time";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import { formatAuditAction } from "@/lib/audit/format";
import {
  getExceptionCounts,
  FIELD_OUTCOME_WHERE,
  STUCK_IMPORT_THRESHOLD_MS,
  TOKEN_EXPIRY_WINDOW_MS,
  SEVERITY_WINDOW_MS,
  IMPORTED_BACKLOG_THRESHOLD_MS,
} from "@/lib/exceptions/counts";
import { requeueDeadLetteredEmailJobAction } from "@/server/actions/email-admin";
import { acknowledgeExceptionAction } from "@/server/actions/exceptions";

export const dynamic = "force-dynamic";

/**
 * Round-15 — Ops Exceptions dashboard (graduates backlog B26).
 *
 * One page that surfaces everything quietly going wrong: the
 * failure modes that otherwise only show up when someone happens
 * to look at the right detail page. Each section shows a count, a
 * short list of the most recent offenders, and a deep link to the
 * surface where the fix happens.
 *
 * Section definitions are deliberately conservative — every row
 * here is actionable, not informational.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams?: { ok?: string; error?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const now = Date.now();
  // Counts come from the shared module (also the topbar badge's
  // source — D2) so the two surfaces can never disagree; the detail
  // queries below only fetch the visible top-8 rows per section.
  const [
    counts,
    failedEmails,
    deadJobs,
    failedMerges,
    dupConflicts,
    dupSynthetics,
    orphanStopDevices,
    stuckImports,
    expiredTokens,
    expiringTokens,
    importedBacklog,
    severeAudits,
    fieldOutcomes,
  ] = await Promise.all([
    getExceptionCounts(),
    prisma.emailLog.findMany({
      where: { status: "failed" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { ticket: { select: { incidentNumber: true } } },
    }),
    prisma.emailJob.findMany({
      where: { status: "failed" },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: ["snow-merge.failed", "snow-merge.cross-school-collision"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    // QA audit BUG-1 — the duplicate queue's two work-item kinds,
    // matching the /duplicates page definition exactly.
    prisma.duplicateConflict.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "asc" },
      take: 4,
      include: {
        leftTicket: { select: { incidentNumber: true } },
        rightTicket: { select: { incidentNumber: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { state: "PENDING_PICKUP_UNLINKED" },
      orderBy: { reportedAt: "asc" },
      take: 4,
      select: {
        id: true,
        incidentNumber: true,
        reportedAt: true,
        school: { select: { name: true } },
      },
    }),
    prisma.stopDevice.findMany({
      // Removed rows stay for audit and aren't orphans to act on.
      where: { ticketId: null, removedAt: null },
      orderBy: { addedAt: "desc" },
      take: 8,
      include: {
        device: { select: { serialNumber: true } },
        stop: { select: { routeId: true } },
      },
    }),
    prisma.importBatch.findMany({
      where: {
        status: { in: ["PENDING", "VALIDATING", "COMMITTING"] },
        createdAt: { lt: new Date(now - STUCK_IMPORT_THRESHOLD_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
    // QA audit BUG-2 — expired and expiring-soon are separate
    // urgencies: expired needs reissue NOW.
    prisma.portalToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { not: null, lt: new Date(now) },
      },
      orderBy: { expiresAt: "asc" },
      take: 8,
      include: { school: { select: { name: true, id: true } } },
    }),
    prisma.portalToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          not: null,
          gte: new Date(now),
          lt: new Date(now + TOKEN_EXPIRY_WINDOW_MS),
        },
      },
      orderBy: { expiresAt: "asc" },
      take: 8,
      include: { school: { select: { name: true, id: true } } },
    }),
    // QA audit BUG-5 — the triage backlog: oldest first, these are
    // the tickets nobody has started work on.
    prisma.ticket.findMany({
      where: {
        state: "IMPORTED",
        stateEnteredAt: {
          lt: new Date(now - IMPORTED_BACKLOG_THRESHOLD_MS),
        },
      },
      orderBy: { stateEnteredAt: "asc" },
      take: 8,
      select: {
        id: true,
        incidentNumber: true,
        stateEnteredAt: true,
        school: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        severity: { in: ["warn", "critical"] },
        createdAt: { gte: new Date(now - SEVERITY_WINDOW_MS) },
        acknowledgedAt: null,
        entityType: { not: "RouteStop" },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    // Round-22 §2 — field outcomes: failed / partial stops + proof
    // overrides, with the actor and the routeId (stored on `after`) for
    // a deep link into the stop.
    prisma.auditLog.findMany({
      where: { ...FIELD_OUTCOME_WHERE },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const failedEmailCount = counts.failedEmails;
  const deadJobCount = counts.deadJobs;
  const failedMergeCount = counts.failedMerges;
  const orphanCount = counts.orphanStopDevices;
  const totalExceptions = counts.total;

  return (
    <>
      <PageHeader
        title="Exceptions"
        subtitle={
          totalExceptions === 0
            ? "Nothing needs attention — every monitored failure mode is clear."
            : `${totalExceptions} item${totalExceptions === 1 ? "" : "s"} across the monitored failure modes below.`
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Failed email dispatches"
          count={failedEmailCount}
          extra={
            deadJobCount > 0
              ? `+ ${deadJobCount} dead-lettered job${deadJobCount === 1 ? "" : "s"}`
              : undefined
          }
          href="/admin/email-log"
          linkLabel="Email log"
        >
          {failedEmails.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="text-slate-400">
                <LocalTime date={e.createdAt} mode="datetime" />
              </span>
              {e.ticket && (
                <Link
                  href={`/tickets/${e.ticket.incidentNumber}`}
                  className="font-medium text-accent hover:underline"
                >
                  {e.ticket.incidentNumber}
                </Link>
              )}
              <span className="truncate text-slate-300">
                {e.error ?? e.subject}
              </span>
            </li>
          ))}
          {/* Round-16 (D4) — dead-lettered jobs get a per-job
              requeue affordance; the worker picks them up on its
              next pass. */}
          {deadJobs.map((j) => (
            <li
              key={j.id}
              data-testid="dead-job-row"
              className="flex flex-wrap items-center gap-x-2 text-xs"
            >
              <code className="rounded bg-surface-muted px-1 text-[10px]">
                {j.templateKey}
              </code>
              <span className="truncate text-slate-400">
                {j.lastError ?? "send failed"}
              </span>
              <form action={requeueDeadLetteredEmailJobAction}>
                <input type="hidden" name="jobId" value={j.id} />
                <button
                  type="submit"
                  className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20"
                >
                  Requeue
                </button>
              </form>
            </li>
          ))}
        </Section>

        {/* QA audit BUG-1 — the queue itself, counted the same way
            /duplicates counts it. The old "Synthetic-merge conflicts"
            section (below) only counted merge FAILURES, so unresolved
            queue items were invisible here. */}
        <Section
          title="Duplicate queue — unresolved items"
          count={counts.duplicateQueue}
          href="/duplicates"
          linkLabel="Duplicates queue"
        >
          {dupConflicts.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="rounded bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-200">
                conflict
              </span>
              <span className="font-medium text-slate-200">
                {c.leftTicket.incidentNumber} ↔ {c.rightTicket.incidentNumber}
              </span>
              <span className="text-slate-400">
                since <LocalTime date={c.createdAt} mode="datetime" />
              </span>
            </li>
          ))}
          {dupSynthetics.map((t) => (
            <li key={t.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="rounded bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-200">
                unlinked synthetic
              </span>
              <Link
                href={`/tickets/${t.incidentNumber}`}
                className="font-medium text-accent hover:underline"
              >
                {t.incidentNumber}
              </Link>
              <span className="text-slate-300">{t.school.name}</span>
              <span className="text-slate-400">
                since <LocalTime date={t.reportedAt} mode="date" />
              </span>
            </li>
          ))}
        </Section>

        <Section
          title="SNOW merge failures"
          count={failedMergeCount}
          href="/duplicates"
          linkLabel="Duplicates queue"
        >
          {failedMerges.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="text-slate-400">
                <LocalTime date={a.createdAt} mode="datetime" />
              </span>
              <code className="rounded bg-surface-muted px-1 text-[10px]">
                {a.action}
              </code>
              <span className="truncate text-slate-300">
                {a.reason ?? ""}
              </span>
            </li>
          ))}
        </Section>

        <Section
          title="Orphaned stop devices"
          count={orphanCount}
          href="/duplicates"
          linkLabel="Resolve"
        >
          {orphanStopDevices.map((sd) => (
            <li key={sd.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="font-medium tracking-tight text-slate-200">
                {sd.device?.serialNumber ?? "device pending"}
              </span>
              <Link
                href={`/scheduling/routes/${sd.stop.routeId}`}
                className="text-accent hover:underline"
              >
                view route
              </Link>
              <span className="text-slate-400">no ticket attached</span>
            </li>
          ))}
        </Section>

        <Section
          title="Stuck imports"
          count={counts.stuckImports}
          href="/imports"
          linkLabel="Imports"
        >
          {stuckImports.map((b) => (
            <li key={b.id} className="flex flex-wrap gap-x-2 text-xs">
              <Link
                href={`/imports/${b.id}`}
                className="font-medium text-accent hover:underline"
              >
                {b.filename}
              </Link>
              <span className="text-slate-300">{humanise(b.status)}</span>
              <span className="text-slate-400">
                since <LocalTime date={b.createdAt} mode="datetime" />
              </span>
            </li>
          ))}
        </Section>

        {/* QA audit BUG-2 — expired tokens are their own bucket. An
            already-dead link under an "expiring soon" heading reads
            as less urgent than it is. */}
        <Section
          title="Expired portal tokens — reissue now"
          count={counts.expiredTokens}
          href="/admin/schools"
          linkLabel="Schools"
        >
          {expiredTokens.map((t) => (
            <li key={t.id} className="flex flex-wrap gap-x-2 text-xs">
              <Link
                href={`/admin/schools/${t.school.id}`}
                className="font-medium text-accent hover:underline"
              >
                {t.school.name}
              </Link>
              <span className="text-slate-300">{t.label ?? "(no label)"}</span>
              <span className="font-semibold text-red-300">
                expired {t.expiresAt?.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </Section>

        <Section
          title="Portal tokens expiring within 30 days"
          count={counts.expiringTokens}
          href="/admin/schools"
          linkLabel="Schools"
        >
          {expiringTokens.map((t) => (
            <li key={t.id} className="flex flex-wrap gap-x-2 text-xs">
              <Link
                href={`/admin/schools/${t.school.id}`}
                className="font-medium text-accent hover:underline"
              >
                {t.school.name}
              </Link>
              <span className="text-slate-300">{t.label ?? "(no label)"}</span>
              <span className="text-amber-300">
                expires {t.expiresAt?.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </Section>

        {/* QA audit BUG-5 — the triage backlog gets its own alert
            instead of blending into generic ticket aging. Bulk
            selection on /tickets moves batches to Triage. */}
        <Section
          title="Imported backlog — no triage after 30 days"
          count={counts.importedBacklog}
          href="/tickets?state=IMPORTED"
          linkLabel="Bulk-triage on Tickets"
        >
          {importedBacklog.map((t) => (
            <li key={t.id} className="flex flex-wrap gap-x-2 text-xs">
              <Link
                href={`/tickets/${t.incidentNumber}`}
                className="font-medium text-accent hover:underline"
              >
                {t.incidentNumber}
              </Link>
              <span className="text-slate-300">{t.school.name}</span>
              <span className="text-slate-400">
                imported <LocalTime date={t.stateEnteredAt} mode="date" />
              </span>
            </li>
          ))}
        </Section>

        <Section
          title="Field outcomes — failed / partial stops"
          count={counts.fieldOutcomes}
          href="/scheduling"
          linkLabel="Scheduling"
        >
          {fieldOutcomes.map((a) => {
            const after = (a.after ?? {}) as {
              status?: string;
              routeId?: string;
              proofOverride?: string | null;
            };
            const routeId = after.routeId;
            const label =
              after.status === "FAILED"
                ? "Stop failed"
                : after.status === "PARTIAL"
                  ? "Stop partially completed"
                  : after.proofOverride
                    ? "Completed without required proof"
                    : formatAuditAction(a.action).label;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="rounded bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-200">
                  {label}
                </span>
                <span className="text-slate-400">
                  <LocalTime date={a.createdAt} mode="datetime" />
                </span>
                {a.actor && <span className="text-slate-400">{a.actor.name}</span>}
                {a.reason && (
                  <span className="truncate text-slate-300">{a.reason}</span>
                )}
                {routeId && (
                  <Link
                    href={`/scheduling/routes/${routeId}#stop-${a.entityId}`}
                    className="text-accent hover:underline"
                  >
                    view stop
                  </Link>
                )}
                <AcknowledgeButton auditId={a.id} />
              </li>
            );
          })}
        </Section>

        <Section
          title="High-severity audit events (7 days)"
          count={counts.severeAudits}
          href="/admin/audit"
          linkLabel="Audit log"
        >
          {severeAudits.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="text-slate-400">
                <LocalTime date={a.createdAt} mode="datetime" />
              </span>
              <span
                className={
                  a.severity === "critical"
                    ? "rounded bg-red-500/20 px-1 text-[10px] font-semibold text-red-200"
                    : "rounded bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-200"
                }
              >
                {humanise(a.severity ?? "warn")}
              </span>
              <span className="text-slate-300">
                {formatAuditAction(a.action).label}
              </span>
              <AcknowledgeButton auditId={a.id} />
            </li>
          ))}
        </Section>
      </div>
    </>
  );
}

function AcknowledgeButton({ auditId }: { auditId: string }) {
  return (
    <ActionForm action={acknowledgeExceptionAction} className="ml-auto">
      <input type="hidden" name="auditId" value={auditId} />
      <button
        type="submit"
        className="rounded border border-surface-border px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-accent hover:text-white"
        title="Acknowledge — clears this from the active exceptions list"
      >
        Acknowledge
      </button>
    </ActionForm>
  );
}

function Section({
  title,
  count,
  extra,
  href,
  linkLabel,
  children,
}: {
  title: string;
  count: number;
  extra?: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  const clear = count === 0;
  return (
    <section
      data-testid="exception-section"
      data-clear={clear}
      className={`rounded-lg border p-4 ${
        clear
          ? "border-surface-border bg-surface-muted/30"
          : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              clear
                ? "bg-surface-border text-slate-400"
                : "bg-amber-500/20 text-amber-200"
            }`}
          >
            {count}
          </span>
          <Link
            href={href}
            className="text-xs text-accent hover:underline"
          >
            {linkLabel} →
          </Link>
        </div>
      </div>
      {extra && <p className="mb-2 text-xs text-amber-200/80">{extra}</p>}
      {clear ? (
        <p className="text-xs text-slate-500">All clear — nothing to action here.</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </section>
  );
}
