"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TrishulHub Landing Page — FULL ANIMATION CHOREOGRAPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tech: Next.js 16 · React 19 · framer-motion ^12.23.2 · Tailwind CSS 4 · lucide-react
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │                        PAGE LOAD CHOREOGRAPHY                              │
 * │                                                                            │
 * │  t=0.00s ▓▓▓▓ Background blobs (infinite, already moving)                │
 * │  t=0.00s ░░░░ Particles fade in                                          │
 * │  t=0.10s ░░░░ Noise texture + vignette                                   │
 * │  t=0.20s ▒▒▒▒ Top bar slides down (spring gentle)                        │
 * │  t=0.35s ░░░░ Dot grid fades in                                          │
 * │  t=0.50s ▒▒▒▒ Central orb pulses in (spring heavy)                       │
 * │  t=0.60s ████ Title letters stagger (150ms/letter × 10 = ~0.9s)         │
 * │  t=1.40s ▒▒▒▒ Subtitle fades up (spring gentle)                           │
 * │  t=1.55s ░░░░ Typewriter starts (55ms/char × 19 = ~1.05s)               │
 * │  t=2.10s ▒▒▒▒ Feature pills stagger (3 × 100ms = 0.3s)                   │
 * │  t=2.30s ▒▒▒▒ Buttons stagger reveal (2 × 120ms = 0.24s)                │
 * │  t=2.50s ░░░░ Footer fades up                                             │
 * │  ──────────────────────────────────────────                                │
 * │  Total choreography: ~2.5s (interactive by 1.5s)                           │
 * │                                                                            │
 * │  Legend: ████ High priority (hero content)                                │
 * │          ▒▒▒▒ Medium priority (navigation, CTAs)                          │
 * │          ░░░░ Ambient (background, decorations)                           │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ALL 13 PAGE ELEMENTS PRESERVED:
 *  [x]  1. "TrishulHub" title — letter-by-letter spring
 *  [x]  2. "Your Personal Workspace" subtitle — fade up
 *  [x]  3. "I am ready to cook." typewriter — 55ms/char + cursor
 *  [x]  4. START button — hover glow + orbit ring + magnetic
 *  [x]  5. "Claim Credentials" button — hover glow + magnetic
 *  [x]  6. Feature pills: Secured, AI Powered, Cloud Native
 *  [x]  7. Footer: Welcome back, {userName} • {userRole}
 *  [x]  8. Top bar: Logo dot + "TrishulHub" + "Protocol v5.0"
 *  [x]  9. Central pulsing orb with 3 rings
 *  [x] 10. Animated mesh gradient background (4 blobs)
 *  [x] 11. 30 floating particles
 *  [x] 12. Dot grid overlay
 *  [x] 13. Noise texture + vignette
 */

import React, { useState, useEffect } from "react";
import { motion, MotionConfig, AnimatePresence } from "framer-motion";
import { Shield, Zap, Globe, Rocket } from "lucide-react";

// ─── Components ───
import { AnimatedTitle } from "./components/AnimatedTitle";
import { AnimatedTypewriter } from "./components/AnimatedTypewriter";
import { AnimatedButton } from "./components/AnimatedButton";
import { ParticleField } from "./components/ParticleField";
import { CentralOrb } from "./components/CentralOrb";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { TiltCard } from "./components/TiltCard";

// ─── Variants ───
import {
  topBarVariants,
  subtitleVariants,
  pillsContainer,
  pillVariants,
  pillIconVariants,
  buttonContainerVariants,
  buttonRevealVariants,
  footerVariants,
  themeTransition,
  pageLoadSequence,
  spring,
} from "./lib/variants";

// ─── Hooks ───
import { useReducedMotion } from "./hooks/useReducedMotion";

// ═══════════════════════════════════════════════════════════
// Feature pill data
// ═══════════════════════════════════════════════════════════
const FEATURES = [
  {
    label: "Secured",
    icon: Shield,
    glowColor: "rgba(34,197,94,0.3)",
    borderColor: "rgba(34,197,94,0.3)",
  },
  {
    label: "AI Powered",
    icon: Zap,
    glowColor: "rgba(99,102,241,0.3)",
    borderColor: "rgba(99,102,241,0.3)",
  },
  {
    label: "Cloud Native",
    icon: Globe,
    glowColor: "rgba(59,130,246,0.3)",
    borderColor: "rgba(59,130,246,0.3)",
  },
];

// ═══════════════════════════════════════════════════════════
// USER DATA (replace with your auth context)
// ═══════════════════════════════════════════════════════════
const USER_DATA = {
  name: "User",
  role: "Developer",
};

