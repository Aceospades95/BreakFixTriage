import type { BrowserContext, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

/**
 * Round-13 §4D + hotfix — credential-injection sign-in for
 * Playwright via JWT cookie injection.
 *
 * Why JWT, not the credentials POST endpoint?
 *   - The R13 brief §4D explicitly bans the password form path.
 *   - Faster: zero network round-trips beyond the cookie set.
 *   - Less flaky: no risk of a CSRF / form-encoding regression
 *     breaking every persona spec at once.
 *
 * NextAuth runs in `strategy: "jwt"` (see src/lib/auth/auth.ts),
 * so there is no Session table to insert into. The session IS
 * the JWT. We forge one signed with the same NEXTAUTH_SECRET
 * the app uses, populated with the same shape the auth callbacks
 * produce, and drop it into the Playwright BrowserContext as the
 * `next-auth.session-token` cookie.
 *
 * The token shape MUST match what `authOptions.callbacks.jwt`
 * produces on real sign-in. Looking at src/lib/auth/auth.ts:
 *
 *   jwt({ token, user }) {
 *     if (user) {
 *       token.id = user.id;
 *       token.role = user.role;
 *       token.districtIds = user.districtIds;
 *     }
 *     return token;
 *   }
 *
 * So the injected JWT needs id + role + districtIds (plus the
 * standard sub/email/name fields).
 */

export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Build the JWT payload that mirrors what the live
 * authOptions.callbacks.jwt produces on real sign-in. Pure
 * function so vitest can verify the shape without a real Page.
 *
 * Note: we deliberately do NOT include iat/exp here. NextAuth's
 * encode() computes them from the maxAge argument so the token's
 * expiry mirrors the runtime session TTL. Setting iat/exp twice
 * has caused inconsistent decode behavior in past versions.
 */
export function buildSessionTokenPayload(input: {
  userId: string;
  email: string;
  name: string;
  role: string;
  districtIds: string[];
}): {
  sub: string;
  email: string;
  name: string;
  id: string;
  role: string;
  districtIds: string[];
} {
  return {
    sub: input.userId,
    email: input.email,
    name: input.name,
    id: input.userId,
    role: input.role,
    districtIds: input.districtIds,
  };
}

let _prisma: PrismaClient | null = null;
function prisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export interface PersonaCredentials {
  email: string;
}

export function cookieNameFor(baseUrl: string): string {
  // NextAuth's default: __Secure-next-auth.session-token over
  // HTTPS, plain next-auth.session-token over HTTP.
  return baseUrl.startsWith("https://")
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

export function hostnameOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Sign in `page` as the given persona. Looks up the seeded user
 * by email, encodes a NextAuth JWT, attaches it as a session
 * cookie on the BrowserContext. Subsequent page navigations are
 * authenticated.
 *
 * Throws if the persona does not exist or NEXTAUTH_SECRET is
 * unset — both are deploy-time prerequisites.
 */
export async function signInAs(
  page: Page,
  creds: string | PersonaCredentials,
): Promise<void> {
  const email = typeof creds === "string" ? creds : creds.email;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "signInAs: NEXTAUTH_SECRET is not set. The Playwright env must " +
        "use the same secret the app encodes JWTs with.",
    );
  }

  const user = await prisma().user.findUnique({
    where: { email },
    include: { districts: { select: { districtId: true } } },
  });
  if (!user) {
    throw new Error(
      `signInAs: persona ${email} not found. Did you run \`npm run db:seed:test\`?`,
    );
  }
  if (!user.active) {
    throw new Error(`signInAs: persona ${email} is inactive.`);
  }

  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = buildSessionTokenPayload({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    districtIds: user.districts.map((d) => d.districtId),
  });
  const token = await encode({
    secret,
    token: payload,
    maxAge: SESSION_TTL_SECONDS,
  });

  await page.context().addCookies([
    {
      name: cookieNameFor(baseURL),
      value: token,
      domain: hostnameOf(baseURL),
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: baseURL.startsWith("https://"),
      expires: nowSeconds + SESSION_TTL_SECONDS,
    },
  ]);
}

/**
 * Sign out by clearing every cookie on the context. Faster + more
 * reliable than navigating to /signout.
 */
export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/**
 * Persona email constants. Use these in spec files instead of
 * inline string literals so a rename of the seeded persona
 * doesn't break every spec individually.
 */
export const PERSONA = {
  ADMIN: "alex@example.test",
  OPS_MANAGER: "olivia@example.test",
  DISPATCHER: "dana@example.test",
  TECHNICIAN: "tess@example.test",
  WAREHOUSE: "wes@example.test",
  DRIVER: "dante@example.test",
  READ_ONLY: "ray@example.test",
} as const;
