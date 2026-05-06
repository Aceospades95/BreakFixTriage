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
          <form action={seedExampleRuleAction}>
            <button
              type="submit"
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
            >
              Seed example rule
            </button>
          </form>
        }
      />

      {rules.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          <p>
            No email rules yet. Click "Seed example rule" above to add a
            global rule that emails every new ticket to its school's
            SPOC contacts. You can manage templates at{" "}
            <Link href="/admin/email-templates" className="text-accent hover:underline">
              Email templates
            </Link>
            .
          </p>
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
                const recipients = recipientSummary(rule.recipients);
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
                      {rule.template.key}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      {recipients}
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

function recipientSummary(recipients: unknown): string {
  if (!recipients || typeof recipients !== "object") return "—";
  const r = recipients as {
    to?: Array<{ kind?: string; value?: string }>;
    cc?: Array<{ kind?: string; value?: string }>;
    bcc?: Array<{ kind?: string; value?: string }>;
  };
  function summarise(list: Array<{ kind?: string; value?: string }> | undefined) {
    if (!list || list.length === 0) return "";
    return list
      .map((r) =>
        r.kind === "literal" && r.value ? r.value : (r.kind ?? "?"),
      )
      .join(", ");
  }
  const parts: string[] = [];
  const to = summarise(r.to);
  const cc = summarise(r.cc);
  const bcc = summarise(r.bcc);
  if (to) parts.push(`To: ${to}`);
  if (cc) parts.push(`Cc: ${cc}`);
  if (bcc) parts.push(`Bcc: ${bcc}`);
  return parts.join(" · ") || "—";
}
