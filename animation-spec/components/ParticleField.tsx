"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * ParticleField — 30 floating particles
 * ═══════════════════════════════════════════════════════════════
 *
 * Generates 30 particles with deterministic pseudo-random properties:
 *   - Size: 2-6px
 *   - Position: distributed across viewport via percentage-based layout
 *   - Drift path: unique 4-point keyframe cycle (15-40s duration)
 *   - Opacity: 0.1-0.5, oscillating within cycle
 *   - Start delay: 0-5s stagger
 *
 * Performance:
 *   - 30 × motion.div = 30 compositor layers
 *   - Each uses transform + opacity only (GPU composited)
 *   - will-change: transform, opacity
 *   - Reduced to 15 on mobile (via prefersReducedMotion or mobile check)
 *   - Consider using <canvas> if >50 particles are needed
 *
 * CSS fallback:
 *   @keyframes particle-1 {
 *     0%, 100% { transform: translate(0,0); opacity: 0.3; }
 *     25% { transform: translate(50px, -30px); }
 *     50% { transform: translate(-20px, 60px); opacity: 0.2; }
 *     75% { transform: translate(40px, 20px); }
 *   }
 *   .particle { position: absolute; border-radius: 50%; background: white; }
 *   .particle-1 { animation: particle-1 25s linear infinite; }
 */

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createParticleVariants } from "../lib/variants";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

/** Deterministic pseudo-random number generator */
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

export function ParticleField({ count = 30, className = "" }: ParticleFieldProps) {
  const prefersReducedMotion = useReducedMotion();

  // Reduce particle count for reduced motion or mobile
  const effectiveCount = prefersReducedMotion
    ? Math.min(count, 5)
    : typeof window !== "undefined" && window.innerWidth < 768
      ? Math.min(count, 15)
      : count;

  const particles = useMemo(() => {
    return Array.from({ length: effectiveCount }, (_, i) => {
      const seed = i * 137.508; // Golden angle for even distribution
      return {
        id: i,
        seed,
        // Distribute across viewport
        left: `${seededRandom(seed) * 100}%`,
        top: `${seededRandom(seed + 100) * 100}%`,
        // Size: 2-6px
        size: 2 + seededRandom(seed + 200) * 4,
        // Base opacity
        baseOpacity: 0.1 + seededRandom(seed + 300) * 0.4,
      };
    });
  }, [effectiveCount]);

  if (prefersReducedMotion) {
    return (
      <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-white/20"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              opacity: p.baseOpacity * 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <AnimatePresence>
        {particles.map((p) => {
          const variants = createParticleVariants(p.seed);
          return (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
                background: "rgba(255,255,255,0.6)",
                willChange: "transform, opacity",
              }}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
