import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { getExceptionCounts } from "@/lib/exceptions/counts";

/**
 * Round-16 (D2) — count endpoint for the topbar exceptions badge.
 * USERS_MANAGE-gated like /admin/exceptions itself; returns a real
 * 401 (not a redirect) because the consumer is a fetch, not a
 * navigation.
 */
export async function GET() {
  const session = await getSession();
  if (
    !session ||
    !(await canAsync(session.role, PERMISSIONS.USERS_MANAGE))
  ) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const counts = await getExceptionCounts();
  return NextResponse.json(counts, {
    // Badge data tolerates a couple of minutes of staleness. The
    // private cache lets N open tabs share one count fetch instead of
    // each running the seven COUNT queries on their own timer.
    headers: { "Cache-Control": "private, max-age=120" },
  });
}
