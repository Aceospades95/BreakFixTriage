import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const tickets = await prisma.ticket.findMany({
    take: 50,
    orderBy: { reportedAt: "desc" },
    include: { school: true, device: true },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <Link
          href="/"
          className="text-sm text-accent hover:underline"
        >
          ← Home
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Most recent {tickets.length} tickets. Filtering and search arrive in
        Phase 1.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Incident</th>
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Reported</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-surface-muted/40">
                <td className="px-3 py-2 font-mono">{t.incidentNumber}</td>
                <td className="px-3 py-2">{t.school.name}</td>
                <td className="px-3 py-2">
                  {t.device?.serialNumber ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <StatePill state={t.state} />
                </td>
                <td className="px-3 py-2">
                  {t.reportedAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No tickets yet. Run an import from the Imports page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatePill({ state }: { state: string }) {
  return (
    <span className="rounded bg-surface-border px-2 py-0.5 font-mono text-xs">
      {state}
    </span>
  );
}
