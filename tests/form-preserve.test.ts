import { describe, it, expect } from "vitest";
import {
  decodePreservedForm,
  encodeFormData,
  errorRedirectWithForm,
  preserved,
} from "@/lib/forms/preserve";

/**
 * Tests for the Phase 11 form-preservation helpers. The whole point
 * is that a user typing 12 fields into "new school" and getting a
 * ZIP wrong doesn't re-type 12 fields — the submitted FormData
 * round-trips through a query param safely.
 */

function makeFormData(entries: Array<[string, string]>): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("encodeFormData / decodePreservedForm", () => {
  it("round-trips a single-value form", () => {
    const fd = makeFormData([
      ["name", "Brooklyn Tech"],
      ["email", "contact@bt.nyc"],
    ]);
    const encoded = encodeFormData(fd);
    const decoded = decodePreservedForm(encoded);
    expect(decoded.name).toBe("Brooklyn Tech");
    expect(decoded.email).toBe("contact@bt.nyc");
  });

  it("round-trips multi-value fields as arrays", () => {
    const fd = makeFormData([
      ["districtIds", "d1"],
      ["districtIds", "d2"],
      ["districtIds", "d3"],
      ["name", "Alice"],
    ]);
    const decoded = decodePreservedForm(encodeFormData(fd));
    expect(decoded.districtIds).toEqual(["d1", "d2", "d3"]);
    expect(decoded.name).toBe("Alice");
  });

  it("honors the allow-list and drops disallowed fields", () => {
    const fd = makeFormData([
      ["email", "alice@example.com"],
      ["password", "super-secret"],
      ["name", "Alice"],
    ]);
    const decoded = decodePreservedForm(encodeFormData(fd, ["email", "name"]));
    expect(decoded.email).toBe("alice@example.com");
    expect(decoded.name).toBe("Alice");
    expect(decoded.password).toBeUndefined();
  });

  it("returns an empty object for undefined input", () => {
    expect(decodePreservedForm(undefined)).toEqual({});
    expect(decodePreservedForm(null)).toEqual({});
    expect(decodePreservedForm("")).toEqual({});
  });

  it("returns an empty object for malformed input", () => {
    expect(decodePreservedForm("!!!not-base64!!!")).toEqual({});
    // Valid base64 but not JSON.
    const gibberish = Buffer.from("nope", "utf8").toString("base64url");
    expect(decodePreservedForm(gibberish)).toEqual({});
    // Valid JSON but not an object.
    const arr = Buffer.from("[1,2,3]", "utf8").toString("base64url");
    expect(decodePreservedForm(arr)).toEqual({});
  });

  it("survives characters that would break a naked query string", () => {
    const fd = makeFormData([
      ["notes", "Value with = and & and # and + signs"],
      ["title", 'She said "hello" — 🎉'],
    ]);
    const encoded = encodeFormData(fd);
    // base64url is URL-safe by construction.
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodePreservedForm(encoded);
    expect(decoded.notes).toContain("= and &");
    expect(decoded.title).toContain("🎉");
  });
});

describe("preserved", () => {
  it("returns a string value directly", () => {
    expect(preserved({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("returns the first element of an array value", () => {
    expect(preserved({ tags: ["a", "b"] }, "tags")).toBe("a");
  });

  it("returns the fallback when the key is missing", () => {
    expect(preserved({}, "name")).toBe("");
    expect(preserved({}, "name", "default")).toBe("default");
  });
});

describe("errorRedirectWithForm", () => {
  it("builds a URL with error and form params", () => {
    const fd = makeFormData([["name", "Alice"]]);
    const url = errorRedirectWithForm("/admin/users/new", "bad email", fd);
    expect(url).toContain("/admin/users/new?");
    expect(url).toContain("error=bad+email");
    expect(url).toMatch(/form=[A-Za-z0-9_-]+/);
  });

  it("appends params to a URL that already has a query string", () => {
    const fd = makeFormData([["name", "Alice"]]);
    const url = errorRedirectWithForm(
      "/admin/users/new?tab=staff",
      "nope",
      fd,
    );
    expect(url).toContain("/admin/users/new?tab=staff&");
    expect(url).toContain("error=nope");
  });

  it("respects the allow list for preserved fields", () => {
    const fd = makeFormData([
      ["email", "alice@example.com"],
      ["password", "secret"],
    ]);
    const url = errorRedirectWithForm(
      "/admin/users/new",
      "nope",
      fd,
      ["email"],
    );
    // Pull out the form= param and decode it to confirm password was
    // NOT included.
    const match = url.match(/form=([^&]+)/);
    expect(match).not.toBeNull();
    const decoded = decodePreservedForm(decodeURIComponent(match![1]!));
    expect(decoded.email).toBe("alice@example.com");
    expect(decoded.password).toBeUndefined();
  });
});
