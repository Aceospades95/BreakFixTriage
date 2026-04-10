"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DuplicateResolution } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { resolveDuplicate } from "@/lib/duplicates/resolve";

const schema = z.object({
  conflictId: z.string().min(1),
  resolution: z.nativeEnum(DuplicateResolution),
  reason: z.string().max(500).optional(),
});

export async function resolveDuplicateAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DUPLICATES_RESOLVE);

  const parsed = schema.safeParse({
    conflictId: formData.get("conflictId"),
    resolution: formData.get("resolution"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/duplicates?error=${encodeURIComponent("Invalid resolution request.")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    await resolveDuplicate({
      conflictId: parsed.data.conflictId,
      resolution: parsed.data.resolution,
      actorUserId: session.userId,
      reason: parsed.data.reason,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Resolution failed.";
  }

  if (errorMessage) {
    redirect(`/duplicates?error=${encodeURIComponent(errorMessage)}`);
  }

  revalidatePath("/duplicates");
  revalidatePath("/tickets");
  redirect("/duplicates");
}
