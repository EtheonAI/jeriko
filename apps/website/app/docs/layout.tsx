import type { Metadata } from "next";
import { Sidebar } from "./components/sidebar";

export const metadata: Metadata = {
  title: "API Documentation | Jeriko",
  description:
    "Jeriko API reference — endpoints, authentication, WebSocket protocol, and more.",
};

export default function DocsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="docs-layout">
      <Sidebar />
      <main className="docs-content">{children}</main>
    </div>
  );
}
