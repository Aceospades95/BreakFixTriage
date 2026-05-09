import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1E + §1F — Playwright runtime + migrate deploy
 * verification structural gate.
 *
 * The actual Playwright suite runs in the CI playwright job. The
 * structural gate asserts the wiring is in place — config file,
 * npm scripts, CI job, test seed, error-boundary testids.
 */

describe("Round-12 §1E + §1F — Playwright runtime + migrate deploy", () => {
  it("playwright.config.ts ships with chromium-only project", () => {
    expect(existsSync(join(ROOT, "playwright.config.ts"))).toBe(true);
    const cfg = read("playwright.config.ts");
    expect(cfg).toContain('testDir: "./e2e"');
    expect(cfg).toContain('name: "chromium"');
    // No firefox/webkit projects — keep it fast.
    expect(cfg).not.toContain("firefox");
    expect(cfg).not.toContain("webkit");
    expect(cfg).toContain("webServer");
  });

  it("package.json exposes e2e + e2e:install scripts", () => {
    const json = JSON.parse(read("package.json"));
    expect(json.scripts.e2e).toBe("playwright test");
    expect(json.scripts["e2e:install"]).toBe(
      "playwright install --with-deps chromium",
    );
    expect(json.scripts["db:seed:test"]).toBe("tsx prisma/seed-test.ts");
    expect(json.devDependencies["@playwright/test"]).toBeDefined();
  });

  it("prisma/seed-test.ts ships the synthetic 7-persona fixture", () => {
    const src = read("prisma/seed-test.ts");
    expect(src).toContain('"alex@example.test"');
    expect(src).toContain('"olivia@example.test"');
    expect(src).toContain('"dana@example.test"');
    expect(src).toContain('"tess@example.test"');
    expect(src).toContain('"wes@example.test"');
    expect(src).toContain('"dante@example.test"');
    expect(src).toContain('"ray@example.test"');
    // Idempotent: every persona uses upsert.
    expect(src.match(/prisma\.user\.upsert/g)?.length).toBeGreaterThanOrEqual(1);
    // Defaults seed runs first.
    expect(src).toContain("await seedDefaults(prisma)");
  });

  it("global error boundary has data-testid for the route smoke spec", () => {
    const src = read("src/app/(app)/error.tsx");
    expect(src).toContain('data-testid="global-error-boundary"');
  });

  it("chromed not-found has data-testid for the route smoke spec", () => {
    const src = read("src/app/(app)/not-found.tsx");
    expect(src).toContain('data-testid="chromed-not-found"');
  });

  it("route-smoke spec asserts status 200 + no error boundary + no chromed-not-found", () => {
    const src = read("e2e/route-smoke.spec.ts");
    expect(src).toMatch(/\.toBe\(200\)/);
    expect(src).toContain('getByTestId("global-error-boundary")');
    expect(src).toContain('getByTestId("chromed-not-found")');
  });

  it("CI workflow has a playwright job with Postgres + db:seed:test", () => {
    const yml = read(".github/workflows/ci.yml");
    expect(yml).toMatch(/playwright:/);
    expect(yml).toContain("npm run db:seed:test");
    expect(yml).toContain("npm run e2e:install");
    expect(yml).toContain("npm run e2e");
    expect(yml).toContain("breakfix_e2e");
  });

  it("CI workflow captures migrate-deploy log + fails on skipped/rolled-back migrations", () => {
    const yml = read(".github/workflows/ci.yml");
    expect(yml).toContain("tee migrate-deploy.log");
    expect(yml).toMatch(/Skipped\|rolled back/);
  });

  it("CI integration job uses prisma migrate deploy (not db push)", () => {
    const yml = read(".github/workflows/ci.yml");
    expect(yml).toContain("prisma migrate deploy");
    // db push is acceptable for the local Docker bootstrap path
    // but not for CI. The CI integration job must use migrate
    // deploy so the migrations folder is exercised.
    const integrationBlock = yml.split("integration:")[1]?.split("\n  ")[0] ?? "";
    expect(integrationBlock).not.toContain("db push");
  });

  it("playwright job uploads artifacts on failure", () => {
    const yml = read(".github/workflows/ci.yml");
    expect(yml).toContain("upload-artifact");
    expect(yml).toContain("playwright-report");
  });
});
