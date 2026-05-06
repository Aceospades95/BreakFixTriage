import { TicketPriority } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  createTemplateAction,
  toggleTemplateAction,
} from "@/server/actions/templates";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const templates = await prisma.ticketTemplate.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Ticket templates"
        subtitle="Preset shapes for common repair tickets. Ops picks one from the ticket list to spin up a new ticket in one click."
      />

      <section className="mb-6 max-w-xl rounded-lg border border-surface-border bg-surface-muted p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Add template
        </h2>
        <form action={createTemplateAction} className="space-y-3">
          <input
            name="name"
            required
            maxLength={100}
            placeholder='Name (e.g. "Cracked screen")'
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <input
            name="shortDescription"
            required
            maxLength={500}
            placeholder="Short description — becomes the ticket title"
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <textarea
            name="longDescription"
            rows={3}
            placeholder="Optional long description / triage checklist"
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">
              Priority
              <select
                name="priority"
                defaultValue={TicketPriority.NORMAL}
                className="ml-2 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              >
                {Object.values(TicketPriority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="ml-auto rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
            >
              Create
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Short description</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2 text-slate-300">{t.shortDescription}</td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs">{t.priority}</td>
                <td className="px-3 py-2 text-xs">
                  {t.active ? (
                    <span className="text-emerald-300">active</span>
                  ) : (
                    <span className="text-slate-500">disabled</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <form action={toggleTemplateAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={String(!t.active)}
                    />
                    <button
                      type="submit"
                      className="rounded border border-surface-border px-2 py-0.5 text-xs hover:border-accent"
                    >
                      {t.active ? "disable" : "enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No templates yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
