import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T-Money Invitational",
  description: "Premier League predictions for friends and colleagues.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
