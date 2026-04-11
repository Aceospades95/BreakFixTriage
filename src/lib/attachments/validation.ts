/**
 * Pure validation helpers for file uploads.
 *
 * Kept free of Node and Prisma imports so tests can run without a
 * filesystem or a database. The higher-level storage helper calls
 * these before writing anything.
 */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Allowlist of MIME types we accept. Deliberately conservative — we
 * want photos of damage and signed PDFs, not arbitrary binaries.
 */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
];

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateMimeType(mime: string): ValidationResult {
  if (!mime) return { ok: false, reason: "missing mime type" };
  if (!ALLOWED_MIME_TYPES.includes(mime.toLowerCase())) {
    return {
      ok: false,
      reason: `mime type ${mime} is not allowed; must be one of ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }
  return { ok: true };
}

export function validateSize(bytes: number): ValidationResult {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return { ok: false, reason: "invalid size" };
  }
  if (bytes === 0) return { ok: false, reason: "file is empty" };
  if (bytes > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `file is too large (${Math.round(bytes / 1024)} KB > ${Math.round(MAX_ATTACHMENT_BYTES / 1024)} KB max)`,
    };
  }
  return { ok: true };
}

/**
 * Scrub a user-supplied filename so it can be shown in the UI and
 * used as part of a relative storage path without opening up path
 * traversal or weird shell metacharacter bugs.
 *
 * Rules:
 *   - strip directory separators entirely
 *   - collapse whitespace and control chars to underscores
 *   - restrict to [a-zA-Z0-9._-]
 *   - lowercase the extension
 *   - cap the base at 80 chars so the stored path stays readable
 */
export function sanitizeFilename(raw: string): string {
  const stripped = raw.replace(/[/\\]/g, "");
  // Separate the last extension (if any) from the base.
  const lastDot = stripped.lastIndexOf(".");
  const base = lastDot > 0 ? stripped.slice(0, lastDot) : stripped;
  const ext = lastDot > 0 ? stripped.slice(lastDot + 1) : "";

  const cleanBase =
    base
      // Whitespace (including tabs) → underscores. Must run before the
      // control-char strip, otherwise \t gets deleted silently.
      .replace(/\s+/g, "_")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      // Strip leading dots too so we never produce "hidden" files.
      .replace(/^[._-]+|[_-]+$/g, "")
      .slice(0, 80) || "file";
  const cleanExt =
    ext
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
      .slice(0, 10);

  return cleanExt ? `${cleanBase}.${cleanExt}` : cleanBase;
}

/**
 * Build a relative stored path `YYYY/MM/<uuid>-<sanitized>` from a
 * raw filename + generated id. The date partitioning keeps any
 * single directory from growing unbounded.
 */
export function buildStoredPath(
  id: string,
  rawFilename: string,
  now: Date,
): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${id}-${sanitizeFilename(rawFilename)}`;
}
