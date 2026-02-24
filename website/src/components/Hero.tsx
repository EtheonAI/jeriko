"use client";

import { motion } from "framer-motion";
import TerminalDemo from "./TerminalDemo";

export default function Hero() {
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

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
          <a
            href="#features"
            className="group relative inline-flex items-center px-7 py-3.5 rounded-xl font-semibold text-sm text-background overflow-hidden transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent-cyan to-accent-blue transition-all group-hover:opacity-90" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-purple" />
            <span className="relative">Explore Features</span>
          </a>
          <a
            href="https://github.com/khaleel737/jerikobot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-semibold text-sm border border-white/10 text-foreground/80 hover:border-white/20 hover:text-white transition-all backdrop-blur-sm"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>

        {/* Quick stats inline */}
        <div className="flex items-center gap-8 mt-12 text-sm text-foreground/30">
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
