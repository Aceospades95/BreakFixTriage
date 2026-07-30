import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { deviceWhereForSession } from "@/lib/data/forSession";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import {
  csvFilename,
  rowsToCsv,
  truncationHeaders,
  withTruncationNotice,
} from "@/lib/reports/csv-export";

/**
 * Round-11 §1D — admin Devices kebab "Export devices CSV" target.
 */
export async function GET() {
  const session = await getSession();
  if (
    !session ||
    !(await canAsync(session.role, PERMISSIONS.DISTRICTS_MANAGE))
  ) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const devices = await prisma.device.findMany({
    // Round-16 (B17) — tenant scope per ADR 0014.
    where: deviceWhereForSession(session),
    orderBy: { serialNumber: "asc" },
    include: {
      model: { select: { manufacturer: true, modelName: true } },
      school: { select: { name: true, code: true } },
    },
    take: 50000,
  });

  // True match count behind the row cap, so the download can
  // state what it left out instead of looking complete.
  const totalMatching = await prisma.device.count({
    where: deviceWhereForSession(session),
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

  const body = withTruncationNotice(csv, devices.length, totalMatching);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("devices")}"`,
      ...truncationHeaders(devices.length, totalMatching),
    },
  });
}
