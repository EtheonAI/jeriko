"use client";

import { motion } from "framer-motion";
import { aiModels, apps } from "@/lib/data";

const categoryLabels: Record<string, string> = {
  business: "Business",
  communication: "Communication",
  productivity: "Productivity",
  media: "Media & Search",
};

const categoryOrder = ["business", "communication", "productivity", "media"] as const;

export default function Integrations() {
  return (
    <section id="integrations" className="relative py-32 px-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
      <div className="absolute bottom-[30%] right-0 w-[500px] h-[500px] bg-[radial-gradient(ellipse,_rgba(59,130,246,0.05)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <p className="text-sm font-mono text-accent-blue/60 tracking-widest uppercase mb-4">
            Integrations
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            Any model. Any service.
            <br />
            <span className="text-foreground/30">One CLI.</span>
          </h2>
        </motion.div>

        {/* AI Models */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-20"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-accent-purple/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white/90">AI Models</h3>
            <span className="text-xs text-foreground/30 font-mono ml-2">model-agnostic</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {aiModels.map((model, i) => (
              <motion.div
                key={model.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface/60 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-accent-purple/20 hover:bg-surface-light/60"
              >
                <div className="w-2 h-2 rounded-full bg-accent-purple/30 group-hover:bg-accent-purple/60 transition-colors" />
                <div>
                  <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">
                    {model.name}
                  </div>
                  <div className="text-[11px] text-foreground/25">{model.description}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Apps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white/90">Apps</h3>
            <span className="text-xs text-foreground/30 font-mono ml-2">15 integrations</span>
          </div>

          <div className="space-y-6">
            {categoryOrder.map((cat) => {
              const catApps = apps.filter((a) => a.category === cat);
              return (
                <div key={cat}>
                  <p className="text-xs font-mono text-foreground/20 uppercase tracking-wider mb-3">
                    {categoryLabels[cat]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {catApps.map((app, i) => (
                      <motion.span
                        key={app.name}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/[0.06] bg-surface/60 text-sm text-foreground/50 backdrop-blur-sm transition-all duration-300 hover:border-accent-cyan/20 hover:text-foreground/80 hover:bg-surface-light/60 cursor-default"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan/30" />
                        {app.name}
                      </motion.span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
