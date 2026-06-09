import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-13 §2 + §4B + §4D structural gates.
 *
 * Persona Playwright specs runtime depends on §1E. Structural
 * tests pin the scaffolding (file presence, helper export,
 * routes manifest shape) so a refactor doesn't silently break
 * the suite.
 */

describe("Round-13 §4B — routes manifest", () => {
  const src = read("src/lib/routes-manifest.ts");

  it("exports ROUTES_MANIFEST + SIDEBAR_HREFS + assertSidebarHrefsAreKnownRoutes", () => {
    expect(src).toContain("export const ROUTES_MANIFEST");
    expect(src).toContain("export const SIDEBAR_HREFS");
    expect(src).toContain("export function assertSidebarHrefsAreKnownRoutes");
  });

  it("manifest covers every persona-target route from sitemap.md", async () => {
    const { ROUTES_MANIFEST, findRoute } = await import(
      "../../src/lib/routes-manifest"
    );
    expect(ROUTES_MANIFEST.length).toBeGreaterThanOrEqual(50);
    // Anchor a few key paths.
    expect(findRoute("/")).toBeDefined();
    expect(findRoute("/tickets")).toBeDefined();
    expect(findRoute("/admin")).toBeDefined();
    expect(findRoute("/scheduling/people")).toBeDefined();
    expect(findRoute("/people")).toBeDefined();
    // Round-15 (B11): /people graduated from a redirect to a real
    // directory page; it no longer declares redirectsTo.
    expect(findRoute("/people")?.redirectsTo).toBeUndefined();
  });
});

describe("Round-13 §4D — sign-in-as helper", () => {
  const path = join(ROOT, "e2e/lib/sign-in-as.ts");
  it("ships at e2e/lib/sign-in-as.ts", () => {
    expect(existsSync(path)).toBe(true);
  });

  it("exports signInAs + PERSONA constants for all 7 roles", () => {
    const src = readFileSync(path, "utf8");
    expect(src).toContain("export async function signInAs");
    expect(src).toContain("export const PERSONA");
    for (const role of [
      "ADMIN",
      "OPS_MANAGER",
      "DISPATCHER",
      "TECHNICIAN",
      "WAREHOUSE",
      "DRIVER",
      "READ_ONLY",
    ] as const) {
      expect(src).toContain(`${role}:`);
    }
  });

  it("uses JWT cookie injection — does NOT hit the credentials form endpoint", () => {
    // Round-13 hotfix flipped this from POST credentials to
    // direct JWT cookie injection. Pin the new path + the
    // explicit absence of the old one so a regression to the
    // form-POST shape fails the gate.
    const src = readFileSync(path, "utf8");
    expect(src).toContain('from "next-auth/jwt"');
    expect(src).toContain("encode({");
    expect(src).toContain("addCookies");
    expect(src).not.toContain("/api/auth/csrf");
    expect(src).not.toContain("/api/auth/callback/credentials");
  });
});

describe("Round-13 §2A-§2G — 7 persona spec files", () => {
  const SPECS = [
    "driver",
    "technician",
    "dispatcher",
    "ops-manager",
    "warehouse",
    "read-only",
    "admin-destructive",
  ] as const;

  for (const persona of SPECS) {
    it(`${persona} spec exists at e2e/personas/${persona}.spec.ts`, () => {
      const p = join(ROOT, `e2e/personas/${persona}.spec.ts`);
      expect(existsSync(p)).toBe(true);
      const src = readFileSync(p, "utf8");
      expect(src).toContain('import { signInAs');
      expect(src).toContain('PERSONA.');
    });
  }

  it("destructive-action specs assert audit row writes", () => {
    const driver = read("e2e/personas/driver.spec.ts");
    expect(driver).toContain("prisma.auditLog.findFirst");
    const tech = read("e2e/personas/technician.spec.ts");
    expect(tech).toContain('action: "ticket.pick_up"');
    const adminDestructive = read("e2e/personas/admin-destructive.spec.ts");
    expect(adminDestructive).toContain('action: "2fa:admin-reset"');
    expect(adminDestructive).toContain('action: "user.sessions.revoke_all"');
  });

  it("read-only spec asserts 401/403 on every mutation API endpoint", () => {
    const src = read("e2e/personas/read-only.spec.ts");
    expect(src).toContain("expect([401, 403]).toContain(resp.status())");
  });
});

describe("Round-13 §1E + §4C — contrast-sweep spec", () => {
  it("ships at e2e/contrast-sweep.spec.ts with @contrast tag", () => {
    const path = join(ROOT, "e2e/contrast-sweep.spec.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("@contrast");
  });

  it("walks all 12 most-visited pages in BOTH light and dark modes", () => {
    const src = read("e2e/contrast-sweep.spec.ts");
    for (const path of [
      "/",
      "/my-day",
      "/tickets",
      "/tickets/INC9990000",
      "/tickets/kanban",
      "/bench",
      "/scheduling",
      "/scheduling/people",
      "/dashboards",
      "/admin",
      "/admin/users",
      "/profile",
    ]) {
      expect(src).toContain(`"${path}"`);
    }
    expect(src).toContain('name: "light"');
    expect(src).toContain('name: "dark"');
  });

  it("uses cookie injection to pick theme — never relies on system preference", () => {
    const src = read("e2e/contrast-sweep.spec.ts");
    expect(src).toContain('name: "theme"');
    expect(src).toContain("addCookies");
  });

  it("asserts contrast ratio ≥ 4.5:1 + data-theme-resolved is never 'pending'", () => {
    const src = read("e2e/contrast-sweep.spec.ts");
    expect(src).toContain("toBeGreaterThanOrEqual(4.5)");
    expect(src).toContain('not.toBe("pending")');
  });
});

describe("Round-13 §4E — verify-deploy.sh extension", () => {
  const src = read("scripts/verify-deploy.sh");

  it("hits /api/health and asserts 200", () => {
    expect(src).toContain("/api/health");
  });

  it("emits a one-line 'Round-13 health: OK' summary", () => {
    expect(src).toContain('Round-13 health: OK');
    expect(src).toContain('Round-13 health: FAIL');
  });
});
