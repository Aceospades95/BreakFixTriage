import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveScan } from "@/lib/scan/resolve";

/**
 * Scan resolver API. The client-side QR scanner POSTs a raw decoded
 * string here and gets back a list of matching entities. Separate
 * endpoint so the scanner component stays a pure client component
 * and the resolver logic stays on the server (where the Prisma
 * client lives).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ hits: [] }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    value?: string;
  } | null;
  const value = body?.value ?? "";
  // Tenant-scoped (Round-19): non-admins only resolve entities in
  // their own districts — a cross-tenant scan simply finds nothing,
  // matching the app's 404-not-403 posture.
  const hits = await resolveScan(value, undefined, session);
  return NextResponse.json({ hits });
}
