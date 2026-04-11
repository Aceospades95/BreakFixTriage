import type { Metadata, Viewport } from "next";
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
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
