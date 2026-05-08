import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  classForTheme,
  resolveTheme,
  THEME_COOKIE_NAME,
  LEGACY_THEME_COOKIE_NAME,
} from "@/lib/theme/resolve";
import "./globals.css";

export const metadata: Metadata = {
  title: "BreakFix Triage",
  description:
    "Break-fix operations platform for NYC DOE device repair lifecycle management.",
  applicationName: "BreakFix Triage",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BreakFix",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Round-12 §1G.1 — the inline anti-flash script.
 *
 * Runs synchronously before any paint. If the layout chose to emit
 * <html> with no theme class (system mode), this script reads the
 * OS preference and adds the matching class. Without this, system-
 * mode users would see a flash of the default (light) before the
 * `<ThemeSystemListener>` client component hydrated.
 *
 * Wrapped in try/catch so a script failure never blanks the page.
 */
const ANTI_FLASH_SCRIPT = `
(function(){
  try {
    var html = document.documentElement;
    if (!html.classList.contains('light') && !html.classList.contains('dark')) {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.classList.add(dark ? 'dark' : 'light');
    }
  } catch (e) { /* paint anyway */ }
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Round-12 §1G.1 — server-rendered theme on root layout.
  // Priority: DB (when signed in) → 'theme' cookie → legacy
  // 'bft_theme' cookie → 'system' default.
  const session = await getSession();
  let userPref: { theme: string } | null = null;
  if (session?.userId) {
    try {
      userPref = await prisma.userPreference.findUnique({
        where: { userId: session.userId },
        select: { theme: true },
      });
    } catch {
      // DB unreachable on first-render of an empty deploy; the
      // cookie path takes over.
      userPref = null;
    }
  }

  const cookieJar = cookies();
  const theme = resolveTheme({
    user: session?.userId ? { preferences: userPref } : null,
    cookieTheme: cookieJar.get(THEME_COOKIE_NAME)?.value ?? null,
    legacyCookieTheme: cookieJar.get(LEGACY_THEME_COOKIE_NAME)?.value ?? null,
  });
  const themeClass = classForTheme(theme);

  return (
    <html
      lang="en"
      className={themeClass ?? undefined}
      data-theme={theme}
      data-theme-resolved={themeClass ?? "pending"}
    >
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface antialiased">{children}</body>
    </html>
  );
}
