"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Round-10 §2J — keyboard shortcuts for /scheduling/people:
 *
 *   t — jump to today
 *   [ — previous day
 *   ] — next day
 *
 * No-ops when an input / textarea / contenteditable is focused so
 * typing in a note / time picker doesn't fire navigation. The
 * legend is documented in the global keyboard-shortcuts overlay.
 */
export function PeopleKeyboardShortcuts({
  date,
}: {
  /** ISO YYYY-MM-DD of the page's current date. */
  date: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "t") {
        e.preventDefault();
        router.push("/scheduling/people");
        return;
      }
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const delta = e.key === "[" ? -1 : 1;
        const d = new Date(`${date}T00:00:00Z`);
        if (Number.isNaN(d.getTime())) return;
        d.setUTCDate(d.getUTCDate() + delta);
        const next = d.toISOString().slice(0, 10);
        router.push(`/scheduling/people?date=${next}`);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [date, router]);

  return null;
}
