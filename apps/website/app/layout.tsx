import type { Metadata } from "next";
import { Footer } from "./components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jeriko | Unix-First Autonomous AI",
  description: "Jeriko is a Unix-first autonomous AI daemon and CLI for your operating system.",
  icons: {
    icon: "/jeriko-logo-white.png",
    apple: "/jeriko-logo-white.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="site">
          <div className="site-content">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
