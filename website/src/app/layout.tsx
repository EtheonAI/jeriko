import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JerikoBot — Give any AI full control of your machine",
  description:
    "27+ CLI commands that turn any AI into a full-stack agent. Model-agnostic. Composable via Unix pipes. Zero vendor lock-in.",
  openGraph: {
    title: "JerikoBot — Give any AI full control of your machine",
    description:
      "27+ CLI commands. Model-agnostic. Composable via Unix pipes. Zero vendor lock-in.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased noise`}
      >
        {children}
      </body>
    </html>
  );
}
