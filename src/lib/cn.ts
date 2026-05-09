/**
 * Minimal className joiner. Concatenates truthy values with a space.
 * Avoids pulling in `clsx` for something this small.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Acronyms that should remain uppercased after humanise. Add to this
 * set when a new acronym appears in the UI.
 */
const ACRONYMS = new Set([
  "RMA",
  "SLA",
  "OOW",
  "PO",
  "SN",
  "DBN",
  "NYC",
  "ID",
  // Round-8 §1E — acronyms used in operator-facing copy.
  "PTO",
  "OOO",
  "TOTP",
  "URL",
  "API",
  "CSV",
  "INC",
]);

/**
 * Convert an `ALL_CAPS_SNAKE` enum value into a human-readable
 * label per docs/ui-conventions.md §2.
 *
 *   AWAITING_PARTS  → "Awaiting parts"
 *   QUOTE_NO_RESPONSE → "Quote no response"
 *   MANUFACTURER_RMA → "Manufacturer RMA"   (RMA stays acronymed)
 *   ON_HOLD → "On hold"
 *
 * The first word is capitalised; the rest are lower-cased unless
 * they're in the acronym set.
 */
export function humaniseEnum(value: string): string {
  if (!value) return value;
  const parts = value.split("_").filter((p) => p.length > 0);
  if (parts.length === 0) return value;
  return parts
    .map((p, i) => {
      if (ACRONYMS.has(p)) return p;
      const lower = p.toLowerCase();
      if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join(" ");
}
