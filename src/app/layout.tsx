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
 * Round-12 §1G.1 + §1G hotfix — the inline anti-flash script.
 *
 * Runs synchronously before any paint. Two responsibilities:
 *
 *   1. If the layout chose to emit <html> with no theme class
 *      (system mode), read prefers-color-scheme and add the
 *      matching class.
 *   2. Stamp data-theme-resolved with the resolved class so any
 *      CSS rule keyed on it has a real value to match (never
 *      "pending"). The server-render path already sets the
 *      attribute when theme is light/dark; this script handles
 *      the system case.
 *
 * Wrapped in try/catch so a script failure never blanks the page.
 */
const ANTI_FLASH_SCRIPT = `
(function(){
  try {
    var html = document.documentElement;
    var resolved;
    if (html.classList.contains('light')) {
      resolved = 'light';
    } else if (html.classList.contains('dark')) {
      resolved = 'dark';
    } else {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolved = dark ? 'dark' : 'light';
      html.classList.add(resolved);
    }
    html.setAttribute('data-theme-resolved', resolved);
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
      // Round-12 §1G hotfix — never ship "pending". When the
      // server can't know the OS preference (system mode),
      // omit the attribute entirely; the inline anti-flash
      // script adds it before paint. CSS rules that key on this
      // attribute should match either an explicit "light" /
      // "dark" value or fall back to the .light / .dark class
      // selector (set both server- and client-side).
      data-theme-resolved={themeClass ?? undefined}
    >
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface antialiased">{children}</body>
    </html>
  );
}
