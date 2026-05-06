"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the user's local timezone.
 *
 * During SSR we render an ISO UTC fallback so the server and client
 * markup match. On mount (client only) we replace it with a localized
 * string that respects the viewer's timezone and locale.
 *
 * Examples:
 *   <LocalTime date={event.createdAt} />               "Apr 15, 2026, 3:42 PM EDT"
 *   <LocalTime date={event.createdAt} mode="date" />   "Apr 15, 2026"
 *   <LocalTime date={event.createdAt} mode="time" />   "3:42 PM EDT"
 *   <LocalTime date={event.createdAt} mode="short" />  "04/15 15:42"
 */
export function LocalTime({
  date,
  mode = "datetime",
  className,
}: {
  date: Date | string;
  mode?: "datetime" | "date" | "time" | "short" | "relative";
  className?: string;
}) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [label, setLabel] = useState<string>(() => ssrFallback(iso, mode));
  const [tzAbbr, setTzAbbr] = useState<string>("");

  useEffect(() => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return;

    let formatted: string;
    switch (mode) {
      case "date":
        formatted = d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        break;
      case "time":
        formatted = d.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
        break;
      case "short":
        formatted = d.toLocaleString(undefined, {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        break;
      case "relative":
        formatted = relativeTime(d);
        break;
      case "datetime":
      default:
        formatted = d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        // Pull timezone abbreviation so users can see their local zone.
        const tzParts = d
          .toLocaleTimeString(undefined, { timeZoneName: "short" })
          .split(" ");
        setTzAbbr(tzParts[tzParts.length - 1] ?? "");
        break;
    }
    setLabel(formatted);
  }, [iso, mode]);

  return (
    <time dateTime={iso} className={className} title={iso}>
      {label}
      {tzAbbr && mode === "datetime" && (
        <span className="ml-1 text-[10px] text-muted-foreground">{tzAbbr}</span>
      )}
    </time>
  );
}

function ssrFallback(iso: string, mode: string): string {
  // Deterministic output so the server HTML matches the first client render
  // before the effect runs. Matches ISO slicing that used to live inline.
  if (mode === "date") return iso.slice(0, 10);
  if (mode === "short") return iso.slice(5, 16).replace("T", " ");
  if (mode === "time") return iso.slice(11, 16);
  if (mode === "relative") return iso.slice(0, 16).replace("T", " ");
  return iso.slice(0, 16).replace("T", " ");
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
