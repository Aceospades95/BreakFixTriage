import {
  JobStatus,
  type JobType,
  type Prisma,
  type TicketState,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface ReadyTicketGroup {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  tickets: {
    id: string;
    incidentNumber: string;
    shortDescription: string;
  }[];
}

export interface ReadyGroupsResult {
  groups: ReadyTicketGroup[];
  /** Tickets rendered (after the cap). */
  shown: number;
  /** True total matching, so the UI never presents a cap as a total. */
  total: number;
}

/** Rows pulled per call. Citywide there can be thousands ready. */
export const READY_GROUP_LIMIT = 200;

/**
 * Round-17 — extracted from /scheduling so the route builder can
 * offer the same "ready to schedule" groups inline (the builder's
 * old empty state just pointed back at the dashboard — a dead end
 * the field QA flagged).
 *
 * Groups tickets in the given state by school, excluding any
 * tickets already linked to an UNSCHEDULED job of the matching
 * type (those are one step further along — they show in the
 * builder's job list instead).
 */
export async function groupReadyTicketsBySchool(
  state: TicketState,
  jobType: JobType,
  /**
   * Five-borough expansion — extra constraints from the caller:
   * the session tenant scope and the dispatcher's borough choice.
   * Citywide there can be thousands of tickets ready to schedule,
   * and a Brooklyn dispatcher must not have to scroll past the
   * Bronx to find their stops.
   */
  extraWhere: Prisma.TicketWhereInput = {},
): Promise<ReadyGroupsResult> {
  const where: Prisma.TicketWhereInput = {
    AND: [
      extraWhere,
      {
        state,
        jobLinks: {
          none: {
            job: { type: jobType, status: JobStatus.UNSCHEDULED },
          },
        },
      },
    ],
  };
  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: { school: { select: { id: true, name: true, code: true } } },
      orderBy: { reportedAt: "asc" },
      take: READY_GROUP_LIMIT,
    }),
    prisma.ticket.count({ where }),
  ]);

  const byId = new Map<string, ReadyTicketGroup>();
  for (const t of tickets) {
    const key = t.schoolId;
    let g = byId.get(key);
    if (!g) {
      g = {
        schoolId: t.school.id,
        schoolName: t.school.name,
        schoolCode: t.school.code,
        tickets: [],
      };
      byId.set(key, g);
    }
    g.tickets.push({
      id: t.id,
      incidentNumber: t.incidentNumber,
      shortDescription: t.shortDescription,
    });
  }
  return {
    groups: Array.from(byId.values()).sort((a, b) =>
      a.schoolName.localeCompare(b.schoolName),
    ),
    shown: tickets.length,
    total,
  };
}
