export { default } from "next-auth/middleware";

/**
 * Protect all authenticated app routes. Anything NOT in the matcher is
 * public (sign-in, the NextAuth API routes, and static assets).
 *
 * The `withAuth` default behavior redirects unauthenticated users to
 * `pages.signIn` (configured in src/lib/auth/auth.ts) and preserves the
 * original URL as a `callbackUrl` query param.
 */
export const config = {
  matcher: [
    "/((?!signin|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
