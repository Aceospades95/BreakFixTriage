import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

/**
 * Round-11 §1D — admin Devices kebab "Export devices CSV" target.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.DISTRICTS_MANAGE))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const devices = await prisma.device.findMany({
    orderBy: { serialNumber: "asc" },
    include: {
      model: { select: { manufacturer: true, modelName: true } },
      school: { select: { name: true, code: true } },
    },
    take: 50000,
  });

  const csv = rowsToCsv(devices, [
    { header: "Serial Number", get: (d) => d.serialNumber },
    { header: "Asset Tag", get: (d) => d.assetTag ?? "" },
    { header: "Manufacturer", get: (d) => d.model?.manufacturer ?? "" },
    { header: "Model", get: (d) => d.model?.modelName ?? "" },
    { header: "Owner School", get: (d) => d.school?.name ?? "" },
    { header: "Owner School Code", get: (d) => d.school?.code ?? "" },
    { header: "Retired", get: (d) => (d.retiredAt ? d.retiredAt : "active") },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("devices")}"`,
    },
  });
}
