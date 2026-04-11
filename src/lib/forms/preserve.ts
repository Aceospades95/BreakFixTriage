/**
 * Form-input preservation.
 *
 * Problem: server actions that validate their input with Zod redirect
 * with `?error=...` on failure, and the user loses every field they
 * typed. For a dispatcher filling out an 8-field "new school" form
 * and getting one ZIP wrong, this is maddening.
 *
 * Solution: on validation failure, server actions also serialize the
 * submitted FormData into a URL-safe `?form=` parameter. Page
 * components read that param, parse it back into a plain object, and
 * pass the values to their form inputs as `defaultValue`. The user
 * sees their typing preserved and can just fix the one bad field.
 *
 * Encoding is JSON + base64url so it safely rides through
 * URLSearchParams. We skip File fields because a binary blob
 * shouldn't bounce through the URL — and it wouldn't anyway.
 */

/**
 * Encode a FormData object into a base64url-encoded JSON string
 * suitable for stuffing into a query param.
 *
 * Optional `allow` list restricts which fields round-trip; useful
 * when some fields (passwords, secrets) should NOT be echoed back.
 */
export function encodeFormData(
  formData: FormData,
  allow?: readonly string[],
): string {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(Array.from(formData.keys()))) {
    if (allow && !allow.includes(key)) continue;
    const values = formData
      .getAll(key)
      .filter((v): v is string => typeof v === "string");
    if (values.length === 0) continue;
    out[key] = values.length === 1 ? values[0]! : values;
  }
  const json = JSON.stringify(out);
  // btoa is not available in Node, so use Buffer.
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decode a preserved form back into a plain object. Returns an
 * empty object on any failure, which keeps the call sites clean:
 *
 *   const values = decodePreservedForm(searchParams?.form);
 *   <input defaultValue={typeof values.name === "string" ? values.name : ""} />
 */
export function decodePreservedForm(
  encoded: string | undefined | null,
): Record<string, string | string[]> {
  if (!encoded) return {};
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") {
        out[k] = v;
      } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        out[k] = v as string[];
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Single-field getter with a safe fallback. Reduces boilerplate
 * in the form JSX: `preserved(values, "email")` rather than a ternary.
 */
export function preserved(
  values: Record<string, string | string[]>,
  field: string,
  fallback = "",
): string {
  const v = values[field];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return fallback;
}

/**
 * Build a redirect URL that includes both `error` and a preserved
 * form snapshot, so a single `redirect()` call on validation
 * failure keeps the user on the same page with their input intact.
 */
export function errorRedirectWithForm(
  base: string,
  error: string,
  formData: FormData,
  allow?: readonly string[],
): string {
  const sp = new URLSearchParams();
  sp.set("error", error);
  sp.set("form", encodeFormData(formData, allow));
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${sp.toString()}`;
}
