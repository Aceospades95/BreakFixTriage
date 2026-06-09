import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

const STUCK_IMPORT_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_EXPIRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SEVERITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
export default async function ExceptionsPage() {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const now = Date.now();
  const [
    failedEmails,
    failedEmailCount,
    deadJobCount,
    failedMerges,
    failedMergeCount,
    orphanStopDevices,
    orphanCount,
    stuckImports,
    expiringTokens,
    severeAudits,
  ] = await Promise.all([
    prisma.emailLog.findMany({
      where: { status: "failed" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { ticket: { select: { incidentNumber: true } } },
    }),
    prisma.emailLog.count({ where: { status: "failed" } }),
    prisma.emailJob.count({ where: { status: "failed" } }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: ["snow-merge.failed", "snow-merge.cross-school-collision"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.count({
      where: {
        action: {
          in: ["snow-merge.failed", "snow-merge.cross-school-collision"],
        },
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
    prisma.stopDevice.count({ where: { ticketId: null, removedAt: null } }),
    prisma.importBatch.findMany({
      where: {
        status: { in: ["PENDING", "VALIDATING", "COMMITTING"] },
        createdAt: { lt: new Date(now - STUCK_IMPORT_THRESHOLD_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
    prisma.portalToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          not: null,
          lt: new Date(now + TOKEN_EXPIRY_WINDOW_MS),
        },
      },
      orderBy: { expiresAt: "asc" },
      take: 8,
      include: { school: { select: { name: true, id: true } } },
    }),
    prisma.auditLog.findMany({
      where: {
        severity: { in: ["warn", "critical"] },
        createdAt: { gte: new Date(now - SEVERITY_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const totalExceptions =
    failedEmailCount +
    deadJobCount +
    failedMergeCount +
    orphanCount +
    stuckImports.length +
    expiringTokens.length +
    severeAudits.length;

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
                {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
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
        </Section>

        <Section
          title="Synthetic-merge conflicts"
          count={failedMergeCount}
          href="/duplicates"
          linkLabel="Duplicates queue"
        >
          {failedMerges.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="text-slate-400">
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
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
                {sd.device.serialNumber}
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
          count={stuckImports.length}
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
                since {b.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </li>
          ))}
        </Section>

        <Section
          title="Portal tokens expiring within 30 days"
          count={expiringTokens.length}
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
              <span
                className={
                  t.expiresAt && t.expiresAt.getTime() < now
                    ? "font-semibold text-red-300"
                    : "text-amber-300"
                }
              >
                {t.expiresAt && t.expiresAt.getTime() < now
                  ? `expired ${t.expiresAt.toISOString().slice(0, 10)}`
                  : `expires ${t.expiresAt?.toISOString().slice(0, 10)}`}
              </span>
            </li>
          ))}
        </Section>

        <Section
          title="High-severity audit events (7 days)"
          count={severeAudits.length}
          href="/admin/audit"
          linkLabel="Audit log"
        >
          {severeAudits.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="text-slate-400">
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
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
              <code className="rounded bg-surface-muted px-1 text-[10px]">
                {a.action}
              </code>
            </li>
          ))}
        </Section>
      </div>
    </>
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
        <p className="text-xs text-slate-500">Clear.</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </section>
  );
}
