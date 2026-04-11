import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { ScanWarehouseClient } from "./scan-warehouse-client";

export const dynamic = "force-dynamic";

/**
 * Warehouse scan-in station.
 *
 * Dedicated scanner page for the warehouse intake bench. Every
 * scan auto-transitions the device's open pickup tickets to
 * IN_WAREHOUSE, no manual click-throughs required.
 */
export default async function ScanWarehousePage() {
  await requireRole(PERMISSIONS.TICKETS_TRANSITION);

  return (
    <>
      <PageHeader
        title="Warehouse check-in"
        subtitle="Scan every device as it comes through the warehouse door — the ticket auto-moves to IN_WAREHOUSE."
        actions={
          <Link
            href="/scan"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ← Generic scan
          </Link>
        }
      />
      <div className="mx-auto max-w-lg">
        <ScanWarehouseClient />
      </div>
    </>
  );
}
