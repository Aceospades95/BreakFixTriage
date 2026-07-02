/**
 * Round-22 (demo feedback) — help-center content, single source of
 * truth. The `?` menu's "How the app works" modal and the /help page
 * both render from here so they can never drift.
 *
 * GUIDE_SECTIONS: how each area of the app works.
 * FAQ_ENTRIES: the questions the team actually asked in the June demos.
 * Team SOPs are NOT here — they live in the `help.sops` AppSetting so
 * managers can build them out from /help without a deploy.
 */

export interface HelpSection {
  title: string;
  body: string;
}

export const GUIDE_SECTIONS: HelpSection[] = [
  {
    title: "My Day",
    body: "Your personalized homepage. Technicians see their queue and today's routes; managers also see team queues, SLA breaches, and the ops attention tiles. Everything on it deep-links to the page where the work happens.",
  },
  {
    title: "Tickets",
    body: "Tickets track a device from intake to return. Each ticket flows through states like Triage, Diagnosis, Repair, and Delivery. Filter by state, SLA, school, or manufacturer; pick 10/25/50/100 rows per page; drag tickets on the Kanban board or use bulk actions on the table view.",
  },
  {
    title: "Bench",
    body: "Your bench is your personal work queue — tickets assigned to you sorted oldest-first. Managers can view all benches to see who has what. The History view lists recently closed tickets and the monthly closed-count leaderboard.",
  },
  {
    title: "Scheduling & Routes",
    body: "Create jobs from tickets that need pickup or delivery. Group jobs into a route, pick a date and driver, preview the optimized stop order on the map, then save. Drivers work each stop from the route page: Start → Arrived → resolve every line item → Complete (or Partial/Fail with a reason).",
  },
  {
    title: "SLA Tracking",
    body: "Each ticket state has an SLA threshold measured in BUSINESS days — weekends and any school holidays entered under Admin → Holidays don't count. Badges show green (on track), amber (warning), or red (breached). The manager dashboard surfaces all breached tickets.",
  },
  {
    title: "Quotes & Invoices",
    body: "When a repair is out of scope or over budget, create a quote and send it to the school contact. Approved quotes generate a PO. Invoice tracking ensures billing is complete before closing.",
  },
  {
    title: "Scanning",
    body: "Use the Scan page to scan device barcodes or QR codes and jump straight to the matching ticket. Warehouse intake scan (Scan → Warehouse intake) marks the device's open pickup tickets as In warehouse in one shot and stamps the intake date on the event timeline.",
  },
  {
    title: "Time Tracking",
    body: "On each ticket, start and stop a timer to log your work. Minutes aggregate in the productivity dashboard, so we can see how long device tasks actually take and where training helps.",
  },
  {
    title: "School Portal Links",
    body: "From a school page, generate an expiring link the school contact can open to see their own counts — open tickets, in warehouse, awaiting pickup, awaiting delivery, and delayed. They see statuses only, never ticket internals.",
  },
  {
    title: "Keyboard Shortcuts",
    body: "Press ? anywhere to see all shortcuts. Press / to focus search. Use g + letter for quick navigation (g t = tickets, g b = bench, g s = scheduling).",
  },
];

export interface FaqEntry {
  q: string;
  a: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    q: "How do I change a ticket's status?",
    a: "Open the ticket and use the buttons under \"Available transitions\" — those are the legal next steps from the current status. If you need to move a ticket somewhere the flow doesn't allow (for example, back a step after a mistake), admins can use Force change, which requires a reason and is recorded on the audit log.",
  },
  {
    q: "Why did my bulk status change say I need a reason?",
    a: "Bulk status changes are recorded on every ticket they touch, so a short reason is required — same rule as the ticket page's force change. Type the reason in the box next to the target status, then hit Apply.",
  },
  {
    q: "Do SLA days count weekends?",
    a: "No. SLA thresholds count business days only — weekends and any school holidays entered under Admin → Holidays are skipped. A quote with a 7-day window means 7 business days.",
  },
  {
    q: "How does a device get marked as in the warehouse?",
    a: "Fastest way: Scan → Warehouse intake, then scan the device's barcode (serial or asset tag) or the ticket number. Every open pickup ticket for that device moves to In warehouse and the intake date lands on the event timeline. You still need to update ServiceNow separately until we have API access.",
  },
  {
    q: "Do I still have to update ServiceNow?",
    a: "Yes. Until New York grants API access there is no automatic sync, so every device touch means updating both Triage and ServiceNow. If we get API access later, updates made here will push to ServiceNow automatically.",
  },
  {
    q: "Can I pick up a device that has no ticket?",
    a: "No — every pickup needs a ticket number. If the school created a brand-new ticket right before you arrived, ask them for the incident number and add it to the stop with \"+ Add device\"; the app validates the number belongs to that school.",
  },
  {
    q: "What does the school contact see through their portal link?",
    a: "Counts only: open tickets, in warehouse, awaiting pickup, awaiting delivery, and delayed. They can't open tickets or see internal notes. Links expire on the date you set when generating them.",
  },
  {
    q: "Where do I log my hours or submit an expense?",
    a: "Time on a device: use the timer on the ticket itself. Expenses: your avatar menu → My expenses (amount, category, optional route, receipt photo or file upload). Submitted expenses go to an approval queue.",
  },
  {
    q: "How do I see how my team is doing?",
    a: "Dashboards → Productivity shows closed tickets, turnaround, hours logged, routes run, stops done, and devices verified per person. Bench → History has the closed-ticket log and the monthly leaderboard. Your own numbers are on your profile page.",
  },
  {
    q: "A stop failed or the school was closed — what happens to the tickets?",
    a: "Failing a stop (with a reason) automatically returns its tickets to the Ready-to-Schedule queue and flags the route \"Completed with issues\". Dispatch sees the failure reason on the stop and as an exception, and can build a new route for the returned tickets.",
  },
];

/**
 * Parse the admin-authored SOP text (AppSetting `help.sops`) into
 * sections. Format: lines starting with `## ` begin a new section;
 * everything after is that section's body. Content before any heading
 * becomes an untitled intro block.
 */
export function parseSops(raw: string): HelpSection[] {
  const out: HelpSection[] = [];
  let current: HelpSection | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      if (current) out.push(current);
      current = { title: heading[1]!.trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else if (line.trim()) {
      current = { title: "", body: line };
    }
  }
  if (current) out.push(current);
  return out
    .map((s) => ({ ...s, body: s.body.trim() }))
    .filter((s) => s.title || s.body);
}

export const HELP_SOPS_SETTING_KEY = "help.sops";
