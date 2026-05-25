"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * AnimatedBackground — Mesh gradient blobs + dot grid + noise + vignette
 * ═══════════════════════════════════════════════════════════════
 *
 * Layers (bottom to top):
 *   1. Mesh gradient (4 blobs with independent organic movement)
 *   2. Dot grid overlay
 *   3. Noise texture (SVG filter)
 *   4. Vignette (radial gradient)
 *
 * Blob animations:
 *   - 4 blobs with 18-25s cycle durations
 *   - Each follows a unique 4-point keyframe path
 *   - Spring: stiffness=50, damping=20, mass=1.5 (organic)
 *   - Transform only: translate + scale (GPU composited)
 *
 * Performance:
 *   - Blobs: 4 × transform (compositor) — minimal
 *   - Noise: static SVG filter — applied once, composited
 *   - Dot grid: static CSS background-image — zero cost
 *   - Vignette: static radial gradient — zero cost
 *   - will-change: transform (on blobs only)
 *
 * CSS fallback:
 *   @keyframes blob1 {
 *     0%, 100% { transform: translate(0,0) scale(1); }
 *     25% { transform: translate(30px,-50px) scale(1.1); }
 *     50% { transform: translate(-20px,20px) scale(0.95); }
 *     75% { transform: translate(15px,35px) scale(1.05); }
 *   }
 *   .blob { animation: blob1 20s ease-in-out infinite; will-change: transform; }
 *   .noise { background-image: url("data:image/svg+xml,..."); }
 *   .dot-grid {
 *     background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
 *     background-size: 24px 24px;
 *   }
 *   .vignette { background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%); }
 */

import React from "react";
import { motion } from "framer-motion";
import { blobVariants, dotGridVariants, overlayVariants } from "../lib/variants";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface AnimatedBackgroundProps {
  className?: string;
}

/** Blob colors — 4 distinct mesh gradient stops */
const BLOB_CONFIGS = [
  { color: "rgba(99,102,241,0.35)", size: 600, blur: 80, position: "20% 30%" },
  { color: "rgba(139,92,246,0.3)", size: 500, blur: 70, position: "70% 20%" },
  { color: "rgba(59,130,246,0.25)", size: 550, blur: 75, position: "40% 70%" },
  { color: "rgba(168,85,247,0.2)", size: 450, blur: 60, position: "80% 60%" },
];

export function AnimatedBackground({ className = "" }: AnimatedBackgroundProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* 1. Mesh gradient blobs */}
      {BLOB_CONFIGS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: blob.position.split(" ")[0],
            top: blob.position.split(" ")[1],
            width: blob.size,
            height: blob.size,
            background: blob.color,
            filter: `blur(${blob.blur}px)`,
            transform: "translate(-50%, -50%)",
            willChange: "transform",
          }}
          variants={prefersReducedMotion ? undefined : blobVariants[i]}
          animate={prefersReducedMotion ? undefined : "animate"}
          initial={prefersReducedMotion ? undefined : false}
        />
      ))}

      {/* 2. Dot grid overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        variants={dotGridVariants}
        initial="hidden"
        animate="visible"
      />

      {/* 3. Noise texture overlay (SVG feTurbulence) */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
      />

      {/* 4. Vignette */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)",
        }}
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
      />
    </div>
  );
}
