import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { formatPriority, formatStatus } from "@/lib/format";

/**
 * Round-15 — shared variables builder for ticket-family email
 * dispatches.
 *
 * The R15 audit found that six of nine dispatchEmailEvent call
 * sites passed flat ids ({ ticketId, quoteId, … }) while every
 * seeded template requires the nested shape ({ ticket: { number,
 * school, … }, link }) — so those sends failed template validation
 * and dead-lettered into EmailLog on every trigger. The three
 * call sites that did build the shape used relative `/tickets/
 * <cuid>` links, which are dead inside an email client (backlog
 * B19).
 *
 * This module is now the single source of the `ticket` + `link`
 * variable shape. Call sites merge their event-specific extras
 * (assignee / quote / stop / reason / …) on top.
 */

type DbLike = PrismaClient | Prisma.TransactionClient;

/**
 * Absolute base URL for links that leave the app (emails, portal).
 * NEXTAUTH_URL is the deploy-time contract for "the URL a browser
 * uses to reach the app" (see .env.example).
 */
export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export interface TicketEmailVariables extends Record<string, unknown> {
  ticket: {
    number: string;
    summary: string;
    school: string;
    priority: string;
    status: string;
  };
  link: string;
}

/**
 * Load the ticket + school and build the `{ ticket, link }` blob
 * every ticket-family template interpolates. Returns null when the
 * ticket is gone (caller skips the dispatch rather than emailing
 * about a missing row).
 */
export async function buildTicketEmailVariables(
  ticketId: string,
  db: DbLike = defaultPrisma,
  extra: Record<string, unknown> = {},
): Promise<TicketEmailVariables | null> {
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      incidentNumber: true,
      shortDescription: true,
      priority: true,
      state: true,
      school: { select: { name: true } },
    },
  });
  if (!t) return null;
  return {
    ticket: {
      number: t.incidentNumber,
      summary: t.shortDescription,
      school: t.school.name,
      priority: formatPriority(t.priority),
      status: formatStatus(t.state),
    },
    link: `${appBaseUrl()}/tickets/${t.incidentNumber}`,
    ...extra,
  };
}
