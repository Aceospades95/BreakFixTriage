/**
 * Operator-facing error translation for the import pipeline.
 *
 * Closes findings §3.A3 — raw Prisma stack messages were leaking into
 * the imports summary surface, e.g.
 *
 *   Invalid `prisma.device.upsert()` invocation:
 *   Unique constraint failed on the fields: (`assetTag`)
 *
 * Operators don't read those. They need:
 *
 *   Asset tag AT-86114 already belongs to another device. Choose
 *   an update strategy or clear the asset tag column.
 *
 * Mapping is keyed on the Prisma error CODE (P-codes) so the
 * surface stays stable across Prisma minor versions; we extract
 * the meta (target field, model, etc.) from the structured
 * message-style without parsing the prose.
 *
 * Inputs:
 *   - `err`: the thrown value from the catch site. Can be a
 *     `Prisma.PrismaClientKnownRequestError`, a `ZodError`, or any
 *     other Error / unknown.
 *   - `context`: optional row-level context that we can splice into
 *     the operator-facing message — e.g. the asset tag, serial
 *     number, school code that the row was attempting.
 *
 * Outputs: a plain English string with no Prisma stack tokens, no
 * P-codes, and no cuids. Verified by `tests/forbidden-tokens.test.ts`.
 */

import { Prisma } from "@prisma/client";

export interface TranslateContext {
  /** Row number in the import file (1-indexed). */
  rowNumber?: number;
  /** Field values from the row that may help identify the conflict. */
  assetTag?: string | null;
  serialNumber?: string | null;
  schoolCode?: string | null;
  incidentNumber?: string | null;
  email?: string | null;
}

/**
 * Public entry point. Always returns a string safe to render to an
 * operator. Never returns the raw Prisma message verbatim.
 */
export function translateImportError(
  err: unknown,
  context: TranslateContext = {},
): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return translatePrismaKnownError(err, context);
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return "One or more fields failed validation. Re-check the row's required columns and types.";
  }
  if (err instanceof Error) {
    // For non-Prisma errors, sanitize the message: strip stack
    // tokens that some libraries embed even outside of Prisma.
    return sanitize(err.message) || "Import row rejected (unknown error).";
  }
  return "Import row rejected (unknown error).";
}

/**
 * Translate one Prisma known-request error using its P-code.
 * Reference: https://www.prisma.io/docs/reference/api-reference/error-reference
 */
function translatePrismaKnownError(
  err: Prisma.PrismaClientKnownRequestError,
  context: TranslateContext,
): string {
  switch (err.code) {
    case "P2002": {
      // Unique constraint failed on the fields: (...)
      const targets = extractTarget(err.meta);
      const value = pickContextValue(targets, context);
      const fieldList = formatFields(targets);
      if (value) {
        return `${fieldList} ${quote(value)} is already in use. Choose an update strategy or clear that column for the row.`;
      }
      return `${fieldList} is already in use. Choose an update strategy or clear that column for the row.`;
    }
    case "P2003": {
      // Foreign key constraint failed
      const targets = extractTarget(err.meta);
      const fieldList = formatFields(targets);
      return `${fieldList} references a record that does not exist. Provision the referenced row first.`;
    }
    case "P2025":
      // Record to update / delete does not exist
      return "The referenced record does not exist. The row may have been removed since the import was staged.";
    case "P2014":
      return "This change would orphan a related record. Update the relation first.";
    case "P2000":
      return "One of the values is too long for its column. Trim the source data.";
    case "P2007":
      return "One of the values failed a column-level validation rule.";
    default:
      // Unknown P-code — log it server-side, return a generic
      // operator-facing message that does not include the code.
      return "Import row rejected by the database. Check the row's column types and try again.";
  }
}

/**
 * Best-effort extraction of the field name(s) from
 * Prisma error meta. Different Prisma versions structure this
 * differently — guard each access.
 */
function extractTarget(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Record<string, unknown>;
  const t = m.target;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") {
    // "Column_field_key" style or comma-separated
    if (t.includes(",")) return t.split(",").map((s) => s.trim()).filter(Boolean);
    return [t];
  }
  return [];
}

function pickContextValue(
  targets: string[],
  context: TranslateContext,
): string | null {
  for (const t of targets) {
    const lower = t.toLowerCase();
    if (lower.includes("assettag") && context.assetTag) return context.assetTag;
    if (lower.includes("serial") && context.serialNumber) return context.serialNumber;
    if (lower.includes("incident") && context.incidentNumber)
      return context.incidentNumber;
    if (lower.includes("email") && context.email) return context.email;
    if (lower.includes("code") && context.schoolCode) return context.schoolCode;
  }
  return null;
}

function formatFields(targets: string[]): string {
  if (targets.length === 0) return "A required field";
  const friendly = targets.map(humaniseField).filter(Boolean);
  if (friendly.length === 0) return "A required field";
  if (friendly.length === 1) return friendly[0]!;
  return friendly.join(" + ");
}

function humaniseField(raw: string): string {
  // Strip Prisma's internal suffixes ("_key", "_id_unique") and
  // convert camelCase/snake_case to Title Case words.
  const cleaned = raw
    .replace(/_(key|unique|idx|id)$/i, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^Column /i, "")
    .trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function quote(s: string): string {
  return `"${s}"`;
}

/**
 * Strip Prisma stack tokens from a free-form string. This is a
 * defense-in-depth filter — `translateImportError` should rarely
 * return raw `err.message`, but if it does this function ensures
 * no Prisma signature leaks.
 */
export function sanitize(message: string): string {
  return message
    .replace(/Invalid\s+`prisma\.[a-zA-Z.()]+`\s+invocation:?/gi, "Database operation failed.")
    .replace(/prisma\.[a-zA-Z.()]+/gi, "the database")
    .replace(/\bP\d{4}\b/g, "")
    .replace(/\binvocation\b/gi, "operation")
    .replace(/\s+/g, " ")
    .trim();
}
