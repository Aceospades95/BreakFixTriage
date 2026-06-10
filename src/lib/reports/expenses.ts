import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

/**
 * Round-20 — NY team: "Automatically compiles the information into
 * one report per week or so."
 *
 * Shared by /admin/expenses (the on-screen weekly view), the CSV
 * export, and the weekly finance email. Pure data shaping — no
 * rendering here.
 */

export interface ExpenseWeekLine {
  id: string;
  incurredOn: string;
  kind: string;
  amountCents: number;
  status: string;
  description: string | null;
  location: string | null;
  routeDate: string | null;
}

export interface ExpenseWeekTech {
  techUserId: string;
  techName: string;
  totalCents: number;
  approvedCents: number;
  lines: ExpenseWeekLine[];
}

export interface ExpenseWeek {
  weekStart: string;
  weekEnd: string;
  techs: ExpenseWeekTech[];
  totalCents: number;
  approvedCents: number;
}

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStartOf(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  day.setUTCDate(day.getUTCDate() - dow);
  return day;
}

export async function compileExpenseWeek(
  weekStart: Date,
  db: PrismaClient = defaultPrisma,
): Promise<ExpenseWeek> {
  const start = weekStartOf(weekStart);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const expenses = await db.expense.findMany({
    where: { incurredOn: { gte: start, lt: end } },
    orderBy: [{ techUserId: "asc" }, { incurredOn: "asc" }],
    include: {
      tech: { select: { id: true, name: true } },
      school: { select: { name: true } },
      route: {
        select: {
          date: true,
          stops: {
            select: {
              job: { select: { school: { select: { name: true } } } },
            },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  });

  const byTech = new Map<string, ExpenseWeekTech>();
  for (const e of expenses) {
    let bucket = byTech.get(e.techUserId);
    if (!bucket) {
      bucket = {
        techUserId: e.techUserId,
        techName: e.tech.name,
        totalCents: 0,
        approvedCents: 0,
        lines: [],
      };
      byTech.set(e.techUserId, bucket);
    }
    // Locations serviced: the linked school, else the distinct
    // schools on the linked route.
    const routeSchools = e.route
      ? [...new Set(e.route.stops.map((s) => s.job.school.name))]
      : [];
    const location =
      e.school?.name ?? (routeSchools.length > 0 ? routeSchools.join(" → ") : null);
    bucket.lines.push({
      id: e.id,
      incurredOn: e.incurredOn.toISOString().slice(0, 10),
      kind: e.kind,
      amountCents: e.amountCents,
      status: e.status,
      description: e.description,
      location,
      routeDate: e.route?.date.toISOString().slice(0, 10) ?? null,
    });
    if (e.status !== "REJECTED") bucket.totalCents += e.amountCents;
    if (e.status === "APPROVED") bucket.approvedCents += e.amountCents;
  }

  const techs = [...byTech.values()].sort((a, b) =>
    a.techName.localeCompare(b.techName),
  );
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: new Date(end.getTime() - 1).toISOString().slice(0, 10),
    techs,
    totalCents: techs.reduce((s, t) => s + t.totalCents, 0),
    approvedCents: techs.reduce((s, t) => s + t.approvedCents, 0),
  };
}
