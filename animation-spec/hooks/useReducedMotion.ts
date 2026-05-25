"use client";

/**
 * ═══════════════════════════════════════════════════════
 * useReducedMotion — Respects user accessibility prefs
 * ═══════════════════════════════════════════════════════
 *
 * Returns true if the user prefers reduced motion.
 * When true, all animations should be disabled or simplified.
 *
 * In framer-motion: pass `reducedMotion="user"` to <MotionConfig>
 * or check this hook to conditionally skip heavy animations.
 */

import { useState, useEffect } from "react";

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}
