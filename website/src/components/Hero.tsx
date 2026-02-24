"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import TerminalDemo from "./TerminalDemo";

const installTabs = [
  { label: "macOS / Linux", cmd: "curl -fsSL https://jerikobot.vercel.app/install.sh | bash" },
  { label: "Windows", cmd: "iwr -useb https://jerikobot.vercel.app/install.ps1 | iex" },
];

export default function Hero() {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installTabs[activeTab].cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-16 pb-24 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse,_rgba(34,211,238,0.08)_0%,_rgba(59,130,246,0.04)_40%,_transparent_70%)] pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto"
      >
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-1.5 text-sm text-accent-cyan/80 mb-10 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Open Source &middot; MIT License
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95]">
          <span className="text-white">Give any AI</span>
          <br />
          <span className="gradient-text">full control</span>
          <br />
          <span className="text-white">of your machine.</span>
        </h1>

        {/* Sub */}
        <p className="mt-8 text-lg sm:text-xl text-foreground/50 max-w-xl leading-relaxed">
          One CLI. 27+ commands. Any model.
          <br className="hidden sm:block" />
          Composable via Unix pipes. Zero vendor lock-in.
        </p>

        {/* Install snippet */}
        <div className="mt-10 w-full max-w-xl">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-0">
            {installTabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                  activeTab === i
                    ? "bg-[#0a1120] text-accent-cyan border border-b-0 border-white/10"
                    : "text-foreground/30 hover:text-foreground/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Command box */}
          <div className="relative group">
            <div className="flex items-center gap-3 bg-[#0a1120] border border-white/10 rounded-b-xl rounded-tr-xl px-4 py-3.5">
              <span className="text-accent-cyan/50 select-none">$</span>
              <code className="flex-1 text-sm font-mono text-foreground/80 overflow-x-auto whitespace-nowrap scrollbar-none">
                {installTabs[activeTab].cmd}
              </code>
              <button
                onClick={copyToClipboard}
                className="shrink-0 p-1.5 rounded-md text-foreground/30 hover:text-foreground/70 hover:bg-white/5 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick stats inline */}
        <div className="flex items-center gap-8 mt-10 text-sm text-foreground/30">
          <span><strong className="text-foreground/60 font-mono">27+</strong> commands</span>
          <span className="w-px h-4 bg-white/10" />
          <span><strong className="text-foreground/60 font-mono">35x</strong> more efficient than MCP</span>
          <span className="w-px h-4 bg-white/10 hidden sm:block" />
          <span className="hidden sm:inline"><strong className="text-foreground/60 font-mono">55</strong> line remote agent</span>
        </div>
      </motion.div>

      {/* Terminal */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 mt-16 w-full max-w-2xl"
      >
        <div className="absolute -inset-4 bg-gradient-to-b from-accent-cyan/5 to-transparent rounded-2xl blur-xl pointer-events-none" />
        <TerminalDemo />
      </motion.div>
    </section>
  );
}
