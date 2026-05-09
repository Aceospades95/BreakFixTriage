import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  translateImportError,
  sanitize,
} from "@/lib/import/error-translate";

/**
 * Closes findings §3.A3.
 *
 * The translator must (a) produce an operator-readable string for
 * each known Prisma P-code we care about, and (b) never let any
 * Prisma stack signature leak through. The forbidden-token
 * regression test in tests/forbidden-tokens.test.ts double-checks
 * that no output crosses the wire with banned substrings.
 */

const FORBIDDEN_PATTERNS = [
  /prisma\./i,
  /\binvocation\b/i,
  /\bP\d{4}\b/,
];

function makeKnown(
  code: string,
  meta: Record<string, unknown> = {},
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Synthetic ${code} error from prisma.device.upsert() invocation`,
    { code, clientVersion: "5.22.0", meta },
  );
}

describe("translateImportError — P-code mapping (§3.A3)", () => {
  it("P2002 unique conflict on assetTag includes the offending value", () => {
    const err = makeKnown("P2002", { target: ["assetTag"] });
    const out = translateImportError(err, { assetTag: "AT-86114" });
    expect(out).toMatch(/AT-86114/);
    expect(out).toMatch(/already in use/i);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("P2002 unique conflict on serialNumber includes the serial", () => {
    const err = makeKnown("P2002", { target: ["serialNumber"] });
    const out = translateImportError(err, { serialNumber: "SN-9001" });
    expect(out).toMatch(/SN-9001/);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("P2002 with no useful row context still returns a friendly message", () => {
    const err = makeKnown("P2002", { target: ["incidentNumber"] });
    const out = translateImportError(err);
    expect(out).toMatch(/already in use/i);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("P2003 foreign-key violation explains the missing parent", () => {
    const err = makeKnown("P2003", { target: ["schoolId"] });
    const out = translateImportError(err, { schoolCode: "11X101" });
    expect(out).toMatch(/does not exist/i);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("P2025 record-not-found is operator-readable", () => {
    const err = makeKnown("P2025");
    const out = translateImportError(err);
    expect(out).toMatch(/does not exist/i);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("Unknown P-code falls back to a generic friendly message", () => {
    const err = makeKnown("P9999");
    const out = translateImportError(err);
    expect(out).toMatch(/database/i);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("Plain Error.message is sanitized of Prisma stack tokens", () => {
    const err = new Error(
      "Invalid `prisma.user.create()` invocation: oh no",
    );
    const out = translateImportError(err);
    for (const f of FORBIDDEN_PATTERNS) expect(out).not.toMatch(f);
  });

  it("Non-Error values produce a friendly fallback", () => {
    expect(translateImportError("string error")).toMatch(/unknown/i);
    expect(translateImportError(null)).toMatch(/unknown/i);
  });
});

describe("sanitize() defense-in-depth", () => {
  it("strips prisma.X.Y(): invocation prefixes", () => {
    expect(
      sanitize(
        "Invalid `prisma.ticket.upsert()` invocation: something",
      ),
    ).not.toMatch(/prisma\./i);
  });

  it("strips bare P-codes", () => {
    expect(sanitize("Conflict P2002 happened")).not.toMatch(/P2002/);
  });

  it("preserves the human portion", () => {
    expect(sanitize("operation failed: timed out")).toMatch(/timed out/);
  });
});
