import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Device profile + full ticket history. Read-only for now; editing
 * serial or asset tag requires a specific flow (it changes asset
 * tracking) so it's not wired through the admin form yet.
 */
export default async function DeviceProfilePage({
  params,
}: {
  params: { deviceId: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const device = await prisma.device.findUnique({
    where: { id: params.deviceId },
    include: {
      model: true,
      school: { select: { id: true, name: true, code: true } },
      tickets: {
        orderBy: { reportedAt: "desc" },
        include: { events: { take: 1, orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!device) notFound();

  const openTickets = device.tickets.filter((t) => t.state !== "CLOSED");
  const closedTickets = device.tickets.filter((t) => t.state === "CLOSED");
  const now = Date.now();
  const ageYears = device.purchaseDate
    ? Math.floor((now - device.purchaseDate.getTime()) / (365 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <>
      <PageHeader
        title={device.serialNumber}
        subtitle={
          device.model
            ? `${device.model.manufacturer} ${device.model.modelName}`
            : "Unknown model"
        }
        actions={
          <Link
            href="/admin/devices"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Devices
          </Link>
        }
      />

      <section className="mb-6 grid gap-3 rounded-lg border border-surface-border bg-surface-muted p-4 sm:grid-cols-4">
        <Meta label="Asset tag" value={device.assetTag ?? "—"} />
        <Meta
          label="Owner school"
          value={
            device.school ? (
              <Link
                href={`/admin/schools/${device.school.id}`}
                className="text-accent hover:underline"
              >
                {device.school.name}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Meta
          label="Warranty"
          value={
            device.warrantyExpires
              ? device.warrantyExpires.toISOString().slice(0, 10)
              : device.model?.warrantyMonths
                ? `${device.model.warrantyMonths} mo`
                : "—"
          }
        />
        <Meta
          label="Age"
          value={ageYears != null ? `${ageYears}y` : "—"}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Open tickets{" "}
          <span className="font-medium tracking-tight text-xs text-slate-500">
            {openTickets.length}
          </span>
        </h2>
        {openTickets.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <ul className="mb-6 space-y-1 text-sm">
            {openTickets.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </ul>
        )}

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Closed tickets{" "}
          <span className="font-medium tracking-tight text-xs text-slate-500">
            {closedTickets.length}
          </span>
        </h2>
        {closedTickets.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {closedTickets.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-slate-200">{value}</div>
    </div>
  );
}

function TicketRow({
  ticket,
}: {
  ticket: {
    id: string;
    incidentNumber: string;
    state: React.ComponentProps<typeof StatePill>["state"];
    shortDescription: string;
    reportedAt: Date;
    closedAt: Date | null;
  };
}) {
  return (
    <li className="flex items-center gap-3 rounded border border-surface-border bg-surface-muted/40 px-3 py-1.5">
      <Link
        href={`/tickets/${ticket.id}`}
        className="font-medium tracking-tight text-accent hover:underline"
      >
        {ticket.incidentNumber}
      </Link>
      <StatePill state={ticket.state} />
      <span className="flex-1 truncate text-slate-300">
        {ticket.shortDescription}
      </span>
      <span className="text-xs text-slate-500">
        {ticket.reportedAt.toISOString().slice(0, 10)}
        {ticket.closedAt && (
          <> → {ticket.closedAt.toISOString().slice(0, 10)}</>
        )}
      </span>
    </li>
  );
}
