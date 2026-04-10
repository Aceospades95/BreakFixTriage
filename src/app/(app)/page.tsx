import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/auth/session";
import {
  duplicateQueueCount,
  invoiceQueueCount,
  openTicketsByState,
} from "@/lib/reports/dashboards";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireSession();
  const [byState, dupes, invoices] = await Promise.all([
    openTicketsByState(),
    duplicateQueueCount(),
    invoiceQueueCount(),
  ]);
  const openTotal = byState.reduce((acc, r) => acc + r.count, 0);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${session.name.split(" ")[0] ?? session.name}`}
        subtitle="Operational snapshot for your districts."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Open tickets" value={openTotal} href="/tickets" />
        <Kpi
          label="Duplicate queue"
          value={dupes}
          href="/duplicates"
          emphasize={dupes > 0}
        />
        <Kpi
          label="Invoice required"
          value={invoices}
          href="/tickets?state=INVOICE_REQUIRED"
        />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Jump to</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NavCard
            href="/tickets"
            title="Tickets"
            description="Lifecycle queues, search, and state transitions"
          />
          <NavCard
            href="/imports/new"
            title="New import"
            description="Upload a ServiceNow CSV/XLSX export"
          />
          <NavCard
            href="/duplicates"
            title="Duplicate queue"
            description="Resolve conflicts flagged by the importer"
          />
          <NavCard
            href="/scheduling"
            title="Scheduling"
            description="Jobs, routes, and driver assignments"
          />
          <NavCard
            href="/quotes"
            title="Quotes"
            description="Out-of-warranty repairs and hold-window follow-up"
          />
          <NavCard
            href="/invoices"
            title="Invoices"
            description="POs, invoicing, and ticket closure"
          />
          <NavCard
            href="/dashboards"
            title="Dashboards"
            description="Operational health, aging, and queues"
          />
        </div>
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  href,
  emphasize = false,
}: {
  label: string;
  value: number;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border p-4 transition hover:border-accent ${
        emphasize
          ? "border-red-500/60 bg-red-500/10"
          : "border-surface-border bg-surface-muted"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </Link>
  );
}

function NavCard({
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
