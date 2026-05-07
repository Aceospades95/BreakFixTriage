"use client";

/**
 * Round-6 §2E — IdChip variant with a click-to-copy icon.
 *
 * Body click → navigate (when href is set) or no-op (when not).
 * Copy-icon click → write `copyValue ?? value` to clipboard, surface
 * a brief "Copied" state on the icon, do NOT navigate. The
 * stopPropagation + preventDefault on the icon's onClick is what
 * keeps the parent <Link> from firing.
 *
 * Pure client component — `navigator.clipboard.writeText` requires
 * a browser. Server-side renders (audit page first paint) get the
 * non-copy `<IdChip>` until React hydrates this in.
 */

import Link from "next/link";
import { useState } from "react";

export function IdChipWithCopy({
  value,
  copyValue,
  href,
  className,
  title,
}: {
  /** Display value. Show this in the chip body. */
  value: string;
  /** Optional copy-to-clipboard payload. Defaults to `value`. */
  copyValue?: string;
  /** Optional click-through URL for the body. */
  href?: string;
  className?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const baseCls =
    "inline-flex items-center gap-1 rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] tracking-tight text-slate-400 hover:border-accent";
  const widthCls = className ?? "max-w-[14rem]";

  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = copyValue ?? value;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard permission denied; fall back silently.
    }
  };

  const body = <span className="truncate">{value}</span>;
  const copyBtn = (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied" : "Copy"}
      aria-label="Copy value"
      className="ml-1 rounded p-0.5 text-slate-500 hover:bg-surface-muted hover:text-slate-200"
    >
      {copied ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7 7a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06L6.25 10.69l6.47-6.47a.75.75 0 011.06 0z" />
        </svg>
      ) : (
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5 1.75A1.75 1.75 0 016.75 0h6.5A1.75 1.75 0 0115 1.75v8.5A1.75 1.75 0 0113.25 12h-1.5v1.25A1.75 1.75 0 0110 15h-6.5A1.75 1.75 0 011.75 13.25v-7.5A1.75 1.75 0 013.5 4H5V1.75zM5 5.5H3.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25H10a.25.25 0 00.25-.25V12H6.75A1.75 1.75 0 015 10.25V5.5zm1.5 0v4.75c0 .138.112.25.25.25h6.5a.25.25 0 00.25-.25v-8.5a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25V5.5z" />
        </svg>
      )}
    </button>
  );

  if (href) {
    return (
      <span className={`${baseCls} ${widthCls}`} title={title ?? value}>
        <Link href={href} className="truncate hover:text-slate-200">
          {value}
        </Link>
        {copyBtn}
      </span>
    );
  }
  return (
    <span className={`${baseCls} ${widthCls}`} title={title ?? value}>
      {body}
      {copyBtn}
    </span>
  );
}
