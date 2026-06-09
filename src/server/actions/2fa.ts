"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSession, requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from "@/lib/auth/totp";

/**
 * 2FA setup flow.
 *
 * Three state transitions, each a separate action:
 *
 *   1. `beginTotpEnrollment` — generates a fresh secret and stashes
 *      it in an httpOnly cookie. We don't write the secret to the
 *      User row until the user has proven they can generate a valid
 *      code from it, so an abandoned enrollment doesn't lock anyone
 *      out.
 *   2. `confirmTotpEnrollment` — verifies a code, moves the secret
 *      from the cookie onto the user, generates recovery codes,
 *      stashes a one-shot "here are your recovery codes" cookie
 *      for the next page load.
 *   3. `disableTotp` — blanks totpSecret, totpEnabledAt, and
 *      backupCodes. Requires a fresh code so a stolen session
 *      can't turn 2FA off.
 *
 * An admin reset path exists in `/admin/users/[id]` that skips the
 * fresh-code requirement (see `adminResetTotpAction` below).
 */

const PENDING_COOKIE = "bft_totp_pending";
const RECOVERY_COOKIE = "bft_totp_recovery";

function flashError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function beginTotpEnrollment() {
  const session = await requireSession();
  const secret = generateTotpSecret();
  cookies().set(PENDING_COOKIE, secret, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60, // 10 minutes to finish setup
    path: "/",
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "User",
    entityId: session.userId,
    action: "2fa:enrollment-started",
  });
  redirect("/profile/2fa");
}

const confirmSchema = z.object({
  code: z.string().trim().min(4).max(20),
});

export async function confirmTotpEnrollment(formData: FormData) {
  const session = await requireSession();
  const parsed = confirmSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    flashError("/profile/2fa", "Missing or malformed code");
  }

  const pending = cookies().get(PENDING_COOKIE)?.value;
  if (!pending) {
    flashError("/profile/2fa", "Enrollment expired — start again");
  }

  if (!verifyTotp(parsed.data.code, pending)) {
    flashError("/profile/2fa", "Code did not match — try again");
  }

  const codes = generateRecoveryCodes();
  const hashed = codes.map(hashRecoveryCode);

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      totpSecret: pending,
      totpEnabledAt: new Date(),
      backupCodes: JSON.stringify(hashed),
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "User",
    entityId: session.userId,
    action: "2fa:enabled",
  });

  cookies().delete(PENDING_COOKIE);
  // Stash the recovery codes in a short-lived cookie so the next
  // page load can show them once, then delete the cookie.
  cookies().set(RECOVERY_COOKIE, JSON.stringify(codes), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 5 * 60,
    path: "/",
  });

  revalidatePath("/profile/2fa");
  redirect("/profile/2fa?ok=Two-factor+enabled");
}

/**
 * Read and clear the one-shot recovery codes cookie. Called from
 * the profile page so the user sees them exactly once. Exported
 * here so the page component can await it as a server action.
 */
export async function readAndClearRecoveryCookie(): Promise<string[] | null> {
  const raw = cookies().get(RECOVERY_COOKIE)?.value;
  if (!raw) return null;
  cookies().delete(RECOVERY_COOKIE);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((c): c is string => typeof c === "string");
  } catch {
    return null;
  }
}

const disableSchema = z.object({
  code: z.string().trim().min(4).max(20),
});

export async function disableTotpAction(formData: FormData) {
  const session = await requireSession();
  const parsed = disableSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    flashError("/profile/2fa", "Confirm with a current code");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user?.totpSecret) {
    redirect("/profile/2fa?ok=Two-factor+was+already+off");
  }
  if (!verifyTotp(parsed.data.code, user.totpSecret)) {
    flashError("/profile/2fa", "Code did not match — cannot disable");
  }
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      backupCodes: null,
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "User",
    entityId: session.userId,
    action: "2fa:disabled",
  });
  revalidatePath("/profile/2fa");
  redirect("/profile/2fa?ok=Two-factor+disabled");
}

/**
 * Admin emergency reset: blank out 2FA for a user who lost their
 * device and exhausted their recovery codes. Audit-logged so
 * compliance has a clear trail. Admin-only.
 *
 * Round-13 §1B — also cascades to session revocation: every active
 * UserSession row gets revokedAt set AND `User.sessionRevokedBefore`
 * is bumped so any cached JWT is invalidated by the next request.
 * The two-step (clear TOTP + revoke sessions) runs inside one
 * transaction so a partial failure never leaves a user with TOTP
 * cleared but stale JWTs still working.
 */
export async function adminResetTotpAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);
  const userId = formData.get("userId")?.toString();
  if (!userId) {
    redirect("/admin/users?error=Missing+user+id");
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        backupCodes: null,
        sessionRevokedBefore: now,
      },
    });
    const sessions = await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return {
      twoFactorWasEnrolled: Boolean(before?.totpEnabledAt),
      revokedCount: sessions.count,
    };
  });

  await writeAudit({
    actorUserId: session.userId,
    entityType: "User",
    entityId: userId,
    // Action string preserves the R11/R12 convention so historical
    // audit queries keep working; the cascade fields land in the
    // structured columns (Round-13 §1J).
    action: "2fa:admin-reset",
    after: {
      revokedCount: result.revokedCount,
      sessionRevokedBefore: now.toISOString(),
      twoFactorWasEnrolled: result.twoFactorWasEnrolled,
    },
    reason: `Admin reset 2FA${
      result.revokedCount > 0
        ? `; revoked ${result.revokedCount} session${result.revokedCount === 1 ? "" : "s"}`
        : ""
    }`,
    severity: "warn",
  });
  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${userId}?ok=Two-factor+reset`);
}

/**
 * Round-10 §1F + Round-11 §1C — admin "Sign out all sessions".
 *
 * Sets revokedAt on every active UserSession row for the target.
 * Audit row uses the dotted action `user.sessions.revoke_all` per
 * the R11 brief.
 */
export async function revokeAllUserSessionsAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);
  const userId = formData.get("userId")?.toString();
  if (!userId) {
    redirect("/admin/users?error=Missing+user+id");
  }

  const { revokeAllSessionsForUser } = await import("@/lib/auth/sessions");
  const revokedCount = await revokeAllSessionsForUser(userId);
  const sessionRevokedBefore = new Date().toISOString();

  await writeAudit({
    actorUserId: session.userId,
    entityType: "User",
    entityId: userId,
    action: "user.sessions.revoke_all",
    after: { revokedCount, sessionRevokedBefore },
    reason: `Admin revoked ${revokedCount} session${revokedCount === 1 ? "" : "s"}`,
    severity: "warn",
  });

  revalidatePath(`/admin/users/${userId}`);
  redirect(
    `/admin/users/${userId}?ok=Revoked+${revokedCount}+session${revokedCount === 1 ? "" : "s"}`,
  );
}
