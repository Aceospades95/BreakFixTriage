"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className="rounded border border-surface-border px-3 py-1 text-xs text-slate-200 transition hover:border-accent hover:text-white"
    >
      Sign out
    </button>
  );
}
