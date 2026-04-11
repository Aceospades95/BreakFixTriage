import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { ScanClient } from "./scan-client";

export const dynamic = "force-dynamic";

/**
 * Scanner landing page. Open on a phone or tablet, point the
 * camera at any BreakFix Triage QR / barcode, and the app routes
 * to the matching entity.
 *
 * This is a thin server wrapper around the client-only scanner so
 * we can enforce the TICKETS_READ permission at the edge before
 * the camera boots.
 */
export default async function ScanPage() {
  await requireRole(PERMISSIONS.TICKETS_READ);

  return (
    <>
      <PageHeader
        title="Scan"
        subtitle="Scan a device, ticket, part, or school to jump straight to it."
      />
      <div className="mx-auto max-w-lg">
        <ScanClient />
      </div>
    </>
  );
}
