import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const conflicts = await prisma.duplicateConflict.findMany({
    take: 50,
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    include: { leftTicket: true, rightTicket: true },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Duplicate queue</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Home
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Unresolved conflicts from import batches. Resolution UI ships in
        Phase 1; the <code>resolveDuplicate()</code> service is already
        wired to the state machine.
      </p>

      <ul className="mt-6 divide-y divide-surface-border rounded-lg border border-surface-border">
        {conflicts.map((c) => (
          <li key={c.id} className="p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-surface-border px-2 py-0.5 font-mono">
                {c.kind}
              </span>
              <span>
                {c.createdAt.toISOString().slice(0, 10)}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ConflictSide label="Existing" ticket={c.leftTicket} />
              <ConflictSide label="Incoming" ticket={c.rightTicket} />
            </div>
            {c.notes && (
              <p className="mt-2 text-sm text-slate-400">{c.notes}</p>
            )}
          </li>
        ))}
        {conflicts.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-slate-400">
            Nothing in the queue. Imports are clean.
          </li>
        )}
      </ul>
    </main>
  );
}

function ConflictSide({
  label,
  ticket,
}: {
  label: string;
  ticket: { incidentNumber: string; state: string; shortDescription: string };
}) {
  return (
    <div className="rounded border border-surface-border bg-surface-muted p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm">{ticket.incidentNumber}</div>
      <div className="mt-1 text-xs text-slate-400">{ticket.state}</div>
      <div className="mt-1 line-clamp-2 text-sm">{ticket.shortDescription}</div>
    </div>
  );
}
