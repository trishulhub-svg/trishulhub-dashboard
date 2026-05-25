"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * AnimatedButton — Hover glow + magnetic pull + orbit ring
 * ═══════════════════════════════════════════════════════════════
 *
 * Primary CTA with:
 *   1. Spring-based hover scale (1.04) + glow shadow
 *   2. Tap compression (scale 0.97)
 *   3. Magnetic pull toward cursor (±6px)
 *   4. Optional orbiting ring animation
 *
 * Spring: stiffness=500, damping=15, mass=0.5 (bouncy)
 * Magnetic: strength=6, radius=150, spring stiffness=200
 *
 * Performance:
 *   - Glow uses box-shadow (not GPU-composited, but lightweight)
 *   - Scale/translate use transform (GPU composited)
 *   - Orbit uses CSS animation (compositor-optimized)
 *   - will-change: transform, box-shadow
 *
 * CSS fallback:
 *   .btn { transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s; }
 *   .btn:hover { transform: scale(1.04); box-shadow: 0 0 40px rgba(99,102,241,0.3); }
 *   .btn:active { transform: scale(0.97); }
 *   .orbit { animation: orbit 3s linear infinite; }
 *   @keyframes orbit { from { transform: rotate(0deg) translateX(80px) rotate(0deg); } to { transform: rotate(360deg) translateX(80px) rotate(-360deg); } }
 */

import React, { useRef, useCallback } from "react";
import { motion, useMotionValue, useSpring, type HTMLMotionProps } from "framer-motion";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface AnimatedButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  children: React.ReactNode;
  /** Enable magnetic cursor-pull effect */
  magnetic?: boolean;
  /** Magnetic pull strength in px (default: 6) */
  magneticStrength?: number;
  /** Show orbiting ring around button */
  orbit?: boolean;
  /** Primary or secondary style */
  variant?: "primary" | "secondary";
}

export function AnimatedButton({
  children,
  magnetic = true,
  magneticStrength = 6,
  orbit = false,
  variant = "primary",
  className = "",
  ...motionProps
}: AnimatedButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Magnetic effect motion values
  const magneticX = useMotionValue(0);
  const magneticY = useMotionValue(0);
  const springX = useSpring(magneticX, { stiffness: 200, damping: 20, mass: 0.5 });
  const springY = useSpring(magneticY, { stiffness: 200, damping: 20, mass: 0.5 });

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!magnetic || prefersReducedMotion) return;

      const el = buttonRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = 150;

      if (dist < radius) {
        const factor = 1 - dist / radius;
        magneticX.set((dx / dist) * magneticStrength * factor);
        magneticY.set((dy / dist) * magneticStrength * factor);
      }
    },
    [magnetic, magneticStrength, prefersReducedMotion, magneticX, magneticY]
  );

  const handlePointerLeave = useCallback(() => {
    magneticX.set(0);
    magneticY.set(0);
  }, [magneticX, magneticY]);

  const isPrimary = variant === "primary";

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Orbiting ring */}
      {orbit && !prefersReducedMotion && (
        <span
          className="absolute inset-[-12px] rounded-full border border-indigo-400/30 animate-[orbit_3s_linear_infinite]"
          style={{
            // CSS animation for orbit — compositor-optimized
            willChange: "transform",
          }}
          aria-hidden="true"
        />
      )}

      <motion.button
        ref={buttonRef}
        className={`
          relative px-8 py-3 rounded-xl font-semibold text-sm tracking-wide
          transition-colors duration-300
          ${isPrimary
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "bg-white/10 text-white/80 hover:bg-white/20 border border-white/10"
          }
          ${className}
        `}
        style={{
          x: magnetic && !prefersReducedMotion ? springX : 0,
          y: magnetic && !prefersReducedMotion ? springY : 0,
          willChange: "transform, box-shadow",
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{
          scale: 1.04,
          boxShadow: isPrimary
            ? "0 0 40px rgba(99,102,241,0.3), 0 0 80px rgba(99,102,241,0.1), 0 0 0 1px rgba(99,102,241,0.2)"
            : "0 0 30px rgba(255,255,255,0.1), 0 0 0 1px rgba(255,255,255,0.15)",
          transition: { type: "spring", stiffness: 500, damping: 15, mass: 0.5 },
        }}
        whileTap={{
          scale: 0.97,
          boxShadow: isPrimary
            ? "0 0 10px rgba(99,102,241,0.1)"
            : "0 0 5px rgba(255,255,255,0.05)",
          transition: { type: "spring", stiffness: 600, damping: 20, mass: 0.4 },
        }}
        {...motionProps}
      >
        {children}
      </motion.button>
    </div>
  );
}
