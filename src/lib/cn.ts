/**
 * Minimal className joiner. Concatenates truthy values with a space.
 * Avoids pulling in `clsx` for something this small.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
