/**
 * Invoice / PO handling.
 *
 * When a ticket reaches INVOICE_REQUIRED it means a repair was done
 * under an approved quote and the customer still owes money. The
 * workflow engine's `invoiceBeforeClose` guard refuses to close such a
 * ticket unless either:
 *
 *   (a) a PurchaseOrder exists against the ticket's quote and its
 *       `invoicedAt` timestamp is set, or
 *   (b) the close action provides `payload.invoiceOverride === true`
 *       together with a substantive reason.
 *
 * This module provides the services that drive path (a):
 *
 *   - attachPurchaseOrder — create or upsert a PO for an APPROVED quote
 *   - markPoInvoiced — stamp `invoicedAt` and optionally close the ticket
 */

import {
  QuoteStatus,
  TicketState,
  type PrismaClient,
  type PurchaseOrder,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket } from "@/lib/workflow";

export interface AttachPurchaseOrderInput {
  quoteId: string;
  poNumber: string;
  amountCents: number;
  issuedAt?: Date;
  invoiceRequired?: boolean;
  actorUserId: string;
}

/**
 * Create a PurchaseOrder against an APPROVED quote. Each quote can have
 * at most one PO (enforced by a unique index), so this operation will
 * upsert — call it a second time with a new PO number and it replaces
 * the prior record.
 */
export async function attachPurchaseOrder(
  input: AttachPurchaseOrderInput,
  db: PrismaClient = defaultPrisma,
): Promise<PurchaseOrder> {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: input.quoteId },
      include: { purchaseOrder: true },
    });
    if (!quote) throw new Error(`Quote ${input.quoteId} not found`);
    if (quote.status !== QuoteStatus.APPROVED) {
      throw new Error(
        `Cannot attach a PO to a quote in status ${quote.status}`,
      );
    }

    const issuedAt = input.issuedAt ?? new Date();
    const po = await tx.purchaseOrder.upsert({
      where: { quoteId: quote.id },
      create: {
        quoteId: quote.id,
        poNumber: input.poNumber,
        issuedAt,
        amountCents: input.amountCents,
        invoiceRequired: input.invoiceRequired ?? true,
      },
      update: {
        poNumber: input.poNumber,
        issuedAt,
        amountCents: input.amountCents,
        invoiceRequired: input.invoiceRequired ?? true,
      },
    });

    await tx.quoteActivity.create({
      data: {
        quoteId: quote.id,
        kind: "attach-po",
        actorUserId: input.actorUserId,
        payload: {
          poNumber: po.poNumber,
          amountCents: po.amountCents,
        },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "PurchaseOrder",
        entityId: po.id,
        action: "attach",
        after: {
          quoteId: quote.id,
          poNumber: po.poNumber,
          amountCents: po.amountCents,
        },
      },
      tx,
    );

    return po;
  });
}

export interface MarkPoInvoicedInput {
  poId: string;
  actorUserId: string;
  /** If true, try to transition INVOICE_REQUIRED → CLOSED in the same tx. */
  closeTicket?: boolean;
  reason?: string;
}

export interface MarkPoInvoicedResult {
  po: PurchaseOrder;
  ticketClosed: boolean;
}

/**
 * Stamp the PO as invoiced and, when asked, close the owning ticket in
 * the same transaction. Closing is best-effort: if the ticket is in a
 * state that can't reach CLOSED we log and return ticketClosed=false.
 */
export async function markPoInvoiced(
  input: MarkPoInvoicedInput,
  db: PrismaClient = defaultPrisma,
): Promise<MarkPoInvoicedResult> {
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.poId },
      include: { quote: { include: { ticket: true } } },
    });
    if (!po) throw new Error(`PurchaseOrder ${input.poId} not found`);
    if (po.invoicedAt) {
      // Idempotent: already invoiced.
      return { po, ticketClosed: false };
    }

    const now = new Date();
    const updated = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { invoicedAt: now },
    });

    await tx.quoteActivity.create({
      data: {
        quoteId: po.quoteId,
        kind: "invoice",
        actorUserId: input.actorUserId,
        payload: { poNumber: po.poNumber, invoicedAt: now.toISOString() },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "PurchaseOrder",
        entityId: po.id,
        action: "invoice",
        after: { invoicedAt: now.toISOString() },
      },
      tx,
    );

    let ticketClosed = false;
    if (input.closeTicket) {
      const ticket = po.quote.ticket;
      if (ticket.state === TicketState.INVOICE_REQUIRED) {
        try {
          await transitionTicket(
            ticket.id,
            TicketState.CLOSED,
            {
              actorUserId: input.actorUserId,
              reason: input.reason ?? `PO ${po.poNumber} invoiced`,
              payload: { poId: po.id, poNumber: po.poNumber },
            },
            tx,
          );
          ticketClosed = true;
        } catch (err) {
          await writeAudit(
            {
              actorUserId: input.actorUserId,
              entityType: "Ticket",
              entityId: ticket.id,
              action: "invoice-close:ticket-skip",
              after: {
                reason: err instanceof Error ? err.message : String(err),
                poId: po.id,
              },
            },
            tx,
          );
        }
      }
    }

    return { po: updated, ticketClosed };
  });
}
