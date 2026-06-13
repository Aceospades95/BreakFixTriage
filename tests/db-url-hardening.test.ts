import { describe, expect, it } from "vitest";
import { hardenDatabaseUrl } from "@/lib/db/prisma";

/**
 * Phase-0 reliability — the Prisma datasource URL gets pool sizing and
 * Postgres session timeouts injected when the operator hasn't set them,
 * and the operator's explicit values always win.
 */

describe("hardenDatabaseUrl", () => {
  it("injects pool + timeout defaults when absent", () => {
    const out = hardenDatabaseUrl(
      "postgresql://u:p@localhost:5432/db?schema=public",
    )!;
    const url = new URL(out);
    expect(url.searchParams.get("schema")).toBe("public");
    expect(url.searchParams.get("connection_limit")).toBe("10");
    expect(url.searchParams.get("pool_timeout")).toBe("10");
    const options = url.searchParams.get("options")!;
    expect(options).toContain("statement_timeout=30000");
    expect(options).toContain("lock_timeout=10000");
    expect(options).toContain("idle_in_transaction_session_timeout=60000");
  });

  it("keeps operator-supplied values untouched", () => {
    const out = hardenDatabaseUrl(
      "postgresql://u:p@h:5432/db?connection_limit=3&pool_timeout=2&options=-c%20lock_timeout%3D5000",
    )!;
    const url = new URL(out);
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("2");
    expect(url.searchParams.get("options")).toBe("-c lock_timeout=5000");
  });

  it("passes through undefined and unparseable values", () => {
    expect(hardenDatabaseUrl(undefined)).toBeUndefined();
    expect(hardenDatabaseUrl("not a url")).toBe("not a url");
  });
});
