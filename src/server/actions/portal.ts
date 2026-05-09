"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createPortalToken, revokePortalToken } from "@/lib/portal/tokens";

const createSchema = z.object({
  schoolId: z.string().min(1),
  label: z.string().trim().max(100).optional(),
  expiresInDays: z.coerce.number().int().min(0).max(3650).optional(),
  dataScope: z.enum(["STANDARD", "MINIMAL"]).optional(),
});

export async function createPortalTokenAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const parsed = createSchema.safeParse({
    schoolId: formData.get("schoolId"),
    label: formData.get("label")?.toString() || undefined,
    expiresInDays: formData.get("expiresInDays") || undefined,
    dataScope: formData.get("dataScope")?.toString() || undefined,
  });
  if (!parsed.success) {
    const sid = formData.get("schoolId")?.toString() ?? "";
    redirect(
      `/admin/schools/${sid}?error=${encodeURIComponent("Invalid token request")}`,
    );
  }

  const expiresAt = parsed.data.expiresInDays
    ? new Date(
        Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
      )
    : null;

  try {
    // Round-13 §1I — plaintext is returned ONCE; pass it back to
    // the page via a one-shot query string so the admin can copy it
    // before navigating away. The DB only stores the SHA-256 hash.
    const result = await createPortalToken({
      schoolId: parsed.data.schoolId,
      label: parsed.data.label ?? null,
      expiresAt,
      dataScope: parsed.data.dataScope,
      actorUserId: session.userId,
    });
    revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
    redirect(
      `/admin/schools/${parsed.data.schoolId}?ok=${encodeURIComponent("Portal link created")}&newToken=${encodeURIComponent(result.plaintext)}`,
    );
  } catch (err) {
    // redirect() throws — let it propagate.
    if (err && typeof err === "object" && "digest" in err) {
      throw err;
    }
    redirect(
      `/admin/schools/${parsed.data.schoolId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Create failed")}`,
    );
  }
}

const revokeSchema = z.object({
  tokenId: z.string().min(1),
  schoolId: z.string().min(1),
});

export async function revokePortalTokenAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = revokeSchema.safeParse({
    tokenId: formData.get("tokenId"),
    schoolId: formData.get("schoolId"),
  });
  if (!parsed.success) {
    redirect("/admin/schools?error=Invalid+revoke+request");
  }

  try {
    await revokePortalToken({
      tokenId: parsed.data.tokenId,
      actorUserId: session.userId,
    });
  } catch (err) {
    redirect(
      `/admin/schools/${parsed.data.schoolId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Revoke failed")}`,
    );
  }
  revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
  redirect(`/admin/schools/${parsed.data.schoolId}?ok=Portal+link+revoked`);
}
