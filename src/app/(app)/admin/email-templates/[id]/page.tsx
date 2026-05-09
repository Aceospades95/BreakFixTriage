import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A1 — single-template view.
 *
 * Read-only. Shows subject + bodyHtml + bodyText + variables JSON
 * Schema. The Monaco editor + live preview + send-test ship in
 * the §A follow-up branch (see docs/round-3-qa-checklist.md
 * item 1).
 */
export default async function EmailTemplateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole(PERMISSIONS.EMAIL_WRITE);

  const tmpl = await prisma.emailTemplate.findUnique({
    where: { id: params.id },
  });
  if (!tmpl) notFound();

  return (
    <>
      <PageHeader
        title={tmpl.key}
        subtitle={`Email template · last updated `}
        actions={
          <Link
            href="/admin/email-templates"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← All templates
          </Link>
        }
      />

      <p className="mb-4 text-xs text-slate-500">
        Last updated <LocalTime date={tmpl.updatedAt} mode="datetime" />
      </p>

      <section className="mb-6 rounded border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-2 text-xs tracking-wide text-slate-400">Subject</h2>
        <p className="text-sm">{tmpl.subject}</p>
      </section>

      <section className="mb-6 rounded border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-2 text-xs tracking-wide text-slate-400">
          HTML body
        </h2>
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded bg-surface px-3 py-2 text-xs text-slate-200">
{/* prettier-ignore */}<code>{tmpl.bodyHtml}</code>
        </pre>
      </section>

      <section className="mb-6 rounded border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-2 text-xs tracking-wide text-slate-400">
          Plain-text body
        </h2>
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded bg-surface px-3 py-2 text-xs text-slate-200">
{/* prettier-ignore */}<code>{tmpl.bodyText}</code>
        </pre>
      </section>

      <section className="rounded border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-2 text-xs tracking-wide text-slate-400">
          Variables (JSON Schema)
        </h2>
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded bg-surface px-3 py-2 text-xs text-slate-300">
{/* prettier-ignore */}<code>{JSON.stringify(tmpl.variables, null, 2)}</code>
        </pre>
      </section>
    </>
  );
}
