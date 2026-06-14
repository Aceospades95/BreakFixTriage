"use client";

import Link from "next/link";
import { PopoverMenu, usePopoverClose } from "@/components/popover-menu";

/**
 * Round-22 §4 — profile menu.
 *
 * My schedule / My expenses / Preferences used to hide behind the
 * unlabeled username text (no avatar, chevron, or menu affordance), so
 * nobody found them. This gives the username a real dropdown with an
 * avatar + chevron and surfaces every /me/* destination.
 */
export function ProfileMenu({
  name,
  roleLabel,
}: {
  name: string;
  roleLabel: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <PopoverMenu
      trigger={
        <button
          type="button"
          className="flex items-center gap-2 rounded px-1.5 py-1 text-right text-xs transition hover:bg-surface-border/50"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/30 text-[11px] font-semibold text-accent-foreground"
          >
            {initials || "?"}
          </span>
          <span className="hidden sm:block">
            <span className="block font-medium text-slate-100">{name}</span>
            <span className="block text-[10px] tracking-wide text-muted-foreground">
              {roleLabel}
            </span>
          </span>
          <span aria-hidden="true" className="text-slate-400">
            ▾
          </span>
        </button>
      }
      panelClassName="min-w-44 p-1"
    >
      <MenuItem href="/profile" label="My profile" />
      <MenuItem href="/me/schedule" label="My schedule" />
      <MenuItem href="/me/expenses" label="My expenses" />
      <MenuItem href="/me/preferences" label="Preferences" />
    </PopoverMenu>
  );
}

function MenuItem({ href, label }: { href: string; label: string }) {
  const close = usePopoverClose();
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={close}
      className="block rounded px-3 py-1.5 text-sm text-slate-200 hover:bg-surface-border/60 hover:text-white"
    >
      {label}
    </Link>
  );
}
