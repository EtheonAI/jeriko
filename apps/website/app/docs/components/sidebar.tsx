"use client";

import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { label: "Installation", href: "/docs/installation" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Overview", href: "/docs" },
      { label: "Authentication", href: "/docs/authentication" },
      { label: "Rate Limiting", href: "/docs/rate-limiting" },
      { label: "Errors", href: "/docs/errors" },
      { label: "WebSocket", href: "/docs/websocket" },
    ],
  },
  {
    title: "Endpoints",
    items: [
      { label: "Health", href: "/docs/endpoints/health" },
      { label: "Agent", href: "/docs/endpoints/agent" },
      { label: "Sessions", href: "/docs/endpoints/sessions" },
      { label: "Channels", href: "/docs/endpoints/channels" },
      { label: "Connectors", href: "/docs/endpoints/connectors" },
      { label: "Triggers", href: "/docs/endpoints/triggers" },
      { label: "Scheduler", href: "/docs/endpoints/scheduler" },
      { label: "Shares", href: "/docs/endpoints/shares" },
      { label: "Webhooks", href: "/docs/endpoints/webhooks" },
      { label: "OAuth", href: "/docs/endpoints/oauth" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="docs-sidebar">
      {NAV.map((group) => (
        <div key={group.title} className="docs-nav-group">
          <p className="docs-nav-title">{group.title}</p>
          {group.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`docs-nav-link${pathname === item.href ? " active" : ""}`}
            >
              {item.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
