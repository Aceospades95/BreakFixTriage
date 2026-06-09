import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { globalSearch } from "@/lib/search";

/**
 * Global search API. Called by the header search box as the user
 * types. Returns a JSON array of `SearchHit` records. Gated on an
 * authenticated session AND on the actor's district scope —
 * Round-13 §1C closes the cross-tenant enumeration that allowed any
 * authenticated user to find tickets/schools/devices in any
 * district.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json([], { status: 401 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const hits = await globalSearch({ query: q, session });
  return NextResponse.json(hits);
}
