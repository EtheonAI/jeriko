"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? "bg-black/80 backdrop-blur-md border-b border-white/10"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2.5">
          <Image
            src="/images/jeriko-logo.png"
            alt="Jeriko"
            width={28}
            height={28}
            style={{ filter: "brightness(5)" }}
          />
          <span className="font-mono text-sm font-semibold text-white tracking-tight">
            Jeriko
          </span>
        </a>

        <a
          href="#waitlist"
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-white/20 rounded-lg text-white/80 bg-transparent hover:bg-white hover:text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all duration-200"
        >
          Join Waitlist
        </a>
      </div>
    </nav>
  );
}
