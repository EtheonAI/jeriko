"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { featureHints } from "@/lib/data";

const hintIcons: Record<string, React.ReactNode> = {
  monitor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
    </svg>
  ),
  sparkles: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  ),
  puzzle: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.166 3.298-.108 4.984a.641.641 0 00.658.643 48.394 48.394 0 004.163-.3.64.64 0 01.657.643v0c0 .355-.186.676-.401.959a1.647 1.647 0 00-.349 1.003c0 1.035 1.007 1.875 2.25 1.875s2.25-.84 2.25-1.875c0-.369-.128-.713-.349-1.003-.215-.283-.401-.604-.401-.959v0c0-.368.312-.658.657-.643a48.39 48.39 0 014.163.3c-.186-1.613-.166-3.298.108-4.984a.641.641 0 00-.658-.643 48.394 48.394 0 01-4.163.3.64.64 0 01-.657-.643v0z" />
    </svg>
  ),
  zap: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
};

const hintColors: Record<string, string> = {
  monitor: "#60A5FA",
  sparkles: "#A78BFA",
  puzzle: "#34D399",
  zap: "#FBBF24",
};

function SpotlightCard({
  children,
  className = "",
  glowColor,
}: {
  children: React.ReactNode;
  className?: string;
  glowColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden border rounded-xl p-8 transition-all duration-300 ${className}`}
      style={{
        borderColor: isHovered ? `${glowColor}30` : "rgba(255,255,255,0.08)",
        backgroundColor: isHovered ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        boxShadow: isHovered ? `0 0 30px ${glowColor}10, inset 0 0 30px ${glowColor}05` : "none",
      }}
    >
      {isHovered && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(200px circle at ${position.x}px ${position.y}px, ${glowColor}20, transparent 70%)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default function FeatureHints() {
  return (
    <section className="relative py-24 px-6">
      <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
        {featureHints.map((hint, i) => (
          <motion.div
            key={hint.label}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <SpotlightCard
              className="flex flex-col items-center text-center gap-4 cursor-default"
              glowColor={hintColors[hint.icon]}
            >
              <div
                className="transition-transform duration-300 hover:scale-110"
                style={{ color: hintColors[hint.icon] }}
              >
                {hintIcons[hint.icon]}
              </div>
              <span className="text-sm font-medium text-gray-300">
                {hint.label}
              </span>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
