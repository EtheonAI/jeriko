"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion, useMotionValue } from "framer-motion";
import Image from "next/image";

const tagline = "The missing fabric of intelligent OS";
const words = tagline.split(" ");

export default function Hero() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [spotlightStyle, setSpotlightStyle] = useState({});
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      setSpotlightStyle({
        background: `radial-gradient(800px circle at ${e.clientX}px ${e.clientY}px, rgba(255,255,255,0.06), transparent 60%)`,
      });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setFormState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (data.ok) {
        setFormState("success");
        setEmail("");
      } else {
        setFormState("error");
        setErrorMsg(data.error || "Something went wrong.");
      }
    } catch {
      setFormState("error");
      setErrorMsg("Network error. Try again.");
    }
  }

  const formDelay = 0.3 + words.length * 0.12 + 0.2;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 grid-pattern pointer-events-none" />

      {/* Top radial glow */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse,_rgba(255,255,255,0.06)_0%,_rgba(255,255,255,0.02)_30%,_transparent_60%)] pointer-events-none" />

      {/* Cursor-following spotlight */}
      <div
        className="absolute inset-0 pointer-events-none transition-[background] duration-200"
        style={spotlightStyle}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
        {/* Logo with glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-10 relative"
        >
          <div className="absolute -inset-10 bg-[radial-gradient(circle,_rgba(255,255,255,0.12)_0%,_transparent_60%)] blur-2xl animate-pulse" />
          <Image
            src="/images/jeriko-logo.png"
            alt="Jeriko"
            width={88}
            height={88}
            className="relative"
            style={{ filter: "brightness(5) drop-shadow(0 0 40px rgba(255,255,255,0.4))" }}
            priority
          />
        </motion.div>

        {/* Text-generate tagline with gradient */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
          {words.map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, filter: "blur(12px)", y: 12 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.5 + i * 0.12,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="inline-block mr-[0.3em] bg-gradient-to-b from-white via-white to-gray-400 bg-clip-text text-transparent"
            >
              {word}
            </motion.span>
          ))}
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: 0.5 + words.length * 0.12 + 0.3,
          }}
          className="mt-6 text-lg text-gray-500"
        >
          Something is coming.
        </motion.p>

        {/* Waitlist form */}
        {formState === "success" ? (
          <motion.p
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-10 text-emerald-400 font-medium"
          >
            You&apos;re on the list.
          </motion.p>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: formDelay }}
            onSubmit={handleSubmit}
            className="mt-10 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md"
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
              disabled={formState === "loading"}
              className="w-full sm:w-auto px-6 py-3 bg-white text-black font-semibold text-sm rounded-lg hover:bg-gray-200 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] disabled:opacity-50 transition-all cursor-pointer"
            >
              {formState === "loading" ? "Joining..." : "Join Waitlist"}
            </button>
          </motion.form>
        )}

        {formState === "error" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-sm text-red-400"
          >
            {errorMsg}
          </motion.p>
        )}
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  );
}
