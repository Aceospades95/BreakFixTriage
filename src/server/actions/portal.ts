"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createPortalToken, revokePortalToken } from "@/lib/portal/tokens";
import { prisma } from "@/lib/db/prisma";

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

const regenerateSchema = z.object({
  tokenId: z.string().min(1),
  schoolId: z.string().min(1),
});

/**
 * Round-18 — regenerate a portal link in one step. The plaintext is
 * only ever shown at creation; when it's lost (the field report:
 * operators copied the prefix shown in the token list and got a 404)
 * the only recovery is revoke + reissue. This action does both,
 * carrying the old token's label/scope forward, and lands back on
 * the school page with the one-shot banner showing the new link.
 */
export async function regeneratePortalTokenAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = regenerateSchema.safeParse({
    tokenId: formData.get("tokenId"),
    schoolId: formData.get("schoolId"),
  });
  if (!parsed.success) {
    redirect("/admin/schools?error=Invalid+regenerate+request");
  }

  try {
    const old = await prisma.portalToken.findUnique({
      where: { id: parsed.data.tokenId },
      select: { label: true, expiresAt: true, dataScope: true },
    });
    await revokePortalToken({
      tokenId: parsed.data.tokenId,
      actorUserId: session.userId,
    });
    const result = await createPortalToken({
      schoolId: parsed.data.schoolId,
      label: old?.label ?? null,
      expiresAt: old?.expiresAt ?? null,
      dataScope:
        old?.dataScope === "MINIMAL" ? "MINIMAL" : "STANDARD",
      actorUserId: session.userId,
    });
    revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
    redirect(
      `/admin/schools/${parsed.data.schoolId}?ok=${encodeURIComponent("Link regenerated — the old link no longer works")}&newToken=${encodeURIComponent(result.plaintext)}`,
    );
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) {
      throw err;
    }
    redirect(
      `/admin/schools/${parsed.data.schoolId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Regenerate failed")}`,
    );
  }
}
