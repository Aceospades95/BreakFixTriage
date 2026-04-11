"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/search";
import { cn } from "@/lib/cn";

/**
 * Header search box.
 *
 * As the user types, debounces for 200 ms and posts to `/api/search`.
 * Results render in a dropdown below the input, grouped visually by
 * kind. Enter navigates to the first result, Escape closes the
 * dropdown.
 *
 * The `/` keyboard shortcut anywhere on the page focuses the input
 * (unless the user is already typing in a form field) — the single
 * most effective power-user affordance you can add.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as SearchHit[];
        setHits(data);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  // Global "/" shortcut to focus the box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-80">
      <input
        ref={inputRef}
        type="search"
        placeholder="Search tickets, devices, schools…  (press /)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            e.preventDefault();
            router.push(hits[0].href);
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="w-full rounded border border-surface-border bg-surface px-3 py-1.5 text-sm placeholder-slate-500 focus:border-accent focus:outline-none"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-auto rounded-lg border border-surface-border bg-surface-muted shadow-xl backdrop-blur">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No matches.</div>
          )}
          {!loading &&
            hits.map((hit) => (
              <Link
                key={`${hit.kind}-${hit.id}`}
                href={hit.href}
                onMouseDown={() => {
                  setOpen(false);
                  setQuery("");
                }}
                className="flex items-start gap-3 border-b border-surface-border px-3 py-2 text-sm last:border-b-0 hover:bg-surface-border/40"
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                    kindClass(hit.kind),
                  )}
                >
                  {hit.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{hit.title}</div>
                  <div className="truncate text-xs text-slate-400">
                    {hit.subtitle}
                  </div>
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

function kindClass(kind: SearchHit["kind"]): string {
  switch (kind) {
    case "ticket":
      return "bg-indigo-500/20 text-indigo-200";
    case "school":
      return "bg-blue-500/20 text-blue-200";
    case "device":
      return "bg-amber-500/20 text-amber-200";
    case "contact":
      return "bg-emerald-500/20 text-emerald-200";
    case "user":
      return "bg-violet-500/20 text-violet-200";
  }
}
