"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { runImport } from "@/lib/import/pipeline";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Handle a ServiceNow CSV/XLSX upload. Runs the full import pipeline
 * directly and redirects to the batch detail page.
 *
 * A dry-run preview flow will ship in Phase 2. For Phase 1, invalid and
 * duplicate rows are surfaced on the batch detail page after the fact;
 * good rows are committed and bad rows are visible for review.
 */
export async function uploadImportAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.IMPORTS_RUN);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      "/imports/new?error=" + encodeURIComponent("No file uploaded."),
    );
  }
  const upload = file as File;
  if (upload.size > MAX_UPLOAD_BYTES) {
    redirect(
      "/imports/new?error=" +
        encodeURIComponent(
          `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`,
        ),
    );
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  let batchId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const result = await runImport({
      filename: upload.name,
      buffer,
      uploadedByUserId: session.userId,
      dryRun: false,
    });
    batchId = result.batchId;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Upload failed.";
  }

  if (errorMessage || !batchId) {
    redirect(
      "/imports/new?error=" +
        encodeURIComponent(errorMessage ?? "Upload failed."),
    );
  }

  revalidatePath("/imports");
  revalidatePath("/tickets");
  redirect(`/imports/${batchId}`);
}
