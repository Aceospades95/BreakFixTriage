import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BreakFix Triage",
  description:
    "Break-fix operations platform for NYC DOE device repair lifecycle management.",
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
