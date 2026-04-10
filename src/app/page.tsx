import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">BreakFix Triage</h1>
      <p className="mt-3 text-slate-300">
        Operations platform for NYC DOE device repair lifecycle management.
        Phase 0 foundations are in place. Sign in comes online in Phase 1.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <DashLink
          href="/tickets"
          title="Tickets"
          description="Lifecycle queues and search"
        />
        <DashLink
          href="/imports"
          title="Imports"
          description="Upload ServiceNow exports"
        />
        <DashLink
          href="/duplicates"
          title="Duplicate queue"
          description="Resolve conflicts from imports"
        />
        <DashLink
          href="/scheduling"
          title="Scheduling"
          description="Jobs, routes, assignments"
        />
        <DashLink
          href="/dashboards"
          title="Dashboards"
          description="Operational health + aging"
        />
        <DashLink
          href="/docs"
          title="Docs"
          description="Architecture and domain"
        />
      </section>
    </main>
  );
}

function DashLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-surface-border bg-surface-muted p-4 transition hover:border-accent"
    >
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{description}</div>
    </Link>
  );
}
