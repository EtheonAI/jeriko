"use client";

import { useState, useEffect, useCallback } from "react";
import { terminalSequences } from "@/lib/data";

export default function TerminalDemo() {
  const [seqIndex, setSeqIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [showOutput, setShowOutput] = useState(false);
  const [phase, setPhase] = useState<"typing" | "output" | "pause">("typing");

  const seq = terminalSequences[seqIndex];
  const displayedCommand = seq.command.slice(0, charIndex);

  const advance = useCallback(() => {
    setShowOutput(false);
    setCharIndex(0);
    setPhase("typing");
    setSeqIndex((prev) => (prev + 1) % terminalSequences.length);
  }, []);

  useEffect(() => {
    if (phase === "typing") {
      if (charIndex < seq.command.length) {
        const timer = setTimeout(() => setCharIndex((c) => c + 1), 35);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          setShowOutput(true);
          setPhase("output");
        }, 250);
        return () => clearTimeout(timer);
      }
    }
    if (phase === "output") {
      const timer = setTimeout(() => setPhase("pause"), 2200);
      return () => clearTimeout(timer);
    }
    if (phase === "pause") {
      const timer = setTimeout(advance, 400);
      return () => clearTimeout(timer);
    }
  }, [phase, charIndex, seq.command.length, advance]);

  return (
    <div className="relative w-full rounded-xl border border-white/[0.06] bg-terminal-bg overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]">
      {/* Chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
        </div>
        <span className="ml-3 text-[11px] text-white/20 font-mono">~</span>
      </div>

      {/* Content */}
      <div className="p-5 font-mono text-[13px] min-h-[100px]">
        <div className="flex items-start">
          <span className="text-terminal-green/70 mr-2 select-none">❯</span>
          <div>
            <span className="text-accent-cyan">{displayedCommand}</span>
            {phase === "typing" && (
              <span className="inline-block w-[7px] h-[15px] bg-accent-cyan/80 ml-px translate-y-[1px] animate-pulse" />
            )}
          </div>
        </div>

        {showOutput && (
          <div className="mt-3 text-white/30 text-xs leading-relaxed break-all pl-5">
            {seq.output}
          </div>
        )}
      </div>
    </div>
  );
}
