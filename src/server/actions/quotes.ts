"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  attachPurchaseOrder,
  cancelQuote,
  createQuote,
  markPoInvoiced,
  respondToQuote,
  sendQuote,
  sweepExpiredQuotes,
  updateDraftQuote,
} from "@/lib/quotes";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Parse a dollar string like "123.45" into an integer cent count. Returns
 * null when the value is blank, or throws on obvious malformed input.
 */
function parseAmountCents(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const str = raw.toString().trim().replace(/,/g, "");
  if (!str) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid amount: ${str}`);
  }
  const parsed = Math.round(parseFloat(str) * 100);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid amount: ${str}`);
  return parsed;
}

function flashError(base: string, message: string): never {
  redirect(`${base}${base.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// createQuoteAction
// ---------------------------------------------------------------------------

const createQuoteSchema = z.object({
  ticketId: z.string().min(1),
  diagnosticOnly: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export async function createQuoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);

  let amountCents: number | null = null;
  let amountError: string | null = null;
  try {
    amountCents = parseAmountCents(formData.get("amount"));
  } catch (err) {
    amountError = err instanceof Error ? err.message : "Bad amount";
  }
  if (amountError) {
    const ticketId = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${ticketId}`, amountError);
  }

  const parsed = createQuoteSchema.safeParse({
    ticketId: formData.get("ticketId"),
    diagnosticOnly: formData.get("diagnosticOnly") === "on",
    notes: formData.get("notes")?.toString().trim() || undefined,
  });

  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, "Invalid quote form data");
  }

  let errorMessage: string | null = null;
  try {
    await createQuote({
      ticketId: parsed.data.ticketId,
      amountCents,
      diagnosticOnly: parsed.data.diagnosticOnly ?? false,
      notes: parsed.data.notes ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to create quote";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/quotes");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

// ---------------------------------------------------------------------------
// updateDraftQuoteAction
// ---------------------------------------------------------------------------

const updateDraftSchema = z.object({
  quoteId: z.string().min(1),
  ticketId: z.string().min(1),
  diagnosticOnly: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export async function updateDraftQuoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);

  let amountCents: number | null = null;
  let amountError: string | null = null;
  try {
    amountCents = parseAmountCents(formData.get("amount"));
  } catch (err) {
    amountError = err instanceof Error ? err.message : "Bad amount";
  }
  if (amountError) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, amountError);
  }

  const parsed = updateDraftSchema.safeParse({
    quoteId: formData.get("quoteId"),
    ticketId: formData.get("ticketId"),
    diagnosticOnly: formData.get("diagnosticOnly") === "on",
    notes: formData.get("notes")?.toString().trim() || undefined,
  });

  if (!parsed.success) {
    flashError("/quotes", "Invalid quote update");
  }

  let errorMessage: string | null = null;
  try {
    await updateDraftQuote({
      quoteId: parsed.data.quoteId,
      amountCents,
      diagnosticOnly: parsed.data.diagnosticOnly ?? false,
      notes: parsed.data.notes ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Update failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/quotes");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

// ---------------------------------------------------------------------------
// sendQuoteAction
// ---------------------------------------------------------------------------

const sendQuoteSchema = z.object({
  quoteId: z.string().min(1),
  ticketId: z.string().min(1),
  holdDays: z.coerce.number().int().min(0).max(90).optional(),
});

export async function sendQuoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);
  const parsed = sendQuoteSchema.safeParse({
    quoteId: formData.get("quoteId"),
    ticketId: formData.get("ticketId"),
    holdDays: formData.get("holdDays") || undefined,
  });
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, "Invalid send request");
  }

  let errorMessage: string | null = null;
  try {
    await sendQuote({
      quoteId: parsed.data.quoteId,
      holdDays: parsed.data.holdDays,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Send failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/quotes");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

// ---------------------------------------------------------------------------
// respondQuoteAction (approve / decline)
// ---------------------------------------------------------------------------

const respondQuoteSchema = z.object({
  quoteId: z.string().min(1),
  ticketId: z.string().min(1),
  response: z.enum(["APPROVED", "DECLINED"]),
  reason: z.string().max(500).optional(),
});

export async function respondQuoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);
  const parsed = respondQuoteSchema.safeParse({
    quoteId: formData.get("quoteId"),
    ticketId: formData.get("ticketId"),
    response: formData.get("response"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, "Invalid response");
  }

  let errorMessage: string | null = null;
  try {
    await respondToQuote({
      quoteId: parsed.data.quoteId,
      response: parsed.data.response,
      reason: parsed.data.reason,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Response failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/quotes");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

// ---------------------------------------------------------------------------
// cancelQuoteAction
// ---------------------------------------------------------------------------

const cancelQuoteSchema = z.object({
  quoteId: z.string().min(1),
  ticketId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function cancelQuoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);
  const parsed = cancelQuoteSchema.safeParse({
    quoteId: formData.get("quoteId"),
    ticketId: formData.get("ticketId"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, "Invalid cancel request");
  }

  let errorMessage: string | null = null;
  try {
    await cancelQuote({
      quoteId: parsed.data.quoteId,
      reason: parsed.data.reason,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Cancel failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/quotes");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

// ---------------------------------------------------------------------------
// sweepQuotesAction — manual trigger for the hold-window sweeper
// ---------------------------------------------------------------------------

export async function sweepQuotesAction() {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);

  let report: Awaited<ReturnType<typeof sweepExpiredQuotes>> | null = null;
  let errorMessage: string | null = null;
  try {
    report = await sweepExpiredQuotes({ actorUserId: session.userId });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Sweep failed";
  }

  if (errorMessage || !report) {
    flashError("/quotes", errorMessage ?? "Sweep failed");
  }

  revalidatePath("/quotes");
  revalidatePath("/tickets");
  const summary = `Swept ${report.scanned}; expired ${report.expired}; ticket moves ${report.ticketsMoved}`;
  redirect(`/quotes?ok=${encodeURIComponent(summary)}`);
}

// ---------------------------------------------------------------------------
// attachPurchaseOrderAction
// ---------------------------------------------------------------------------

const attachPoSchema = z.object({
  quoteId: z.string().min(1),
  ticketId: z.string().min(1),
  poNumber: z.string().min(1).max(50),
  invoiceRequired: z.boolean().optional(),
});

export async function attachPurchaseOrderAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);

  let amountCents: number | null = null;
  let amountError: string | null = null;
  try {
    amountCents = parseAmountCents(formData.get("amount"));
  } catch (err) {
    amountError = err instanceof Error ? err.message : "Bad amount";
  }
  if (amountError) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, amountError);
  }
  if (amountCents == null) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, "PO amount is required");
  }

  const parsed = attachPoSchema.safeParse({
    quoteId: formData.get("quoteId"),
    ticketId: formData.get("ticketId"),
    poNumber: formData.get("poNumber"),
    invoiceRequired: formData.get("invoiceRequired") === "on",
  });
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    flashError(`/tickets/${id}`, "Invalid PO details");
  }

  let errorMessage: string | null = null;
  try {
    await attachPurchaseOrder({
      quoteId: parsed.data.quoteId,
      poNumber: parsed.data.poNumber,
      amountCents,
      invoiceRequired: parsed.data.invoiceRequired ?? true,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Attach failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/invoices");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

// ---------------------------------------------------------------------------
// markPoInvoicedAction
// ---------------------------------------------------------------------------

const markInvoicedSchema = z.object({
  poId: z.string().min(1),
  ticketId: z.string().min(1),
  closeTicket: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export async function markPoInvoicedAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.QUOTES_WRITE);
  const parsed = markInvoicedSchema.safeParse({
    poId: formData.get("poId"),
    ticketId: formData.get("ticketId"),
    closeTicket: formData.get("closeTicket") === "on",
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    flashError("/invoices", "Invalid mark-invoiced request");
  }

  let errorMessage: string | null = null;
  try {
    await markPoInvoiced({
      poId: parsed.data.poId,
      closeTicket: parsed.data.closeTicket ?? true,
      reason: parsed.data.reason,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Invoice mark failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/invoices");
  redirect("/invoices");
}
