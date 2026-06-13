import Link from "next/link";
import { EmailEvent } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import { EmailRecipientEditor } from "@/components/email-recipient-editor";
import { ConfirmButton } from "@/components/confirm-button";
import { seedExampleRuleAction } from "@/server/actions/email-admin";
import {
  createEmailRuleAction,
  deleteEmailRuleAction,
  toggleEmailRuleAction,
  updateEmailRuleRecipientsAction,
  updateEmailRuleTemplateAction,
} from "@/server/actions/email-rules";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A1 + Round-22 — email rules editor.
 *
 * Read-allowed for OPS_MANAGER + ADMIN; all mutations gated on
 * EMAIL_RULES_MANAGE (admin). Round-22 turned this from a read-only
 * table into a real editor: per rule you can toggle enabled, edit
 * recipients (any kind incl. the leadership distribution lists +
 * literal addresses), swap the template, or delete; plus add a rule
 * for any event.
 */
export default async function EmailRulesPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireRole(PERMISSIONS.EMAIL_WRITE);
  const canManage = can(session.role, PERMISSIONS.EMAIL_RULES_MANAGE);

  const [rules, templates] = await Promise.all([
    prisma.emailRule.findMany({
      orderBy: [{ enabled: "desc" }, { event: "asc" }],
      include: { template: { select: { id: true, key: true } } },
    }),
    prisma.emailTemplate.findMany({
      select: { id: true, key: true },
      orderBy: { key: "asc" },
    }),
  ]);

  // Best-effort "last fired" — most recent EmailLog row per rule.
  const lastFired = new Map<string, Date>();
  if (rules.length > 0) {
    const recent = await prisma.emailLog.findMany({
      where: { ruleId: { in: rules.map((r) => r.id) } },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { ruleId: true, createdAt: true },
    });
    for (const r of recent) {
      if (!r.ruleId) continue;
      if (!lastFired.has(r.ruleId)) lastFired.set(r.ruleId, r.createdAt);
    }
  }

  const allEvents = Object.values(EmailEvent);

  return (
    <>
      <PageHeader
        title="Email rules"
        subtitle={`${rules.length} rule${rules.length === 1 ? "" : "s"} · who gets emailed when`}
        actions={
          <Link
            href="/admin/email-templates"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            Edit templates →
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      <div className="mb-4 rounded-lg border border-surface-border bg-surface-muted/40 p-3 text-xs text-slate-400">
        Each rule sends one template to a set of recipients when its
        event fires. Recipient groups (district / internal /
        prime-contract leadership, the internal team list) are edited
        on{" "}
        <Link href="/admin/settings" className="text-accent hover:underline">
          Settings
        </Link>
        ; a rule that targets an empty group simply sends to nobody.
        Outward-facing rules ship disabled — enable each one when
        you&apos;re ready for it to send.
      </div>

      {canManage && (
        <form
          action={createEmailRuleAction}
          className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-surface-border bg-surface-muted/40 p-3"
          data-testid="add-rule-form"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Add a rule for event
            </span>
            <select
              name="event"
              defaultValue=""
              required
              className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                pick an event…
              </option>
              {allEvents.map((ev) => (
                <option key={ev} value={ev}>
                  {humanise(ev)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Add rule
          </button>
          <span className="text-xs text-slate-500">
            Starts disabled with the matching template and no
            recipients.
          </span>
        </form>
      )}

      {rules.length === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="text-sm font-semibold text-amber-100">
            No rules yet
          </h2>
          <p className="mt-1 text-xs text-amber-200/80">
            Add a rule above, or seed a sensible starter (every new
            ticket emails its school&apos;s SPOC).
          </p>
          <form action={seedExampleRuleAction} className="mt-3">
            <button
              type="submit"
              disabled={!canManage}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              Seed example rule
            </button>
          </form>
        </div>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => {
            const fired = lastFired.get(rule.id);
            const rec = (rule.recipients ?? {}) as {
              to?: { kind: string; value?: string }[];
              cc?: { kind: string; value?: string }[];
              bcc?: { kind: string; value?: string }[];
            };
            const toRows = (rec.to ?? []).map((r) => ({
              bucket: "to" as const,
              kind: r.kind as never,
              value: r.value ?? "",
            }));
            const ccRows = (rec.cc ?? []).map((r) => ({
              bucket: "cc" as const,
              kind: r.kind as never,
              value: r.value ?? "",
            }));
            const bccRows = (rec.bcc ?? []).map((r) => ({
              bucket: "bcc" as const,
              kind: r.kind as never,
              value: r.value ?? "",
            }));
            return (
              <li
                key={rule.id}
                data-testid="email-rule-row"
                data-rule-event={rule.event}
                className={`rounded-lg border p-4 ${
                  rule.enabled
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-surface-border bg-surface-muted/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-slate-100">
                    {humanise(rule.event)}
                  </span>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                      rule.enabled
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-500/40 bg-slate-500/15 text-slate-300"
                    }`}
                  >
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <span className="text-xs text-slate-400">
                    template{" "}
                    <code data-token-chip className="rounded bg-surface px-1 font-mono text-[10px]">
                      {rule.template.key}
                    </code>
                  </span>
                  <RecipientSummary rec={rec} />
                  <span className="ml-auto text-xs text-slate-500">
                    {fired ? `last fired ${fired.toISOString().slice(0, 10)}` : "never fired"}
                  </span>
                </div>

                {canManage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
                    <form action={toggleEmailRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button
                        type="submit"
                        className={`rounded px-3 py-1.5 text-xs font-semibold ${
                          rule.enabled
                            ? "border border-surface-border text-slate-300 hover:border-accent"
                            : "bg-accent hover:bg-accent-strong"
                        }`}
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form
                      action={updateEmailRuleTemplateAction}
                      className="flex items-center gap-1"
                    >
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <select
                        name="templateId"
                        defaultValue={rule.template.id}
                        className="rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.key}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-accent"
                      >
                        Set template
                      </button>
                    </form>
                    <form action={deleteEmailRuleAction} className="ml-auto">
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <ConfirmButton
                        message={`Delete the ${humanise(rule.event)} rule? It stops sending immediately.`}
                        className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                )}

                {canManage && (
                  <details className="mt-3 rounded border border-surface-border bg-surface/60 p-2">
                    <summary className="cursor-pointer select-none text-xs font-semibold text-accent">
                      Edit recipients
                    </summary>
                    <div className="mt-3">
                      <EmailRecipientEditor
                        ruleId={rule.id}
                        action={updateEmailRuleRecipientsAction}
                        initial={{ to: toRows, cc: ccRows, bcc: bccRows }}
                      />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Round-22 (preserving R13 §1D) — recipient kinds are programmatic
 * tokens, so render each as a <code data-token-chip> rather than
 * misleading plain user copy.
 */
function RecipientSummary({
  rec,
}: {
  rec: {
    to?: { kind: string; value?: string }[];
    cc?: { kind: string; value?: string }[];
    bcc?: { kind: string; value?: string }[];
  };
}) {
  const buckets: { label: string; items: { kind: string; value?: string }[] }[] = [
    { label: "To", items: rec.to ?? [] },
    { label: "Cc", items: rec.cc ?? [] },
    { label: "Bcc", items: rec.bcc ?? [] },
  ].filter((b) => b.items.length > 0);
  if (buckets.length === 0) {
    return (
      <span className="text-xs text-amber-300/80">no recipients yet</span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
      {buckets.map((b) => (
        <span key={b.label} className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-500">{b.label}:</span>
          {b.items.map((item, i) => (
            <code key={`${b.label}-${i}`} data-token-chip className="rounded border border-surface-border bg-surface px-1 font-mono text-[10px] text-slate-200">
              {item.kind === "literal" && item.value ? item.value : item.kind}
            </code>
          ))}
        </span>
      ))}
    </span>
  );
}
