import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClauseDesk | Contract review workspace",
  description: "Review cited contract obligations, track deterministic deadlines, and preserve every version.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
