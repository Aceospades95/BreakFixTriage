"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { runImport, runSchoolImport, runDeviceImport, runUserImport, runPartImport, runDeviceModelImport } from "@/lib/import/pipeline";
import {
  loadServiceNowConfigFromEnv,
  runServiceNowSync,
} from "@/lib/import/servicenow";

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

  const importType = (formData.get("importType") as string) ?? "tickets";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `/imports/new?type=${importType}&error=` + encodeURIComponent("No file uploaded."),
    );
  }
  const upload = file as File;
  if (upload.size > MAX_UPLOAD_BYTES) {
    redirect(
      `/imports/new?type=${importType}&error=` +
        encodeURIComponent(
          `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`,
        ),
    );
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  let batchId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const importInput = {
      filename: upload.name,
      buffer,
      uploadedByUserId: session.userId,
      dryRun: false,
    };
    let result;
    if (importType === "schools") {
      result = await runSchoolImport(importInput);
    } else if (importType === "devices") {
      result = await runDeviceImport(importInput);
    } else if (importType === "users") {
      result = await runUserImport(importInput);
    } else if (importType === "parts") {
      result = await runPartImport(importInput);
    } else if (importType === "device_models") {
      result = await runDeviceModelImport(importInput);
    } else {
      result = await runImport(importInput);
    }
    batchId = result.batchId;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Upload failed.";
  }

  if (errorMessage || !batchId) {
    redirect(
      `/imports/new?type=${importType}&error=` +
        encodeURIComponent(errorMessage ?? "Upload failed."),
    );
  }

  revalidatePath("/imports");
  revalidatePath("/tickets");
  redirect(`/imports/${batchId}`);
}

/**
 * Trigger a ServiceNow API sync. Gated on the same IMPORTS_RUN
 * permission as file uploads. Fails loudly on the /imports/new page
 * if the env isn't configured, since that's usually a deployment
 * error rather than something the operator can fix on the fly.
 */
export async function runServiceNowSyncAction() {
  const session = await requireRole(PERMISSIONS.IMPORTS_RUN);

  const config = loadServiceNowConfigFromEnv();
  if (!config) {
    redirect(
      "/imports/new?error=" +
        encodeURIComponent(
          "ServiceNow is not configured. Set SERVICENOW_BASE_URL, SERVICENOW_USERNAME, and SERVICENOW_PASSWORD and redeploy.",
        ),
    );
  }

  let batchId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const result = await runServiceNowSync({
      config,
      triggeredByUserId: session.userId,
    });
    batchId = result.batchId;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Sync failed.";
  }

  if (errorMessage || !batchId) {
    redirect(
      "/imports/new?error=" +
        encodeURIComponent(errorMessage ?? "Sync failed."),
    );
  }

  revalidatePath("/imports");
  revalidatePath("/tickets");
  redirect(`/imports/${batchId}`);
}
