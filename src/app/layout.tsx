import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T-Money Invitational",
  description: "Premier League predictions for friends and colleagues.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><div className="siteLinks"><a href="/">Predictions</a><a href="/preseason">Pre-season</a><a href="/admin">Commissioner</a></div>{children}</body>
    </html>
  );
}
