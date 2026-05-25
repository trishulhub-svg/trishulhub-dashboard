"use client";

/**
 * ═══════════════════════════════════════════════════════
 * useMagneticEffect — Pulls element toward cursor
 * ═══════════════════════════════════════════════════════
 *
 * Creates a magnetic pull effect where the element subtly
 * moves toward the cursor when hovering.
 *
 * Uses useMotionValue + useSpring for 60fps performance.
 * Zero React re-renders during interaction.
 *
 * @param strength - Max pull distance in pixels (default: 6)
 * @param radius - Activation radius in pixels (default: 150)
 *
 * CSS fallback: No CSS-only equivalent. Requires JS mouse tracking.
 *   Use mousemove event → update CSS custom properties → transform.
 */

import { useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  type MotionValue,
} from "framer-motion";

interface MagneticEffectOptions {
  strength?: number;
  radius?: number;
  springConfig?: { stiffness: number; damping: number; mass: number };
}

interface MagneticEffectReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  x: MotionValue<number>;
  y: MotionValue<number>;
}

export function useMagneticEffect(
  options: MagneticEffectOptions = {}
): MagneticEffectReturn {
  const {
    strength = 6,
    radius = 150,
    springConfig = { stiffness: 200, damping: 20, mass: 0.5 },
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        // Normalize to 0-1 range within radius, apply strength
        const factor = 1 - dist / radius;
        x.set((dx / dist) * strength * factor);
        y.set((dy / dist) * strength * factor);
      }
    },
    [x, y, strength, radius]
  );

  const handlePointerLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  // Return wrapped ref and spring values
  return {
    ref,
    x: springX as unknown as MotionValue<number>,
    y: springY as unknown as MotionValue<number>,
  };
}

/**
 * Wrapper component that applies magnetic effect to its children.
 *
 * Usage:
 *   <MagneticButton strength={8}>
 *     <button>START</button>
 *   </MagneticButton>
 */
interface MagneticWrapperProps {
  children: React.ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
}

export function MagneticWrapper({
  children,
  strength = 6,
  radius = 150,
  className = "",
}: MagneticWrapperProps) {
  const { ref, x, y } = useMagneticEffect({ strength, radius });
  const localRef = useRef<HTMLDivElement>(null);

  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      localRef.current = node;
    },
    [ref]
  );

  return (
    <motion.div
      ref={handleRef}
      className={className}
      style={{
        x,
        y,
        willChange: "transform",
      }}
      onPointerMove={
        ((e: React.PointerEvent) => {
          const el = localRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const dx = e.clientX - centerX;
          const dy = e.clientY - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius) {
            const factor = 1 - dist / radius;
            x.set((dx / dist) * strength * factor);
            y.set((dy / dist) * strength * factor);
          }
        }) as unknown as React.PointerEventHandler<HTMLDivElement>
      }
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
