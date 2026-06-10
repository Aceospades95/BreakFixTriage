import { JobStatus, type JobType, type TicketState } from "@prisma/client";
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
): Promise<ReadyTicketGroup[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      state,
      jobLinks: {
        none: {
          job: { type: jobType, status: JobStatus.UNSCHEDULED },
        },
      },
    },
    include: { school: { select: { id: true, name: true, code: true } } },
    orderBy: { reportedAt: "asc" },
    take: 200,
  });

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
  return Array.from(byId.values()).sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName),
  );
}