// ═══════════════════════════════════════════════════════════
// MAIN LANDING PAGE COMPONENT
// ═══════════════════════════════════════════════════════════
export default function TrishulHubLanding() {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [userName, setUserName] = useState(USER_DATA.name);
  const [userRole, setUserRole] = useState(USER_DATA.role);

  // Hydration guard — prevents SSR animation flash
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-950" aria-hidden="true">
        {/* SSR placeholder — matches layout to prevent CLS */}
      </div>
    );
  }

  return (
    <MotionConfig
      reducedMotion={prefersReducedMotion ? "user" : undefined}
      transition={themeTransition}
    >
      <main className="relative min-h-screen overflow-hidden bg-gray-950 text-white selection:bg-indigo-500/30">
        {/* ═══════════════════════════════════════════════════
            LAYER 0: ANIMATED BACKGROUND (elements 10, 12, 13)
            ═══════════════════════════════════════════════════ */}
        <AnimatedBackground />

        {/* ═══════════════════════════════════════════════════
            LAYER 1: PARTICLES (element 11)
            ═══════════════════════════════════════════════════ */}
        <ParticleField count={30} />

        {/* ═══════════════════════════════════════════════════
            LAYER 2: TOP BAR (element 8)
            ═══════════════════════════════════════════════════ */}
        <motion.header
          className="relative z-20 flex items-center justify-between px-6 py-4"
          variants={topBarVariants}
          initial="hidden"
          animate="visible"
          style={{ willChange: "transform, opacity" }}
        >
          {/* Logo dot + "TrishulHub" */}
          <div className="flex items-center gap-3">
            <motion.div
              className="w-3 h-3 rounded-full bg-indigo-500"
              animate={{
                boxShadow: [
                  "0 0 8px rgba(99,102,241,0.6)",
                  "0 0 16px rgba(99,102,241,0.9)",
                  "0 0 8px rgba(99,102,241,0.6)",
                ],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ willChange: "box-shadow" }}
            />
            <span className="text-sm font-semibold tracking-wide text-white/90">
              TrishulHub
            </span>
          </div>

          {/* "Protocol v5.0" badge */}
          <motion.span
            className="px-3 py-1 text-[10px] font-mono tracking-widest uppercase rounded-full
                       bg-indigo-500/10 text-indigo-400/70 border border-indigo-500/20"
            whileHover={{
              backgroundColor: "rgba(99,102,241,0.15)",
              borderColor: "rgba(99,102,241,0.35)",
              transition: { ...spring.snappy },
            }}
          >
            Protocol v5.0
          </motion.span>
        </motion.header>

        {/* ═══════════════════════════════════════════════════
            LAYER 3: HERO CONTENT
            ═══════════════════════════════════════════════════ */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6">
          {/* ── Central Orb (element 9) ── */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <CentralOrb size={120} />
          </div>

          {/* ── Title (element 1): "TrishulHub" ── */}
          <AnimatedTitle
            text="TrishulHub"
            className="text-5xl sm:text-7xl font-bold tracking-tight text-center mb-4"
            letterClassName="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent"
          />

          {/* ── Subtitle (element 2): "Your Personal Workspace" ── */}
          <motion.p
            className="text-lg sm:text-xl text-white/50 font-light tracking-wide text-center mb-6"
            variants={subtitleVariants}
            initial="hidden"
            animate="visible"
            style={{ willChange: "transform, opacity" }}
          >
            Your Personal Workspace
          </motion.p>

          {/* ── Typewriter (element 3): "I am ready to cook." ── */}
          <div className="h-8 mb-10">
            <AnimatedTypewriter
              text="I am ready to cook."
              speed={55}
              className="text-base sm:text-lg font-mono text-indigo-400/80 tracking-wide"
              cursorClassName="text-indigo-400 font-light ml-0.5"
            />
          </div>

          {/* ── Feature Pills (element 6) ── */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-3 mb-10"
            variants={pillsContainer}
            initial="hidden"
            animate="visible"
          >
            {FEATURES.map((feature) => (
              <TiltCard key={feature.label} maxRotation={8} glareIntensity={0.08}>
                <motion.div
                  className="flex items-center gap-2 px-4 py-2 rounded-full
                             bg-white/[0.04] border border-white/[0.08]
                             backdrop-blur-sm cursor-default"
                  variants={pillVariants}
                  whileHover="hover"
                  style={{ willChange: "transform, opacity" }}
                >
                  <motion.span
                    variants={pillIconVariants}
                    style={{ willChange: "transform" }}
                  >
                    <feature.icon
                      size={14}
                      className="text-white/60"
                      strokeWidth={1.5}
                    />
                  </motion.span>
                  <span className="text-xs font-medium tracking-wide text-white/50">
                    {feature.label}
                  </span>
                </motion.div>
              </TiltCard>
            ))}
          </motion.div>

          {/* ── Buttons (elements 4 & 5) ── */}
          <motion.div
            className="flex flex-col sm:flex-row items-center gap-4"
            variants={buttonContainerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={buttonRevealVariants} style={{ willChange: "transform, opacity" }}>
              <AnimatedButton
                variant="primary"
                magnetic
                magneticStrength={8}
                orbit
                onClick={() => window.open("https://workspace-dashboard-rho.vercel.app/", "_blank", "noopener,noreferrer")}
                className="group relative"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Rocket size={16} strokeWidth={1.5} />
                  START
                </span>
              </AnimatedButton>
            </motion.div>

            <motion.div variants={buttonRevealVariants} style={{ willChange: "transform, opacity" }}>
              <AnimatedButton
                variant="secondary"
                magnetic
                magneticStrength={6}
                onClick={() => {
                  // Next.js router navigation
                  window.location.href = "/dashboard/credentials";
                }}
              >
                Claim Credentials
              </AnimatedButton>
            </motion.div>
          </motion.div>
        </div>

        {/* ═══════════════════════════════════════════════════
            LAYER 4: FOOTER (element 7)
            ═══════════════════════════════════════════════════ */}
        <motion.footer
          className="relative z-10 flex items-center justify-center gap-2 pb-6 text-xs text-white/30"
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          style={{ willChange: "transform, opacity" }}
        >
          <span>Welcome back, <span className="text-white/50">{userName}</span></span>
          <span className="text-white/15">•</span>
          <span>{userRole}</span>
        </motion.footer>
      </main>
    </MotionConfig>
  );
}
