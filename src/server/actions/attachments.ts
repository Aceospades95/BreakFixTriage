"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { deleteStoredFile, storeFile } from "@/lib/attachments/storage";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments/validation";

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
    kindRaw === "TICKET" || kindRaw === "ROUTE_STOP" || kindRaw === "QUOTE"
      ? (kindRaw as AttachmentKind)
      : null;
  if (!kind) {
    redirect("/?error=" + encodeURIComponent("Invalid attachment kind"));
  }

  const requiredPermission =
    kind === "TICKET"
      ? PERMISSIONS.TICKETS_WRITE
      : kind === "QUOTE"
        ? PERMISSIONS.QUOTES_WRITE
        : PERMISSIONS.SCHEDULING_WRITE;
  const session = await requireRole(requiredPermission);

  const ticketId = formData.get("ticketId")?.toString() || null;
  const routeStopId = formData.get("routeStopId")?.toString() || null;
  const quoteId = formData.get("quoteId")?.toString() || null;
  const returnTo = formData.get("returnTo")?.toString() || "/";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${returnTo}?error=${encodeURIComponent("No file uploaded")}`);
  }
  const upload = file as File;
  if (upload.size > MAX_ATTACHMENT_BYTES) {
    redirect(
      `${returnTo}?error=${encodeURIComponent("File is too large")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    const bytes = Buffer.from(await upload.arrayBuffer());
    const stored = await storeFile({
      filename: upload.name,
      mimeType: upload.type || "application/octet-stream",
      bytes,
    });
    const row = await prisma.attachment.create({
      data: {
        kind,
        ticketId: kind === "TICKET" ? ticketId : null,
        routeStopId: kind === "ROUTE_STOP" ? routeStopId : null,
        quoteId: kind === "QUOTE" ? quoteId : null,
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
      },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Upload failed";
  }

  if (errorMessage) {
    redirect(`${returnTo}?error=${encodeURIComponent(errorMessage)}`);
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
    redirect(`${returnTo}?error=${encodeURIComponent("Missing attachment id")}`);
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
    redirect(`${returnTo}?error=${encodeURIComponent(errorMessage)}`);
  }

  revalidatePath(returnTo);
  redirect(returnTo);
}
