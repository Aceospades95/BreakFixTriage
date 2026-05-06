"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TicketState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket, canTransition } from "@/lib/workflow";

/**
 * Admin maintenance actions for data hygiene.
 *
 * Today just one: bulk-close stale tickets that have been sitting
 * in an "end-of-line" state for too long. Useful for cleaning up
 * OUT_OF_SCOPE / QUOTE_DECLINED / QUOTE_NO_RESPONSE tickets that
 * nobody ever formally closed.
 */

const schema = z.object({
  state: z.nativeEnum(TicketState),
  daysOld: z.coerce.number().int().min(1).max(3650),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Round-3 §L11 — preview which tickets would close without
 * mutating anything. Returns the list of candidates for the
 * admin tools UI to render before the operator confirms.
 *
 * Read-only; does NOT write an audit row (no change happened).
 */
export async function previewBulkCloseStale(input: {
  state: TicketState;
  daysOld: number;
}): Promise<{
  candidates: Array<{
    id: string;
    incidentNumber: string;
    schoolName: string;
    stateEnteredAt: Date;
  }>;
  capped: boolean;
}> {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const cutoff = new Date(
    Date.now() - input.daysOld * 24 * 60 * 60 * 1000,
  );
  const candidates = await prisma.ticket.findMany({
    where: {
      state: input.state,
      stateEnteredAt: { lt: cutoff },
    },
    orderBy: { stateEnteredAt: "asc" },
    take: 501,
    select: {
      id: true,
      incidentNumber: true,
      stateEnteredAt: true,
      school: { select: { name: true } },
    },
  });
  const capped = candidates.length > 500;
  return {
    candidates: (capped ? candidates.slice(0, 500) : candidates).map((t) => ({
      id: t.id,
      incidentNumber: t.incidentNumber,
      schoolName: t.school.name,
      stateEnteredAt: t.stateEnteredAt,
    })),
    capped,
  };
}

/**
 * Close every ticket in `state` whose `stateEnteredAt` is older
 * than `daysOld`. Refuses to touch CLOSED (idempotent), ON_HOLD
 * (human decision), or any state where CLOSED is not a legal
 * transition (the state machine knows).
 */
export async function bulkCloseStaleAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const parsed = schema.safeParse({
    state: formData.get("state"),
    daysOld: formData.get("daysOld"),
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; "))}`,
    );
  }

  if (!canTransition(parsed.data.state, TicketState.CLOSED)) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(`State ${parsed.data.state} cannot transition to CLOSED`)}`,
    );
  }
  if (
    parsed.data.state === TicketState.CLOSED ||
    parsed.data.state === TicketState.ON_HOLD
  ) {
    redirect(
      `/admin/settings?error=${encodeURIComponent("Refusing to bulk close from CLOSED or ON_HOLD")}`,
    );
  }

  const cutoff = new Date(
    Date.now() - parsed.data.daysOld * 24 * 60 * 60 * 1000,
  );

  const stale = await prisma.ticket.findMany({
    where: {
      state: parsed.data.state,
      stateEnteredAt: { lt: cutoff },
    },
    select: { id: true, incidentNumber: true },
    take: 500,
  });

  let closed = 0;
  const errors: string[] = [];
  for (const t of stale) {
    try {
      await transitionTicket(t.id, TicketState.CLOSED, {
        actorUserId: session.userId,
        reason: parsed.data.reason ?? `Bulk closed (stale > ${parsed.data.daysOld}d in ${parsed.data.state})`,
        payload: { bulkClose: true, daysOld: parsed.data.daysOld },
      });
      closed += 1;
    } catch (err) {
      errors.push(
        `${t.incidentNumber}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: "Maintenance",
    entityId: `bulk-close-${Date.now()}`,
    action: "bulk-close-stale",
    after: {
      state: parsed.data.state,
      daysOld: parsed.data.daysOld,
      scanned: stale.length,
      closed,
      errorCount: errors.length,
    },
  });

  revalidatePath("/tickets");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tools/bulk-close");
  // Round-3 §L: bulk close confirmation lands on the tools page
  // (the new home for the dry-run flow). Settings keeps the
  // legacy form for backwards compatibility, but the toast
  // shows up on whichever page the operator submitted from —
  // the redirect target uses the form's `returnTo` if present.
  const returnTo = formData.get("returnTo")?.toString() || "/admin/settings";
  const summary = `Closed ${closed}/${stale.length} stale tickets in ${parsed.data.state}${errors.length > 0 ? ` (${errors.length} errors)` : ""}`;
  redirect(`${returnTo}?ok=${encodeURIComponent(summary)}&important=1`);
}
