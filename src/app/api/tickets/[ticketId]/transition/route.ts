import { NextResponse } from "next/server";
import { z } from "zod";
import { TicketState } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { publish } from "@/lib/events/bus";
import {
  GuardFailedError,
  InvalidTransitionError,
  transitionTicket,
} from "@/lib/workflow";

/**
 * JSON transition endpoint used by the drag-and-drop kanban.
 *
 * Server actions that return a Response don't work as `form action`,
 * but they also can't be called directly from client JavaScript
 * without a form. A thin API route is the cleanest way to expose
 * the existing `transitionTicket` service to the client without
 * bypassing permission checks.
 *
 * Returns 200 + { ok: true } on success, 403 on auth, 422 on a
 * state-machine rejection, 500 on anything else.
 */

const bodySchema = z.object({
  to: z.nativeEnum(TicketState),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { ticketId: string } },
) {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.TICKETS_TRANSITION))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    await transitionTicket(params.ticketId, parsed.data.to, {
      actorUserId: session.userId,
      reason: parsed.data.reason,
    });
    publish({ topic: "tickets.changed", ticketId: params.ticketId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json(
        {
          error: `Not allowed: ${err.from} → ${err.to}`,
        },
        { status: 422 },
      );
    }
    if (err instanceof GuardFailedError) {
      return NextResponse.json(
        {
          error: `Blocked by ${err.guard}: ${err.message.split(": ").slice(-1)[0]}`,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "transition failed",
      },
      { status: 500 },
    );
  }
}
