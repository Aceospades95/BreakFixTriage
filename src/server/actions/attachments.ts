"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, requireSession } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { deleteStoredFile, storeFile } from "@/lib/attachments/storage";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments/validation";
import { withFeedback } from "@/lib/url";

/**
 * Upload an attachment. Gated on TICKETS_WRITE for ticket attachments
 * and SCHEDULING_WRITE for route stop attachments — same permissions
 * that let you edit the underlying entity.
 *
 * The form must submit `kind` (TICKET | ROUTE_STOP | QUOTE) and one
 * of `ticketId` / `routeStopId` / `quoteId`. The file comes through
 * as `file`. On success we redirect back to the referrer (the page
 * that owns the entity).
 */
export async function uploadAttachmentAction(formData: FormData) {
  const kindRaw = formData.get("kind")?.toString() ?? "";
  const kind =
    kindRaw === "TICKET" ||
    kindRaw === "ROUTE_STOP" ||
    kindRaw === "QUOTE" ||
    kindRaw === "EXPENSE"
      ? (kindRaw as AttachmentKind)
      : null;
  if (!kind) {
    redirect("/?error=" + encodeURIComponent("Invalid attachment kind"));
  }

  const ticketId = formData.get("ticketId")?.toString() || null;
  const routeStopId = formData.get("routeStopId")?.toString() || null;
  const quoteId = formData.get("quoteId")?.toString() || null;
  const expenseId = formData.get("expenseId")?.toString() || null;
  const returnTo = formData.get("returnTo")?.toString() || "/";

  // Round-20 — EXPENSE receipts: any signed-in user, but only onto
  // their OWN expense rows. Everything else keeps the entity-level
  // write permission.
  let session;
  if (kind === "EXPENSE") {
    session = await requireSession();
    const expense = expenseId
      ? await prisma.expense.findUnique({ where: { id: expenseId } })
      : null;
    if (!expense || expense.techUserId !== session.userId) {
      redirect(
        withFeedback(returnTo, "error", "Receipts attach to your own expenses only"),
      );
    }
  } else {
    const requiredPermission =
      kind === "TICKET"
        ? PERMISSIONS.TICKETS_WRITE
        : kind === "QUOTE"
          ? PERMISSIONS.QUOTES_WRITE
          : PERMISSIONS.STOPS_UPDATE;
    session = await requireRole(requiredPermission);
  }

  // Two input shapes supported:
  //   1. `file` — a regular <input type="file"> upload
  //   2. `signatureDataUrl` — a base64 PNG data URL from the
  //      SignaturePad canvas component
  const file = formData.get("file");
  const signatureDataUrl = formData.get("signatureDataUrl")?.toString() ?? "";

  let bytes: Buffer;
  let filename: string;
  let mimeType: string;

  if (signatureDataUrl && signatureDataUrl.startsWith("data:image/png;base64,")) {
    const b64 = signatureDataUrl.slice("data:image/png;base64,".length);
    try {
      bytes = Buffer.from(b64, "base64");
    } catch {
      redirect(
        withFeedback(returnTo, "error", "Invalid signature payload"),
      );
    }
    if (bytes.length === 0) {
      redirect(
        withFeedback(returnTo, "error", "Signature is empty — please sign before submitting"),
      );
    }
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      redirect(withFeedback(returnTo, "error", "Signature too large"));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    filename = `signature-${stamp}.png`;
    mimeType = "image/png";
  } else if (file instanceof File && file.size > 0) {
    const upload = file;
    if (upload.size > MAX_ATTACHMENT_BYTES) {
      redirect(
        withFeedback(returnTo, "error", "File is too large"),
      );
    }
    bytes = Buffer.from(await upload.arrayBuffer());
    filename = upload.name;
    mimeType = upload.type || "application/octet-stream";
  } else {
    redirect(withFeedback(returnTo, "error", "No file uploaded"));
  }

  let errorMessage: string | null = null;
  try {
    const stored = await storeFile({
      filename,
      mimeType,
      bytes,
    });
    const row = await prisma.attachment.create({
      data: {
        kind,
        ticketId: kind === "TICKET" ? ticketId : null,
        routeStopId: kind === "ROUTE_STOP" ? routeStopId : null,
        quoteId: kind === "QUOTE" ? quoteId : null,
        expenseId: kind === "EXPENSE" ? expenseId : null,
        uploadedByUserId: session.userId,
        filename: stored.filename,
        storedPath: stored.storedPath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Attachment",
      entityId: row.id,
      action: "upload",
      after: {
        kind,
        filename: stored.filename,
        sizeBytes: stored.sizeBytes,
        ticketId,
        routeStopId,
        quoteId,
        expenseId,
      },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Upload failed";
  }

  if (errorMessage) {
    redirect(withFeedback(returnTo, "error", errorMessage));
  }

  revalidatePath(returnTo);
  redirect(returnTo);
}

/**
 * Delete an attachment. Removes the DB row first, then the blob. If
 * the blob cleanup fails the DB row is already gone, so the file is
 * effectively leaked — acceptable for a local-volume setup, and a
 * background GC script can find orphans by walking the volume.
 */
export async function deleteAttachmentAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const attachmentId = formData.get("attachmentId")?.toString();
  const returnTo = formData.get("returnTo")?.toString() || "/";
  if (!attachmentId) {
    redirect(withFeedback(returnTo, "error", "Missing attachment id"));
  }

  let errorMessage: string | null = null;
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) {
      errorMessage = "Attachment not found";
    } else {
      await prisma.attachment.delete({ where: { id: attachmentId } });
      await deleteStoredFile(attachment.storedPath);
      await writeAudit({
        actorUserId: session.userId,
        entityType: "Attachment",
        entityId: attachmentId,
        action: "delete",
        before: {
          filename: attachment.filename,
          storedPath: attachment.storedPath,
        },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Delete failed";
  }

  if (errorMessage) {
    redirect(withFeedback(returnTo, "error", errorMessage));
  }

  revalidatePath(returnTo);
  redirect(returnTo);
}
