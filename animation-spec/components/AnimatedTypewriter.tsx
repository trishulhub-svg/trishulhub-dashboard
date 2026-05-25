"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * AnimatedTypewriter — Typewriter effect with blinking cursor
 * ═══════════════════════════════════════════════════════════════
 *
 * Text "I am ready to cook." reveals at 55ms per character.
 * Cursor blinks via framer-motion spring opacity toggle.
 *
 * When typing completes, cursor switches to slow blink (600ms).
 * During typing, cursor blinks faster (530ms).
 *
 * Performance:
 *   - Text reveal via React state (one re-render per character = ~19 renders)
 *   - Cursor opacity via useMotionValue (zero re-renders)
 *   - Total: ~19 re-renders over 1.05s — negligible
 *
 * CSS fallback:
 *   .typewriter-cursor { animation: blink 1s step-end infinite; }
 *   @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
 */

import React from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useTypewriter } from "../hooks/useTypewriter";
import { pageLoadSequence } from "../lib/variants";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface AnimatedTypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  cursorClassName?: string;
  onComplete?: () => void;
}

export function AnimatedTypewriter({
  text,
  speed = 55,
  delay,
  className = "",
  cursorClassName = "",
  onComplete,
}: AnimatedTypewriterProps) {
  const prefersReducedMotion = useReducedMotion();
  const startDelay = (delay ?? pageLoadSequence.delays.typewriter) * 1000;

  const { displayedText, isComplete, isStarted } = useTypewriter(text, {
    speed: prefersReducedMotion ? 0 : speed,
    startDelay: prefersReducedMotion ? 0 : startDelay,
    onComplete,
  });

  // Cursor blink — spring-based for smoothness
  const cursorOpacity = useMotionValue(1);
  const springCursorOpacity = useSpring(cursorOpacity, {
    stiffness: 500,
    damping: 30,
  });

  // Blink interval: fast while typing, slow when done
  React.useEffect(() => {
    if (!isStarted) return;
    const blinkSpeed = isComplete ? 600 : 530;

    const interval = setInterval(() => {
      cursorOpacity.set(cursorOpacity.get() === 1 ? 0 : 1);
    }, blinkSpeed);

    return () => clearInterval(interval);
  }, [isComplete, isStarted, cursorOpacity]);

  // Reduced motion: show everything instantly
  if (prefersReducedMotion) {
    return (
      <p className={className} aria-label={text}>
        {text}
        <span className={cursorClassName} aria-hidden="true" style={{ opacity: 0.7 }}>
          |
        </span>
      </p>
    );
  }

  return (
    <p className={className} aria-label={text}>
      <span aria-hidden="false">{displayedText}</span>
      <motion.span
        className={cursorClassName}
        style={{ opacity: springCursorOpacity }}
        aria-hidden="true"
      >
        |
      </motion.span>
    </p>
  );
}
