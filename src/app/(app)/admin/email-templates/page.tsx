import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { LocalTime } from "@/components/local-time";
import { seedDefaultTemplatesAction } from "@/server/actions/email-admin";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A1 — email templates list.
 *
 * Read-only first cut: lists every EmailTemplate with key, subject,
 * variables count, last-updated. Full Monaco editor + live preview
 * + send-test-to-self ships in the §A follow-up branch.
 */
export default async function EmailTemplatesPage() {
  await requireRole(PERMISSIONS.EMAIL_WRITE);

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { key: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Email templates"
        subtitle={`${templates.length} template${templates.length === 1 ? "" : "s"} available`}
        actions={
          <form action={seedDefaultTemplatesAction}>
            <button
              type="submit"
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
            >
              Seed default templates
            </button>
          </form>
        }
      />

      {templates.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          <p>No templates yet — click "Seed default templates" above to add the standard set.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Variables</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {templates.map((t) => {
                const declared =
                  (t.variables as { required?: string[] } | null)?.required ??
                  [];
                return (
                  <tr key={t.id} className="hover:bg-surface-muted/40">
                    <td className="px-3 py-2 text-xs">
                      <Link
                        href={`/admin/email-templates/${t.id}`}
                        className="text-accent hover:underline"
                      >
                        {t.key}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      {t.subject}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {declared.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      <LocalTime date={t.updatedAt} mode="relative" />
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
