import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

/**
 * Authenticated middleware. Two jobs:
 *
 *   1. Gate every non-public page behind NextAuth (the default
 *      `withAuth` behavior).
 *   2. When `READ_ONLY_MODE=true`, refuse every non-GET request with
 *      a 503. This is the cutover-era kill switch: flipping the env
 *      var and redeploying locks the app to read-only without having
 *      to touch every server action.
 *
 * Anything NOT in the matcher is public (sign-in, NextAuth routes,
 * static assets). The matcher stays identical to Phase 1 so that
 * existing routes keep working.
 */
export default withAuth(function middleware(req) {
  if (process.env.READ_ONLY_MODE === "true") {
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      return new NextResponse(
        "BreakFix Triage is in read-only mode. Writes are disabled for the cutover window.",
        {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!signin|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
