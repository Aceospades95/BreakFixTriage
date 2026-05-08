import { defineConfig, devices } from "@playwright/test";

/**
 * Round-12 §1E — Playwright runtime config.
 *
 * Chromium-only by design. Firefox / WebKit add ~10 minutes to
 * the CI run for ~zero coverage gain on a Next.js app that
 * intentionally targets Chrome-class browsers.
 *
 * The dev server is started by Playwright via `webServer.command`
 * before the suite runs; CI provisions Postgres + runs
 * `prisma migrate deploy` + `npm run db:seed:test` first so the
 * 7 persona fixtures exist by the time the suite starts.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 5000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
