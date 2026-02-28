import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jeriko | Unix-First Autonomous AI",
  description: "Jeriko is a Unix-first autonomous AI daemon and CLI for your operating system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
