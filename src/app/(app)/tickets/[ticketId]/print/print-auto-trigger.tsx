"use client";

import { useEffect } from "react";

/**
 * Round-6 §3B — fire window.print() on mount when ?autoprint=1.
 *
 * Pulled out of the print page (server component) because
 * window.print is a browser API. The 250ms delay gives the browser
 * a moment to layout the print stylesheet so the first paint isn't
 * the cropped pre-style frame.
 */
export function PrintAutoTrigger() {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // Print blocked or no printer; ignore.
      }
    }, 250);
    return () => clearTimeout(t);
  }, []);
  return null;
}
