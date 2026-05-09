import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

/**
 * Round-11 §1D — admin Users kebab "Export users CSV" target.
 * USERS_MANAGE-only because the table includes the role column.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.USERS_MANAGE))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: {
      districts: {
        include: { district: { select: { code: true } } },
      },
    },
  });

  const csv = rowsToCsv(users, [
    { header: "Name", get: (u) => u.name },
    { header: "Email", get: (u) => u.email },
    { header: "Role", get: (u) => u.role },
    { header: "Active", get: (u) => u.active },
    {
      header: "Districts",
      get: (u) => u.districts.map((d) => d.district.code).join(", "),
    },
    { header: "TOTP Enabled", get: (u) => Boolean(u.totpEnabledAt) },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("users")}"`,
    },
  });
}
