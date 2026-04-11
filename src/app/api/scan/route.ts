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
  const hits = await resolveScan(value);
  return NextResponse.json({ hits });
}
