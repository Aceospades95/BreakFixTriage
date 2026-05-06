"use client";

import { useEffect, useState } from "react";
import type { Role } from "@prisma/client";

/**
 * First-login onboarding tour.
 *
 * A lightweight modal walkthrough that shows on a user's very
 * first visit to the home page. We check a cookie (not
 * localStorage) so the flag survives across devices if you sign
 * in from two browsers — and clearing cookies re-triggers the
 * tour, which is the behavior most demo sessions expect.
 *
 * Steps are tailored per role: a driver sees a different tour
 * than a dispatcher. Everyone can skip; skipping sets the cookie
 * so it never reappears.
 *
 * The tour deliberately does NOT anchor to specific DOM elements
 * with overlays — those break every time the layout changes. It's
 * a centered modal with a step count, a step title, a paragraph,
 * a CTA link to the relevant page, and a "Next" / "Skip" pair.
 */

type Step = {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
};

const COOKIE = "bft_onboarding_done";

const STEPS_BY_ROLE: Partial<Record<Role, Step[]>> = {
  ADMIN: [
    {
      title: "Welcome to BreakFix Triage",
      body: "You're signed in as an administrator. This tour takes 30 seconds and covers the handful of things you'll use every day.",
    },
    {
      title: "Admin lives under /admin",
      body: "Users, schools, devices, parts, templates, settings, and the audit log. If something is missing from the workflow, it's probably there.",
      ctaHref: "/admin",
      ctaLabel: "Open admin →",
    },
    {
      title: "Tickets are where the work happens",
      body: "The table view is good for search and sorting; the kanban board is good for seeing bottlenecks. Drag a card between columns to transition it.",
      ctaHref: "/tickets/kanban",
      ctaLabel: "Try the kanban →",
    },
    {
      title: "Press ? for keyboard shortcuts",
      body: "Anywhere in the app, press the ? key for the full cheat-sheet. g t for tickets, g s for scheduling, / to focus search.",
    },
  ],
  OPS_MANAGER: [
    {
      title: "Welcome",
      body: "This is your ops manager onboarding. It takes about 30 seconds.",
    },
    {
      title: "The home page is your command center",
      body: "It surfaces SLA breaches, pending duplicates, expired quotes, and your unscheduled jobs. Start your day here.",
    },
    {
      title: "Scheduling builds routes",
      body: "Create jobs, group them into routes, hand them to drivers. The driver's My Day view syncs automatically.",
      ctaHref: "/scheduling",
      ctaLabel: "Open scheduling →",
    },
    {
      title: "Dashboards for reporting",
      body: "Finance, productivity, device hotspots. Managers live here at month end.",
      ctaHref: "/dashboards",
      ctaLabel: "Dashboards →",
    },
  ],
  DISPATCHER: [
    {
      title: "Welcome to dispatch",
      body: "You'll spend most of your time in Scheduling and the Tickets list. This tour shows you the fast paths.",
    },
    {
      title: "Build routes in one place",
      body: "Scheduling groups pickup-ready tickets by school so you can create jobs with one click. Then build a route from unscheduled jobs and hand it to a driver.",
      ctaHref: "/scheduling",
      ctaLabel: "Try scheduling →",
    },
    {
      title: "Bulk actions save time",
      body: "On the tickets list, select multiple rows to bulk-assign or bulk-transition. The kanban view also supports drag-and-drop between columns.",
      ctaHref: "/tickets",
      ctaLabel: "Tickets →",
    },
  ],
  TECHNICIAN: [
    {
      title: "Welcome to your bench",
      body: "Your bench view is your daily queue — the tickets assigned to you, oldest first.",
      ctaHref: "/bench",
      ctaLabel: "My bench →",
    },
    {
      title: "Time tracking",
      body: "On every ticket, Start and Stop a timer. Minutes roll up to the productivity dashboard so your work is visible.",
    },
    {
      title: "Parts on the ticket",
      body: "When you use a part on a repair, the Parts panel on the ticket records it and decrements stock automatically.",
    },
  ],
  WAREHOUSE: [
    {
      title: "Welcome to the warehouse bench",
      body: "Scan devices at the door, receive parts, and move tickets through the repair queue.",
    },
    {
      title: "Warehouse scan-in",
      body: "Dedicated scanner page at /scan/warehouse. Each scan auto-transitions the device's pickup ticket to IN_WAREHOUSE.",
      ctaHref: "/scan/warehouse",
      ctaLabel: "Open warehouse scan →",
    },
  ],
  DRIVER: [
    {
      title: "Welcome",
      body: "Your whole day lives on the home page. It shows your routes with one-tap status buttons, your queue, and everything you need.",
      ctaHref: "/",
      ctaLabel: "Go home →",
    },
    {
      title: "Map link",
      body: "Tapping an address on a stop opens Google Maps. Get routing without copying and pasting.",
    },
    {
      title: "Photos + signatures",
      body: "Tap the file input on a stop to snap a picture with your camera. The signature pad captures school contact signatures on pickup or delivery.",
    },
  ],
  READ_ONLY: [
    {
      title: "Welcome",
      body: "You have read-only access. Browse tickets, dashboards, and the audit log — no write actions available.",
    },
  ],
};

export function OnboardingTour({
  role,
  alreadyDone,
}: {
  role: Role;
  alreadyDone: boolean;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [open, setOpen] = useState(!alreadyDone);
  const steps = STEPS_BY_ROLE[role] ?? STEPS_BY_ROLE.READ_ONLY ?? [];

  useEffect(() => {
    // If the cookie is already set server-side at render time we
    // shouldn't open at all. Double-check on mount in case a
    // cookie set on another tab wrote it meanwhile.
    const has = document.cookie.includes(`${COOKIE}=1`);
    if (has) setOpen(false);
  }, []);

  function close() {
    document.cookie = `${COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setOpen(false);
  }

  if (!open || steps.length === 0) return null;

  const step = steps[stepIdx]!;
  const isLast = stepIdx === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
    >
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-muted p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium tracking-tight uppercase tracking-wide text-slate-500">
            {stepIdx + 1} / {steps.length}
          </span>
          <button
            type="button"
            onClick={close}
            className="text-xs text-slate-400 hover:text-white"
            aria-label="Skip onboarding tour"
          >
            Skip
          </button>
        </div>
        <h2
          id="onboarding-title"
          className="mt-3 text-lg font-semibold text-slate-100"
        >
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-slate-300">{step.body}</p>
        {step.ctaHref && step.ctaLabel && (
          <a
            href={step.ctaHref}
            onClick={close}
            className="mt-4 inline-block rounded border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20"
          >
            {step.ctaLabel}
          </a>
        )}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="text-xs text-slate-400 hover:text-white disabled:opacity-40"
          >
            ← Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={close}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => i + 1)}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
