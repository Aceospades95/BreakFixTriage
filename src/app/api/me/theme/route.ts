import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/audit";
import {
  isValidTheme,
  THEME_COOKIE_NAME,
  THEME_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/theme/resolve";

/**
 * Round-12 §1G.3 + §1G.4 — theme write path.
 *
 * Optimistic-on-click target for the /me/preferences theme
 * picker. The client flips the <html> class first, then POSTs
 * here. Server persists to UserPreference + sets the canonical
 * 'theme' cookie so the next page render picks it up server-side
 * via resolveTheme().
 *
 * Audit row uses action='theme.update' so /admin/audit chip
 * resolvers (R12 §2C extended this) render the User entity row
 * with the operator's display name + a hover-tooltip cuid.
 */

const schema = z.object({
  theme: z.string().refine(isValidTheme, "theme must be system|light|dark"),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", code: "READ_ONLY_OR_SIGNED_OUT" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const before = await prisma.userPreference.findUnique({
    where: { userId: session.userId },
    select: { theme: true },
  });

  await prisma.userPreference.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      theme: parsed.data.theme,
    },
    update: { theme: parsed.data.theme },
  });

  // Round-12 §1G.3 — cookie write on the same response that
  // confirms the DB write. Subsequent page renders read this
  // cookie before hitting Prisma.
  cookies().set(THEME_COOKIE_NAME, parsed.data.theme, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: false, // intentionally readable by client-side JS
  });

  if (!before || before.theme !== parsed.data.theme) {
    await writeAudit({
      actorUserId: session.userId,
      entityType: "UserPreference",
      entityId: session.userId,
      action: "theme.update",
      before: before ? { theme: before.theme } : null,
      after: { theme: parsed.data.theme },
    });
  }

  return NextResponse.json({ ok: true, theme: parsed.data.theme });
}
