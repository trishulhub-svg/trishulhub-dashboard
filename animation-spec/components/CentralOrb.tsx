"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * CentralOrb — Pulsing orb with 3 concentric rings
 * ═══════════════════════════════════════════════════════════════
 *
 * Core: pulsing glow (scale 1→1.08→1, shadow intensity oscillation)
 * Ring 0 (inner): fast pulse (3s cycle, scale 0.8→1.15→0.8)
 * Ring 1 (middle): counter-phase pulse (4s cycle, scale 1.1→0.85→1.1)
 * Ring 2 (outer): slow subtle pulse (5s cycle, scale 0.95→1.05→0.95)
 *
 * Rings use border + border-radius with varying opacity.
 *
 * Performance:
 *   - Core: transform + box-shadow (shadow is NOT composited but lightweight)
 *   - Rings: transform + opacity (GPU composited)
 *   - will-change: transform, box-shadow (core), transform, opacity (rings)
 *   - 4 animated elements total — well within budget
 *
 * CSS fallback:
 *   @keyframes orbPulse {
 *     0%, 100% { transform: scale(1); box-shadow: 0 0 30px rgba(99,102,241,0.4); }
 *     50% { transform: scale(1.08); box-shadow: 0 0 60px rgba(99,102,241,0.6); }
 *   }
 *   .orb-core { animation: orbPulse 3s ease-in-out infinite; }
 */

import React from "react";
import { motion } from "framer-motion";
import { orbCoreVariants, orbPulseVariants, orbRingVariants } from "../lib/variants";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface CentralOrbProps {
  className?: string;
  size?: number;
  color?: string;
}

export function CentralOrb({
  className = "",
  size = 120,
  color = "rgba(99,102,241,1)",
}: CentralOrbProps) {
  const prefersReducedMotion = useReducedMotion();

  const rings = [
    { sizeMultiplier: 1.6, borderWidth: 1.5 },
    { sizeMultiplier: 2.2, borderWidth: 1 },
    { sizeMultiplier: 3.0, borderWidth: 0.5 },
  ];

  if (prefersReducedMotion) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <div
          className="rounded-full"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle, ${color}, transparent)`,
            boxShadow: `0 0 30px ${color.replace("1)", "0.4)")}`,
          }}
        />
        {rings.map((ring, i) => (
          <div
            key={i}
            className="absolute rounded-full border"
            style={{
              width: size * ring.sizeMultiplier,
              height: size * ring.sizeMultiplier,
              borderWidth: ring.borderWidth,
              borderColor: color.replace("1)", `${0.3 - i * 0.1})`),
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Concentric rings */}
      {rings.map((ring, i) => {
        const ringVariants = orbRingVariants(i);
        return (
          <motion.div
            key={i}
            className="absolute rounded-full border"
            style={{
              width: size * ring.sizeMultiplier,
              height: size * ring.sizeMultiplier,
              borderWidth: ring.borderWidth,
              borderColor: color.replace("1)", `${0.3 - i * 0.08})`),
              willChange: "transform, opacity",
            }}
            variants={ringVariants}
            initial="hidden"
            animate={["visible", "animate"]}
            aria-hidden="true"
          />
        );
      })}

      {/* Core orb */}
      <motion.div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 35%, ${color}, ${color.replace("1)", "0.6)")}, transparent)`,
          willChange: "transform, box-shadow",
        }}
        variants={orbCoreVariants}
        initial="hidden"
        animate={["visible", "animate"]}
        aria-hidden="true"
      >
        {/* Pulse overlay */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color.replace("1)", "0.3)")}, transparent 70%)`,
            willChange: "transform, box-shadow",
          }}
          variants={orbPulseVariants}
          animate="animate"
        />
      </motion.div>
    </div>
  );
}
