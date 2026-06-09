import { expect, type Page, type Response } from "@playwright/test";

/**
 * Round-13 hotfix — shared blocked-page detector for persona
 * specs.
 *
 * Why this is its own helper: the original per-spec inline check
 * was:
 *
 *   const blocked =
 *     (resp?.status() ?? 0) >= 400 ||
 *     page.url().includes("/forbidden") ||
 *     page.url().includes("?error=") ||
 *     !page.url().includes(path);
 *
 * That misses the case where a server component throws
 * AuthorizationError and Next.js's `(app)/error.tsx` boundary
 * catches it. The boundary returns HTTP 200 with the URL
 * unchanged — no signal in either status or URL — but the DOM
 * contains "Access denied" or "Something broke on this page".
 *
 * `expectBlocked` checks both the status / URL signals AND the
 * DOM error-boundary signal. False positives are unlikely
 * because the literal "Access denied" text is the explicit
 * boundary copy from src/app/(app)/error.tsx.
 */
export async function expectBlocked(
  page: Page,
  resp: Response | null,
  path: string,
  persona: string,
): Promise<void> {
  // Round-14 — requireRole now redirects to /forbidden. Because the
  // (app) loading.tsx boundary streams the response, the redirect
  // arrives as a client navigation that may still be in flight when
  // goto() resolves; give it a moment to land before sampling.
  if ((resp?.status() ?? 0) < 400 && !page.url().includes("/forbidden")) {
    await page
      .waitForURL(/\/(forbidden|signin)/, { timeout: 5_000 })
      .catch(() => {});
  }
  const html = await page.content();
  const blocked =
    (resp?.status() ?? 0) >= 400 ||
    page.url().includes("/forbidden") ||
    page.url().includes("?error=") ||
    !page.url().includes(path) ||
    html.includes("Access denied") ||
    html.includes("Something broke on this page");
  expect(
    blocked,
    `${persona} should NOT see ${path}; status=${resp?.status()} url=${page.url()}`,
  ).toBe(true);
}

/**
 * Counterpart that asserts the page IS reachable (200 + no error
 * boundary). Use for "read-allowed" routes where the persona
 * should see content but may not write.
 */
export async function expectReadable(
  page: Page,
  resp: Response | null,
  path: string,
  persona: string,
): Promise<void> {
  expect(
    resp?.status() ?? 0,
    `${persona} should READ ${path} (200), got ${resp?.status()}`,
  ).toBe(200);
  const html = await page.content();
  expect(
    html.includes("Access denied"),
    `${persona} hit the Access denied boundary on ${path}`,
  ).toBe(false);
  expect(
    html.includes("Something broke on this page"),
    `${persona} hit the error boundary on ${path}`,
  ).toBe(false);
}
