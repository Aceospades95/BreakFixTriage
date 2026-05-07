import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 §1C — UserSession write-path regression gate.
 *
 * R10 shipped the UserSession schema and the sign-in event but
 * never wired the lastSeenAt / ip / UA touch — production showed
 * "No sessions recorded yet" for every user. R11 lands the touch
 * inside the (app) layout server component (Node runtime, can
 * reach Prisma) and adds privacy-aware hashing.
 */

describe("Round-11 §1C — UserSession touch + revoke wiring", () => {
  it("schema renames raw IP/UA to ipHash/uaFingerprint and adds expiresAt", () => {
    const src = read("prisma/schema.prisma");
    const block = src.match(/model UserSession[\s\S]*?\n\}/)?.[0] ?? "";
    expect(block).toContain("ipHash        String?");
    expect(block).toContain("uaFingerprint String?");
    expect(block).toContain("expiresAt     DateTime?");
    expect(block).not.toMatch(/^\s+ip\s+String\?/m);
    expect(block).not.toMatch(/^\s+userAgent\s+String\?/m);
  });

  it("sessions lib exposes touchSession + hashing helpers", () => {
    const src = read("src/lib/auth/sessions.ts");
    expect(src).toContain("export function hashIp");
    expect(src).toContain("export function hashUserAgent");
    expect(src).toContain("export async function touchSession");
    expect(src).toContain("export async function revokeAllSessionsForUser");
    expect(src).toContain("export async function revokeMostRecentSessionForUser");
  });

  it("touchSession debounces lastSeenAt updates to 1/min", () => {
    const src = read("src/lib/auth/sessions.ts");
    expect(src).toContain("TOUCH_DEBOUNCE_MS = 60 * 1000");
    expect(src).toContain('select: { id: true, lastSeenAt: true');
  });

  it("touchSession hashes IP+UA with a salt before writing", () => {
    const src = read("src/lib/auth/sessions.ts");
    expect(src).toContain("AUTH_SESSION_SALT");
    expect(src).toContain('createHash("sha256")');
  });

  it("(app)/layout.tsx fires touchSession with x-forwarded-for + UA", () => {
    const src = read("src/app/(app)/layout.tsx");
    expect(src).toContain('from "@/lib/auth/sessions"');
    expect(src).toContain('h.get("x-forwarded-for")');
    expect(src).toContain('h.get("user-agent")');
    expect(src).toContain("touchSession(session.userId");
  });

  it("auth.ts signIn event creates session with expiresAt", () => {
    const src = read("src/lib/auth/auth.ts");
    expect(src).toContain("prisma.userSession.create");
    expect(src).toContain("expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)");
  });

  it("auth.ts signOut event revokes the most recent session", () => {
    const src = read("src/lib/auth/auth.ts");
    expect(src).toMatch(/async signOut\(\{ token \}\)/);
    expect(src).toContain("revokeMostRecentSessionForUser(userId)");
  });

  it("revokeAllUserSessionsAction writes user.sessions.revoke_all audit", () => {
    const src = read("src/server/actions/2fa.ts");
    expect(src).toContain('action: "user.sessions.revoke_all"');
    expect(src).not.toContain('action: "user.sessions_revoked"');
  });

  it("Recent sessions panel reads ipHash + uaFingerprint, sorts by lastSeenAt", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toContain("s.ipHash ?? ");
    expect(src).toContain("s.uaFingerprint ?? ");
    expect(src).toContain("orderBy: { lastSeenAt: ");
    expect(src).not.toContain("s.userAgent");
  });
});
