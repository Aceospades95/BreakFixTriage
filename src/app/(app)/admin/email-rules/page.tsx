import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import { seedExampleRuleAction } from "@/server/actions/email-admin";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A1 — email rules list.
 *
 * Read-only first cut: lists every EmailRule with its scope, event,
 * recipients summary, template, and last-fired-at. Edit / create /
 * delete actions are filed for the next branch (see
 * docs/round-3-qa-checklist.md item 1) — this page exists today so
 * the link from /admin doesn't 404 and so ops can verify rules
 * before wiring the trigger sites in §B.
 */
export default async function EmailRulesPage() {
  await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);

  const rules = await prisma.emailRule.findMany({
    orderBy: [{ enabled: "desc" }, { event: "asc" }],
    include: { template: { select: { key: true } } },
  });

  // Best-effort "last fired" — the most recent EmailLog row per
  // rule. One round-trip per rule isn't great at scale; the proper
  // fix is a denormalised lastFiredAt column on EmailRule, filed
  // for the §A1 follow-up.
  const lastFired = new Map<string, Date>();
  if (rules.length > 0) {
    const recent = await prisma.emailLog.findMany({
      where: { ruleId: { in: rules.map((r) => r.id) } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { ruleId: true, createdAt: true },
    });
    for (const r of recent) {
      if (!r.ruleId) continue;
      if (!lastFired.has(r.ruleId)) {
        lastFired.set(r.ruleId, r.createdAt);
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Email rules"
        subtitle={`${rules.length} rule${rules.length === 1 ? "" : "s"} · admin`}
        actions={
          // Round-13 §3F — disable the seed button when ≥1 rule
          // already exists. A re-click would create a duplicate
          // example rule, which is exactly the kind of quiet
          // foot-gun the gate guards against.
          <form action={seedExampleRuleAction}>
            <button
              type="submit"
              disabled={rules.length > 0}
              title={
                rules.length > 0
                  ? "Already seeded — use the row controls below to edit existing rules."
                  : "Insert one disabled-by-default example rule"
              }
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-500/10"
            >
              Seed example rule
            </button>
          </form>
        }
      />

      {rules.length === 0 ? (
        // Round-10 §2G — promote the empty-state to a prominent
        // CTA banner so admins immediately see the seed action
        // instead of hunting for the button in the page header.
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-5">
          <div>
            <h2 className="text-sm font-semibold text-amber-100">
              No rules configured yet
            </h2>
            <p className="mt-1 text-xs text-amber-200/80">
              Click "Seed example rule" to start with a sensible
              default — every new ticket emails its school's SPOC
              contacts. Manage templates at{" "}
              <Link
                href="/admin/email-templates"
                className="text-amber-200 underline hover:text-amber-50"
              >
                Email templates
              </Link>
              .
            </p>
          </div>
          <form action={seedExampleRuleAction}>
            <button
              type="submit"
              className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong"
            >
              Seed example rule
            </button>
          </form>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Recipients</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2 font-medium">Last fired</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rules.map((rule) => {
                const fired = lastFired.get(rule.id);
                return (
                  <tr key={rule.id} className="hover:bg-surface-muted/40">
                    <td className="px-3 py-2 text-xs">
                      <div>{humanise(rule.scope)}</div>
                      {rule.scopeId && (
                        <div className="truncate text-slate-500">
                          {rule.scopeId}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {humanise(rule.event)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      <TokenChip>{rule.template.key}</TokenChip>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      <RecipientChips recipients={rule.recipients} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {rule.enabled ? (
                        <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-100">
                          Enabled
                        </span>
                      ) : (
                        <span className="rounded border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-slate-300">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {fired
                        ? fired.toISOString().slice(0, 10)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Round-13 §1D — token chip for the Recipients / Template
 * columns. Tokens like `school_spoc` / `ticket_created` are
 * programmatic strings tied to template-variable wiring; admins
 * editing rules need the exact spelling, so we render them as
 * <code> with a monospace pill style. The class flags them
 * visually as developer tokens rather than user-readable copy.
 */
function TokenChip({ children }: { children: React.ReactNode }) {
  // Round-13 §1D — keep `<code` and `font-mono` on a single line
  // so the Round-3 §G14 vitest gate (which only matches
  // <code|<pre> on the same line as font-mono) passes.
  return (
    <code data-token-chip className="inline-block rounded border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
      {children}
    </code>
  );
}

type RecipientItem = { kind?: string; value?: string };

function RecipientChips({ recipients }: { recipients: unknown }) {
  if (!recipients || typeof recipients !== "object") {
    return <span className="text-slate-500">—</span>;
  }
  const r = recipients as {
    to?: RecipientItem[];
    cc?: RecipientItem[];
    bcc?: RecipientItem[];
  };
  const groups: { label: string; items: RecipientItem[] }[] = [
    { label: "To", items: r.to ?? [] },
    { label: "Cc", items: r.cc ?? [] },
    { label: "Bcc", items: r.bcc ?? [] },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] tracking-wide text-slate-500">
            {g.label}:
          </span>
          {g.items.map((item, i) => {
            const label =
              item.kind === "literal" && item.value
                ? item.value
                : (item.kind ?? "?");
            return <TokenChip key={`${g.label}-${i}-${label}`}>{label}</TokenChip>;
          })}
        </div>
      ))}
    </div>
  );
}
