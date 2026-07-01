/**
 * Round-22 (demo feedback) — warranty helpers.
 *
 * "We have picked up out-of-warranty devices and had to end up sending
 * them back": the warranty status must be visible on the ticket and on
 * the pickup checklist. And manufacturer case numbers should hyperlink
 * to the vendor's case page where the URL shape is predictable
 * (Apple's is; Keon is documenting the rest) — the templates are
 * admin-configurable so new vendors are a settings edit, not a deploy.
 */

export const WARRANTY_URL_TEMPLATES_SETTING_KEY =
  "warranty.caseUrlTemplates";

export type WarrantyStatus =
  | { kind: "in"; expires: Date }
  | { kind: "out"; expired: Date }
  | { kind: "unknown" };

/** Classify a device's warranty from its expiry date. */
export function warrantyStatus(
  warrantyExpires: Date | null | undefined,
  now: Date = new Date(),
): WarrantyStatus {
  if (!warrantyExpires) return { kind: "unknown" };
  return warrantyExpires.getTime() >= now.getTime()
    ? { kind: "in", expires: warrantyExpires }
    : { kind: "out", expired: warrantyExpires };
}

export function isOutOfWarranty(
  warrantyExpires: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return warrantyStatus(warrantyExpires, now).kind === "out";
}

/**
 * Parse the admin-authored template list. One per line:
 *
 *   Apple = https://gsx.apple.com/cases/{case}
 *   Dell  = https://www.dell.com/support/case/{case}
 *
 * `{case}` is replaced with the URL-encoded case/RMA number. Vendor
 * match is case-insensitive. Lines without `=` or `{case}` are
 * ignored (and reported by validateCaseUrlTemplates for the settings
 * form).
 */
export function parseCaseUrlTemplates(
  raw: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const vendor = trimmed.slice(0, eq).trim().toLowerCase();
    const template = trimmed.slice(eq + 1).trim();
    if (!vendor || !template.includes("{case}")) continue;
    if (!/^https?:\/\//i.test(template)) continue;
    out[vendor] = template;
  }
  return out;
}

/** Human-readable problems in a template block, for the settings form. */
export function validateCaseUrlTemplates(raw: string): string[] {
  const problems: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      problems.push(`"${trimmed.slice(0, 40)}" — expected "Vendor = https://…{case}"`);
      continue;
    }
    const template = trimmed.slice(eq + 1).trim();
    if (!/^https?:\/\//i.test(template)) {
      problems.push(`"${trimmed.slice(0, 40)}" — the URL must start with http(s)://`);
    } else if (!template.includes("{case}")) {
      problems.push(`"${trimmed.slice(0, 40)}" — the URL needs a {case} placeholder`);
    }
  }
  return problems;
}

/**
 * Resolve a case/RMA number to the vendor's case URL, or null when no
 * template is configured for that vendor.
 */
export function caseUrlFor(
  vendor: string,
  caseNumber: string,
  templates: Record<string, string>,
): string | null {
  const template = templates[vendor.trim().toLowerCase()];
  if (!template) return null;
  return template.replaceAll("{case}", encodeURIComponent(caseNumber.trim()));
}
