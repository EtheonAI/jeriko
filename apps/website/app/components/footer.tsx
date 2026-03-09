"use client";

const YEAR = new Date().getFullYear();

const LINKS = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms-and-conditions" },
  { label: "Refund Policy", href: "/refund-policy" },
  { label: "Acceptable Use", href: "/acceptable-use" },
  { label: "API Docs", href: "/docs" },
] as const;

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p>&copy; {YEAR} Etheon, Inc. All rights reserved.</p>
        <nav>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
