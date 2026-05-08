import type { BrowserContext, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Round-13 §4D — credential-injection sign-in for Playwright.
 *
 * The 7 persona specs (driver / tech / dispatcher / ops-manager /
 * warehouse / read-only / admin) all need to land authenticated
 * without going through the password form. We sign in by calling
 * the credentials provider directly and forwarding the resulting
 * NextAuth session cookie into the Playwright context.
 *
 * Why not use the form?
 *   - Faster: one round-trip vs. visit + fill + submit
 *   - Less flaky: no risk of the test typing into a "Pick theme"
 *     button that accidentally has focus
 *   - Doesn't bake the test password into spec source — every
 *     spec that needs to sign in goes through this helper, and
 *     the helper reads the canonical persona credentials from
 *     prisma/seed-test.ts via env vars or the test DB.
 *
 * The persona seed creates each user with password
 * "test-password" by default. Tests that need a different
 * password override via the second argument.
 */

const TEST_PASSWORD = "test-password";

let _prisma: PrismaClient | null = null;
function prisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export interface PersonaCredentials {
  email: string;
  password?: string;
}

/**
 * Sign in `page` as the given persona. Calls the NextAuth
 * credentials endpoint directly and seeds the resulting
 * session cookie into the browser context. Subsequent page
 * navigations are authenticated.
 *
 * @param page Playwright page
 * @param creds either a string email or a {email, password} pair
 */
export async function signInAs(
  page: Page,
  creds: string | PersonaCredentials,
): Promise<void> {
  const email = typeof creds === "string" ? creds : creds.email;
  const password =
    typeof creds === "string" ? TEST_PASSWORD : (creds.password ?? TEST_PASSWORD);

  // Sanity check: the persona must exist before we try to sign
  // them in. Without this the credentials POST returns 401 and
  // the test fails with an opaque "redirect to /signin" symptom.
  const user = await prisma().user.findUnique({
    where: { email },
    select: { id: true, active: true },
  });
  if (!user) {
    throw new Error(
      `signInAs: persona ${email} not found. Did you run \`npm run db:seed:test\`?`,
    );
  }
  if (!user.active) {
    throw new Error(`signInAs: persona ${email} is inactive.`);
  }

  // Hit the NextAuth credentials endpoint directly. The CSRF
  // token is required.
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

  const csrfRes = await page.request.get(`${baseURL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const signInRes = await page.request.post(
    `${baseURL}/api/auth/callback/credentials`,
    {
      form: {
        csrfToken,
        email,
        password,
        json: "true",
      },
      maxRedirects: 0,
      failOnStatusCode: false,
    },
  );

  if (signInRes.status() !== 200 && signInRes.status() !== 302) {
    throw new Error(
      `signInAs(${email}) returned ${signInRes.status()}: ${await signInRes.text()}`,
    );
  }
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
