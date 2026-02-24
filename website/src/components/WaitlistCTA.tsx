"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";

export default function WaitlistCTA() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (data.ok) {
        setState("success");
        setEmail("");
      } else {
        setState("error");
        setErrorMsg(data.error || "Something went wrong.");
      }
    } catch {
      setState("error");
      setErrorMsg("Network error. Try again.");
    }
  }

  return (
    <section
      id="waitlist"
      className="relative py-32 px-6 flex flex-col items-center text-center"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[radial-gradient(ellipse,_rgba(255,255,255,0.04)_0%,_transparent_60%)] pointer-events-none" />

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative text-3xl sm:text-4xl font-bold bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent"
      >
        Be the first to know.
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative mt-4 text-gray-500 max-w-md"
      >
        We&apos;ll let you know when Jeriko is ready.
      </motion.p>

      {state === "success" ? (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative mt-8 text-emerald-400 font-medium"
        >
          You&apos;re on the list.
        </motion.p>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          onSubmit={handleSubmit}
          className="relative mt-8 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md"
        >
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 w-full px-4 py-3 bg-white/[0.05] border border-white/[0.15] rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-white/40 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="w-full sm:w-auto px-6 py-3 bg-white text-black font-semibold text-sm rounded-lg hover:bg-gray-200 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] disabled:opacity-50 transition-all cursor-pointer"
          >
            {state === "loading" ? "Joining..." : "Join Waitlist"}
          </button>
        </motion.form>
      )}

      {state === "error" && (
        <p className="relative mt-3 text-sm text-red-400">{errorMsg}</p>
      )}
    </section>
  );
}
