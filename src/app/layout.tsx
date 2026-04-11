import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the theme cookie on the server so we can stamp the class
  // on <html> before React hydrates — prevents the "flash of wrong
  // theme" that would otherwise happen when the client toggle
  // runs after paint.
  const theme = cookies().get("bft_theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" className={theme}>
      <body className="min-h-screen bg-surface antialiased">{children}</body>
    </html>
  );
}
