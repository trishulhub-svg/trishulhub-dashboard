"use client";

/**
 * ═══════════════════════════════════════════════════════
 * useParallax — Scroll-driven parallax offset
 * ═══════════════════════════════════════════════════════
 *
 * Maps scroll progress to a Y transform offset.
 * Elements move at a fraction of scroll speed.
 *
 * @param offset - Multiplier for parallax strength (default: 0.5)
 *   positive = moves slower (background effect)
 *   negative = moves faster (foreground effect)
 *
 * Performance: Uses useScroll + useTransform (subscription-based,
 * no scroll event listeners). Runs on compositor thread.
 *
 * CSS fallback: transform: translateY(calc(var(--scroll-y) * 0.5px));
 *   (requires JS to set --scroll-y on each frame)
 */

import { useScroll, useTransform, useSpring } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { useRef } from "react";

interface UseParallaxOptions {
  offset?: number;
  inputRange?: number[];
}

interface UseParallaxReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  y: MotionValue<number>;
  scrollProgress: MotionValue<number>;
}

export function useParallax(
  options: UseParallaxOptions = {}
): UseParallaxReturn {
  const { offset = 0.5, inputRange = [0, 1] } = options;
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rawY = useTransform(scrollYProgress, inputRange, [
    inputRange[0] * 100 * offset,
    inputRange[1] * 100 * offset,
  ]);

  // Smooth the output with spring for organic feel
  const y = useSpring(rawY, {
    stiffness: 100,
    damping: 30,
    mass: 0.5,
  });

  return { ref, y, scrollYProgress };
}
