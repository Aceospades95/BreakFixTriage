import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { schoolWhereForSession } from "@/lib/data/forSession";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

/**
 * Round-11 §1D — admin Schools kebab "Export schools CSV" target.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.DISTRICTS_MANAGE))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const schools = await prisma.school.findMany({
    // Round-16 (B17) — tenant scope per ADR 0014.
    where: schoolWhereForSession(session),
    orderBy: { name: "asc" },
    include: {
      district: { select: { code: true, name: true } },
      address: true,
    },
  });

  const csv = rowsToCsv(schools, [
    { header: "Code", get: (s) => s.code ?? "" },
    { header: "Name", get: (s) => s.name },
    { header: "District", get: (s) => s.district?.name ?? "" },
    { header: "District Code", get: (s) => s.district?.code ?? "" },
    { header: "Address Line 1", get: (s) => s.address?.line1 ?? "" },
    { header: "Address Line 2", get: (s) => s.address?.line2 ?? "" },
    { header: "City", get: (s) => s.address?.city ?? "" },
    { header: "State", get: (s) => s.address?.state ?? "" },
    { header: "ZIP", get: (s) => s.address?.postalCode ?? "" },
    { header: "Latitude", get: (s) => s.address?.latitude ?? "" },
    { header: "Longitude", get: (s) => s.address?.longitude ?? "" },
    { header: "Active", get: (s) => s.active },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("schools")}"`,
    },
  });
}
