/**
 * Escalation sweeper.
 *
 * Scans every non-terminal ticket, applies the effective SLA
 * threshold × the escalation multiplier, and for anything past that
 * line creates an in-app notification for the ticket's assignee (if
 * any) plus every ADMIN and OPS_MANAGER. This is the automation that
 * turns "aging tickets" from something an attentive dispatcher
 * remembers to check into something the app nags them about.
 *
 * Idempotent: we record `lastEscalatedAt` on the ticket's `meta` so
 * a re-run the same day doesn't spam everyone. Drop to null to reset.
 */

import {
  InAppNotificationKind,
  type PrismaClient,
  type TicketState,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { dispatchEmailEvent } from "@/lib/email/send";
import { buildTicketEmailVariables } from "@/lib/email/variables";
import { humanise } from "@/lib/format";
import { daysInState, slaHealth } from "@/lib/reports/sla";
import { getEscalationMultiplier, getSlaThresholds } from "@/lib/settings/settings";

export interface EscalationReport {
  scanned: number;
  escalated: number;
  notificationsCreated: number;
  /** Round-16 (D3) — sla_breach_warning / sla_breached dispatches. */
  emailsDispatched: number;
  errors: { ticketId: string; message: string }[];
}

/**
 * Pure predicate: given days-in-state, SLA threshold, and the
 * escalation multiplier, decide whether a ticket should escalate.
 * Exported so tests can verify the math without a DB.
 */
export function shouldEscalate(
  daysInCurrentState: number,
  threshold: number | null,
  multiplier: number,
): boolean {
  if (threshold == null) return false;
  if (threshold <= 0) return false;
  if (multiplier <= 0) return false;
  return daysInCurrentState >= threshold * multiplier;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function alreadyEscalatedToday(meta: unknown, now: Date): boolean {
  if (meta == null || typeof meta !== "object") return false;
  const value = (meta as { lastEscalatedAt?: unknown }).lastEscalatedAt;
  if (typeof value !== "string") return false;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return false;
  return now.getTime() - then.getTime() < DAY_MS;
}

export interface EscalationSweepInput {
  now?: Date;
  actorUserId?: string | null;
}

/**
 * Runner. Loads open tickets, classifies each, and creates
 * notifications + stamps meta for anything past the escalation line.
 */
export async function sweepEscalations(
  input: EscalationSweepInput = {},
  db: PrismaClient = defaultPrisma,
): Promise<EscalationReport> {
  const now = input.now ?? new Date();
  const thresholds = await getSlaThresholds(db);
  const multiplier = await getEscalationMultiplier(db);

  const tickets = await db.ticket.findMany({
    where: { state: { notIn: ["CLOSED", "ON_HOLD"] as TicketState[] } },
    select: {
      id: true,
      incidentNumber: true,
      state: true,
      reportedAt: true,
      stateEnteredAt: true,
      assignedUserId: true,
      meta: true,
      schoolId: true,
      school: { select: { name: true } },
    },
  });

  const admins = await db.user.findMany({
    where: {
      active: true,
      role: { in: ["ADMIN", "OPS_MANAGER"] },
    },
    select: { id: true },
  });

  const report: EscalationReport = {
    scanned: tickets.length,
    escalated: 0,
    notificationsCreated: 0,
    emailsDispatched: 0,
    errors: [],
  };

  for (const t of tickets) {
    try {
      if (alreadyEscalatedToday(t.meta, now)) continue;
      const days = daysInState(
        {
          state: t.state,
          stateEnteredAt: t.stateEnteredAt,
          reportedAt: t.reportedAt,
        },
        now,
      );
      const threshold = thresholds[t.state];
      if (!shouldEscalate(days, threshold, multiplier)) continue;

      const health = slaHealth(t.state, days, thresholds);
      const title = `Escalation: ${t.incidentNumber}`;
      const body = `${t.school.name} · ${days} days in ${t.state}${
        health === "breached" ? " (breached)" : ""
      }`;
      // Round-16 (B19) — incident-number URL, not the cuid.
      const linkHref = `/tickets/${t.incidentNumber}`;

      const recipients = new Set<string>();
      if (t.assignedUserId) recipients.add(t.assignedUserId);
      for (const a of admins) recipients.add(a.id);

      await db.$transaction(async (tx) => {
        for (const recipientId of recipients) {
          await tx.inAppNotification.create({
            data: {
              recipientUserId: recipientId,
              kind: InAppNotificationKind.ESCALATION,
              title,
              body,
              linkHref,
            },
          });
          report.notificationsCreated += 1;
        }

        const prevMeta =
          t.meta != null && typeof t.meta === "object"
            ? (t.meta as Record<string, unknown>)
            : {};
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            meta: {
              ...prevMeta,
              lastEscalatedAt: now.toISOString(),
            },
          },
        });
        await writeAudit(
          {
            actorUserId: input.actorUserId ?? null,
            entityType: "Ticket",
            entityId: t.id,
            action: "escalate",
            after: {
              state: t.state,
              daysInState: days,
              threshold,
              multiplier,
              recipients: Array.from(recipients),
            },
          },
          tx,
        );
      });

      report.escalated += 1;

      // Round-16 (D3) — the sla_breach templates existed since R2
      // but nothing ever dispatched them; the sweep only wrote
      // in-app rows. Fire the matching event through the chokepoint
      // (post-transaction, like every other dispatch site). A
      // missing or disabled rule makes this a clean no-op.
      try {
        const event =
          health === "breached" ? "sla_breached" : "sla_breach_warning";
        const baseVars = await buildTicketEmailVariables(t.id, db);
        if (baseVars) {
          const dispatched = await dispatchEmailEvent(
            event,
            {
              ticketId: t.id,
              schoolId: t.schoolId,
              actorUserId: input.actorUserId ?? null,
              variables: {
                ...baseVars,
                ticket: { ...baseVars.ticket, daysInState: days },
                status: {
                  label: humanise(t.state),
                  slaThreshold: threshold,
                },
              },
            },
            db,
          );
          report.emailsDispatched += dispatched.length;
        }
      } catch (emailErr) {
        // Email failure must not fail the sweep; the EmailLog row
        // carries the detail and /admin/exceptions surfaces it.
        console.error(
          `[escalation] email dispatch failed for ${t.incidentNumber}:`,
          emailErr,
        );
      }
    } catch (err) {
      report.errors.push({
        ticketId: t.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
