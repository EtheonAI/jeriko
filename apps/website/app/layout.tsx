import type { Metadata } from "next";
import Script from "next/script";
import { Footer } from "./components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jeriko | The New Intelligent OS for macOS",
  description: "Jeriko transforms your Mac into an AI-powered operating system. One daemon, one CLI, total control.",
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
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-CNR2YGSH94"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-CNR2YGSH94');
          `}
        </Script>
      </head>
      <body>
        <div className="site">
          <div className="site-content">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
