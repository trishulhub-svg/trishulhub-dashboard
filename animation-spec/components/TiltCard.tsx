"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * TiltCard — 3D perspective tilt on hover
 * ═══════════════════════════════════════════════════════════════
 *
 * Tracks pointer position within the card, maps to rotateX/Y (±12°).
 * Adds a glare gradient overlay that follows the cursor.
 *
 * Physics:
 *   - Max rotation: 12° on each axis
 *   - Spring: stiffness=400, damping=25, mass=0.5
 *   - Perspective: 1000px on container
 *
 * Performance:
 *   - All transforms via useMotionValue (zero re-renders)
 *   - Glare via CSS gradient on motion.div (compositor-friendly)
 *   - will-change: transform
 *
 * CSS fallback:
 *   .card { transform-style: preserve-3d; perspective: 1000px; }
 *   .card:hover { transform: rotateX(var(--rx)) rotateY(var(--ry)); }
 *   (requires JS pointermove handler to set CSS vars)
 */

import React, { useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** Max rotation in degrees (default: 12) */
  maxRotation?: number;
  /** Spring stiffness (default: 400) */
  stiffness?: number;
  /** Spring damping (default: 25) */
  damping?: number;
  /** Glare intensity 0-1 (default: 0.15) */
  glareIntensity?: number;
  /** Enable glare effect (default: true) */
  glare?: boolean;
}

export function TiltCard({
  children,
  className = "",
  maxRotation = 12,
  stiffness = 400,
  damping = 25,
  glareIntensity = 0.15,
  glare = true,
}: TiltCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Raw motion values from pointer
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const pointerX = useMotionValue(0.5); // Normalized 0-1
  const pointerY = useMotionValue(0.5);

  // Spring-smoothed values
  const rotateX = useSpring(rawRotateX, { stiffness, damping, mass: 0.5 });
  const rotateY = useSpring(rawRotateY, { stiffness, damping, mass: 0.5 });

  // Glare gradient follows cursor
  const glareBackground = useTransform(
    [pointerX, pointerY],
    ([x, y]) =>
      `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,${glareIntensity}), transparent 60%)`
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Normalize to -1...1, multiply by max rotation
      const normalizedX = (x - centerX) / centerX;
      const normalizedY = (y - centerY) / centerY;

      rawRotateY.set(normalizedX * maxRotation);
      rawRotateX.set(-normalizedY * maxRotation);

      // Pointer position for glare (normalized 0-1)
      pointerX.set(x / rect.width);
      pointerY.set(y / rect.height);
    },
    [prefersReducedMotion, maxRotation, rawRotateX, rawRotateY, pointerX, pointerY]
  );

  const handlePointerLeave = useCallback(() => {
    rawRotateX.set(0);
    rawRotateY.set(0);
    pointerX.set(0.5);
    pointerY.set(0.5);
  }, [rawRotateX, rawRotateY, pointerX, pointerY]);

  if (prefersReducedMotion) {
    return (
      <div className={className} style={{ perspective: "1000px" }}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      style={{
        perspective: "1000px",
        transformStyle: "preserve-3d",
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {children}

        {/* Glare overlay */}
        {glare && (
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none z-10"
            style={{
              background: glareBackground,
              mixBlendMode: "overlay",
            }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
