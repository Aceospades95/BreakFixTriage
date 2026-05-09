/**
 * Template render for the email-rules engine.
 *
 * Round-2 §3/§4. Templates are stored in EmailTemplate with three
 * fields — subject, bodyHtml, bodyText — each a Mustache-flavoured
 * string. We deliberately avoid Handlebars / a real templating
 * engine here: the variable surface is small (one ticket-shaped
 * payload per send) and we want the rendered output to be
 * trivially auditable (the audit log JSON sees the raw string).
 *
 * Supported syntax:
 *
 *   {{ path.to.value }}     — simple substitution; nested objects ok.
 *   {{# path }} ... {{/ path }} — conditional block: renders the body
 *                                  only if `path` is truthy.
 *
 * No loops, no helpers, no partials. Anything fancier that ops needs
 * gets its own helper or its own template.
 */

export interface RenderResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface RenderInput {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: Record<string, unknown>;
}

/**
 * Render the three template strings against a variables blob.
 * Missing paths render as the empty string. Callers that want
 * "missing field" to be a hard error should validate against
 * `EmailTemplate.variables` (a JSONSchema) before render.
 */
export function renderTemplate(input: RenderInput): RenderResult {
  return {
    subject: renderString(input.subject, input.variables),
    bodyHtml: renderString(input.bodyHtml, input.variables),
    bodyText: renderString(input.bodyText, input.variables),
  };
}

const SECTION_RE = /\{\{#\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g;
const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderString(
  template: string,
  vars: Record<string, unknown>,
): string {
  // Section blocks first so a section's inner {{var}} sees the
  // section's truth-checked value plus the outer scope.
  let out = template.replace(SECTION_RE, (_m, path: string, body: string) => {
    const v = lookup(path, vars);
    return isTruthy(v) ? body : "";
  });
  out = out.replace(VAR_RE, (_m, path: string) => {
    const v = lookup(path, vars);
    return v == null ? "" : escapeForRole(String(v));
  });
  return out;
}

function lookup(path: string, vars: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let cur: unknown = vars;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isTruthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Minimal HTML-escape for substituted values. Subject lines and
 * plaintext bodies don't need it but applying universally is safer
 * than detecting context. Preserves printable ASCII.
 */
function escapeForRole(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Loose validator for a template's stored `variables` JSON. We
 * accept any object shape (the rules editor builds it); this just
 * checks the rendered payload provides every top-level key the
 * template declares as `required`. Stricter schema validation
 * could be layered on top.
 */
export function validateVariables(
  declared: unknown,
  payload: Record<string, unknown>,
): { ok: true } | { ok: false; missing: string[] } {
  if (!declared || typeof declared !== "object") return { ok: true };
  const d = declared as Record<string, unknown>;
  const required: string[] = Array.isArray(d.required)
    ? d.required.filter((x): x is string => typeof x === "string")
    : [];
  const missing = required.filter((k) => !(k in payload));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}
