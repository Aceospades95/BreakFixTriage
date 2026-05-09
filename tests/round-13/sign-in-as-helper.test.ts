import { describe, expect, it } from "vitest";
import { decode, encode } from "next-auth/jwt";
import {
  buildSessionTokenPayload,
  cookieNameFor,
  hostnameOf,
  PERSONA,
  SESSION_TTL_SECONDS,
} from "../../e2e/lib/sign-in-as";

/**
 * Round-13 §4D + hotfix — sign-in-as helper unit tests.
 *
 * Two tracks:
 *   1. Pure function shape — buildSessionTokenPayload produces a
 *      JWT payload that matches the live authOptions.callbacks.jwt
 *      output (id + role + districtIds in addition to the standard
 *      sub/email/name/iat/exp).
 *   2. Round-trip — encode + decode with a stable secret returns
 *      the same payload, proving the cookie value the helper sets
 *      will actually be readable by the running app.
 *
 * The full Playwright walk (cookie set → /me/preferences signed-in)
 * runs in CI under the @persona tag.
 */

describe("Round-13 §4D — sign-in-as helper", () => {
  const SECRET = "test-secret-do-not-use-in-prod-32chars";

  describe("buildSessionTokenPayload", () => {
    it("produces sub + email + name + id + role + districtIds", () => {
      const p = buildSessionTokenPayload({
        userId: "u_abc",
        email: "alex@example.test",
        name: "Alex Admin",
        role: "ADMIN",
        districtIds: ["d_bx"],
      });
      expect(p.sub).toBe("u_abc");
      expect(p.email).toBe("alex@example.test");
      expect(p.name).toBe("Alex Admin");
      expect(p.id).toBe("u_abc");
      expect(p.role).toBe("ADMIN");
      expect(p.districtIds).toEqual(["d_bx"]);
    });

    it("mirrors authOptions.callbacks.jwt — copies id + role + districtIds", () => {
      const p = buildSessionTokenPayload({
        userId: "u_abc",
        email: "alex@example.test",
        name: "Alex Admin",
        role: "ADMIN",
        districtIds: ["d_bx", "d_qns"],
      });
      expect(p.id).toBe("u_abc");
      expect(p.role).toBe("ADMIN");
      expect(p.districtIds).toEqual(["d_bx", "d_qns"]);
    });

    it("does NOT include iat/exp — encode() computes from maxAge", () => {
      const p = buildSessionTokenPayload({
        userId: "u",
        email: "x@y.test",
        name: "x",
        role: "READ_ONLY",
        districtIds: [],
      });
      expect(p).not.toHaveProperty("iat");
      expect(p).not.toHaveProperty("exp");
    });
  });

  describe("encode / decode round-trip", () => {
    it("decoded JWT contains id + role + districtIds — the shape the app reads", async () => {
      const payload = buildSessionTokenPayload({
        userId: "u_alex",
        email: "alex@example.test",
        name: "Alex Admin",
        role: "ADMIN",
        districtIds: ["d_bx"],
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      const encoded = await encode({
        secret: SECRET,
        token: payload,
        maxAge: SESSION_TTL_SECONDS,
      });
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(20);

      const decoded = await decode({ secret: SECRET, token: encoded });
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe("u_alex");
      expect(decoded?.role).toBe("ADMIN");
      expect(decoded?.districtIds).toEqual(["d_bx"]);
      expect(decoded?.email).toBe("alex@example.test");
    });

    it("a token signed with secret A does NOT decode with secret B", async () => {
      const payload = buildSessionTokenPayload({
        userId: "u_alex",
        email: "alex@example.test",
        name: "Alex",
        role: "ADMIN",
        districtIds: [],
      });
      const encoded = await encode({
        secret: "secret-A",
        token: payload,
        maxAge: SESSION_TTL_SECONDS,
      });
      // jose throws JWEDecryptionFailed when the secret doesn't
      // match. NextAuth's runtime wraps this and treats the
      // session as anonymous; the test asserts the throw to
      // pin the negative path.
      await expect(
        decode({ secret: "secret-B", token: encoded }),
      ).rejects.toThrow();
    });
  });

  describe("cookieNameFor", () => {
    it("HTTP base URL → next-auth.session-token", () => {
      expect(cookieNameFor("http://127.0.0.1:3000")).toBe(
        "next-auth.session-token",
      );
    });

    it("HTTPS base URL → __Secure-next-auth.session-token", () => {
      expect(cookieNameFor("https://triage.omnia-house.com")).toBe(
        "__Secure-next-auth.session-token",
      );
    });
  });

  describe("hostnameOf", () => {
    it("extracts hostname from a URL", () => {
      expect(hostnameOf("http://127.0.0.1:3000")).toBe("127.0.0.1");
      expect(hostnameOf("https://triage.omnia-house.com/foo")).toBe(
        "triage.omnia-house.com",
      );
    });

    it("falls back to 127.0.0.1 on invalid URL", () => {
      expect(hostnameOf("not a url")).toBe("127.0.0.1");
    });
  });

  describe("PERSONA constants", () => {
    it("ships an entry for every role in the rbac matrix", () => {
      expect(PERSONA.ADMIN).toBe("alex@example.test");
      expect(PERSONA.OPS_MANAGER).toBe("olivia@example.test");
      expect(PERSONA.DISPATCHER).toBe("dana@example.test");
      expect(PERSONA.TECHNICIAN).toBe("tess@example.test");
      expect(PERSONA.WAREHOUSE).toBe("wes@example.test");
      expect(PERSONA.DRIVER).toBe("dante@example.test");
      expect(PERSONA.READ_ONLY).toBe("ray@example.test");
    });
  });

  describe("helper does NOT call the credentials endpoint", () => {
    it("source contains no /api/auth/callback/credentials POST", async () => {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const src = readFileSync(
        join(process.cwd(), "e2e/lib/sign-in-as.ts"),
        "utf8",
      );
      expect(
        src.includes("/api/auth/callback/credentials"),
        "Round-13 §4D forbids the password-form path. Use JWT cookie injection.",
      ).toBe(false);
      expect(
        src.includes("/api/auth/csrf"),
        "Round-13 §4D forbids the CSRF token fetch path.",
      ).toBe(false);
    });

    it("source uses encode from next-auth/jwt", async () => {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const src = readFileSync(
        join(process.cwd(), "e2e/lib/sign-in-as.ts"),
        "utf8",
      );
      expect(src).toContain('from "next-auth/jwt"');
      expect(src).toContain("encode({");
    });
  });
});
