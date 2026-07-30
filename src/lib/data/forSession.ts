import type { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import type { BreakFixSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";

/**
 * Round-13 §2A — tenant-scoped query helpers.
 *
 * The reviewer's recommendation was to centralise the "current actor
 * + permission + tenant scope" check into a request context plus a
 * query-helper layer so individual route handlers can't accidentally
 * skip the district-membership filter. R13 ships the helpers and
 * converts the highest-leak hot paths (search, attachments). Other
 * paths follow in R14.
 *
 * Convention:
 *   - ADMIN gets unrestricted scope (returns `{}`).
 *   - Non-admin roles get `districtId in session.districtIds`.
 *   - A user with empty `districtIds` matches nothing (returns
 *     `districtId in []`, not `{}`).
 *
 * 404-not-403:
 *   `findTicketForSession` returns null on a cross-tenant miss so
 *   callers can return 404 instead of 403. Returning 403 leaks the
 *   existence of the row to a probing attacker; 404 does not. The
 *   same pattern applies to the other find helpers.
 */

export function isAdmin(session: BreakFixSession): boolean {
  return session.role === "ADMIN";
}

/**
 * Where-clause for ticket queries scoped to the actor's districts.
 * ADMIN returns `{}`; non-admins constrain on the school's
 * districtId.
 */
export function ticketWhereForSession(
  session: BreakFixSession,
): Prisma.TicketWhereInput {
  if (isAdmin(session)) return {};
  return {
    school: { districtId: { in: session.districtIds } },
  };
}

/**
 * Find a ticket by id OR incidentNumber, scoped to the actor's
 * districts. Returns null on miss so callers can 404.
 */
export async function findTicketForSession(
  session: BreakFixSession,
  idOrIncidentNumber: string,
  db: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma,
) {
  const scope = ticketWhereForSession(session);
  return db.ticket.findFirst({
    where: {
      AND: [
        scope,
        {
          OR: [
            { id: idOrIncidentNumber },
            { incidentNumber: idOrIncidentNumber },
          ],
        },
      ],
    },
  });
}

/**
 * Combine several ticket where-clauses safely.
 *
 * Five-borough expansion — several of these fragments own the same
 * `school` key (the tenant scope filters on School.districtId, and
 * so do the borough/district/school-name filters). Spreading them
 * into one object literal silently keeps only the last, which in the
 * worst case DROPS THE TENANT SCOPE. Always compose with this.
 *
 * Empty fragments are skipped so callers can pass them
 * unconditionally.
 */
export function andTicketWhere(
  ...parts: Array<Prisma.TicketWhereInput | null | undefined>
): Prisma.TicketWhereInput {
  const real = parts.filter(
    (p): p is Prisma.TicketWhereInput => !!p && Object.keys(p).length > 0,
  );
  if (real.length === 0) return {};
  if (real.length === 1) return real[0]!;
  return { AND: real };
}

/**
 * Where-clause for school queries scoped to the actor's districts.
 */
export function schoolWhereForSession(
  session: BreakFixSession,
): Prisma.SchoolWhereInput {
  if (isAdmin(session)) return {};
  return { districtId: { in: session.districtIds } };
}

/**
 * Where-clause for device queries — devices live at a school, so
 * scope on the school's district.
 */
export function deviceWhereForSession(
  session: BreakFixSession,
): Prisma.DeviceWhereInput {
  if (isAdmin(session)) return {};
  return { school: { districtId: { in: session.districtIds } } };
}

/**
 * Where-clause for job queries — a job is work at a school, so scope
 * on the school's district.
 *
 * Five-borough expansion: the route builder listed every UNSCHEDULED
 * job in the system with no scope at all, so a district-scoped
 * dispatcher could stage another borough's work onto their route.
 */
export function jobWhereForSession(
  session: BreakFixSession,
): Prisma.JobWhereInput {
  if (isAdmin(session)) return {};
  return { school: { districtId: { in: session.districtIds } } };
}

/**
 * Combine several job where-clauses safely. Same hazard as
 * andTicketWhere: the tenant scope and the borough filter both own
 * the `school` key, so a spread would drop one of them.
 */
export function andJobWhere(
  ...parts: Array<Prisma.JobWhereInput | null | undefined>
): Prisma.JobWhereInput {
  const real = parts.filter(
    (p): p is Prisma.JobWhereInput => !!p && Object.keys(p).length > 0,
  );
  if (real.length === 0) return {};
  if (real.length === 1) return real[0]!;
  return { AND: real };
}

/**
 * Where-clause for contact queries — contacts live at a school.
 */
export function contactWhereForSession(
  session: BreakFixSession,
): Prisma.ContactWhereInput {
  if (isAdmin(session)) return {};
  return { school: { districtId: { in: session.districtIds } } };
}

/**
 * Where-clause for route queries — routes are scoped to schools the
 * actor can see. Admin sees all.
 *
 * Routes don't have a direct districtId; they pass through stops
 * → jobs → schools. For non-admins we gate via assigned-driver
 * membership OR require at least one stop in the actor's districts.
 */
export function routeWhereForSession(
  session: BreakFixSession,
): Prisma.RouteWhereInput {
  if (isAdmin(session)) return {};
  return {
    OR: [
      { assigneeUserId: session.userId },
      {
        stops: {
          some: {
            job: {
              school: { districtId: { in: session.districtIds } },
            },
          },
        },
      },
    ],
  };
}

/**
 * Resolve an attachment for the actor and return null if the actor
 * cannot see the owning entity. The attachment storage table itself
 * doesn't carry tenant data; we resolve via the parent entity.
 *
 * Round-13 §1D — IDOR fix: cross-tenant access returns null so the
 * route handler can 404. 401 stays the response for unauthenticated.
 */
export async function attachmentForSession(
  session: BreakFixSession,
  attachmentId: string,
  db: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma,
) {
  const att = await db.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!att) return null;
  if (isAdmin(session)) return att;

  // Resolve via the owning entity's tenant scope. An attachment can
  // be on a Ticket, RouteStop (which has a Ticket), or Quote (also
  // routed via Ticket). All three resolve to a ticket → school →
  // districtId chain.
  if (att.ticketId) {
    const ticket = await db.ticket.findFirst({
      where: {
        id: att.ticketId,
        school: { districtId: { in: session.districtIds } },
      },
      select: { id: true },
    });
    return ticket ? att : null;
  }
  if (att.routeStopId) {
    // RouteStop joins to Job → School (no direct ticket). Scope via
    // the job's school district.
    const stop = await db.routeStop.findFirst({
      where: {
        id: att.routeStopId,
        job: {
          school: { districtId: { in: session.districtIds } },
        },
      },
      select: { id: true },
    });
    return stop ? att : null;
  }
  if (att.quoteId) {
    const quote = await db.quote.findFirst({
      where: {
        id: att.quoteId,
        ticket: {
          school: { districtId: { in: session.districtIds } },
        },
      },
      select: { id: true },
    });
    return quote ? att : null;
  }
  // Round-20 — expense receipts aren't district-scoped: visible to
  // the submitting tech and to expense reviewers.
  if (att.expenseId) {
    const expense = await db.expense.findUnique({
      where: { id: att.expenseId },
      select: { techUserId: true },
    });
    if (!expense) return null;
    if (expense.techUserId === session.userId) return att;
    const reviewer = await canAsync(session.role, PERMISSIONS.EXPENSES_REVIEW);
    return reviewer ? att : null;
  }
  // Attachment without any parent — admin-only view by default.
  return null;
}

/**
 * Whether the actor can resolve User search hits. Default rule:
 * USERS_MANAGE permission. Round-13 §1C — non-admins searching by
 * name MUST NOT receive User result rows.
 */
export async function canSeeUserResults(
  session: BreakFixSession,
): Promise<boolean> {
  return canAsync(session.role, PERMISSIONS.USERS_MANAGE);
}
