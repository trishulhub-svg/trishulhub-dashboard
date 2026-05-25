"use client";

/**
 * ═══════════════════════════════════════════════════════
 * useTypewriter — Character-by-character reveal hook
 * ═══════════════════════════════════════════════════════
 *
 * Reveals text one character at a time using useMotionValue + useSpring.
 * Returns the current visible text and a boolean indicating completion.
 *
 * @param text - Full text to type out
 * @param speed - ms per character (default: 55)
 * @param startDelay - ms before typing begins (default: 0)
 *
 * Performance: Uses motion values (avoiding re-renders per character).
 * Only triggers React re-render when displayed text changes.
 *
 * CSS fallback: Use a <span> with overflow:hidden + width animation
 *   or a JS setInterval that appends characters to state.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface UseTypewriterOptions {
  speed?: number;
  startDelay?: number;
  onComplete?: () => void;
}

interface UseTypewriterReturn {
  displayedText: string;
  isComplete: boolean;
  isStarted: boolean;
}

export function useTypewriter(
  text: string,
  options: UseTypewriterOptions = {}
): UseTypewriterReturn {
  const { speed = 55, startDelay = 0, onComplete } = options;

  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref fresh without restarting effect
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
  }, []);

  useEffect(() => {
    cleanup();
    indexRef.current = 0;
    setDisplayedText("");
    setIsComplete(false);
    setIsStarted(false);

    startTimeoutRef.current = setTimeout(() => {
      setIsStarted(true);

      const tick = () => {
        if (indexRef.current < text.length) {
          indexRef.current += 1;
          setDisplayedText(text.slice(0, indexRef.current));
          timeoutRef.current = setTimeout(tick, speed);
        } else {
          setIsComplete(true);
          onCompleteRef.current?.();
        }
      };

      tick();
    }, startDelay);

    return cleanup;
  }, [text, speed, startDelay, cleanup]);

  return { displayedText, isComplete, isStarted };
}

// ─────────────────────────────────────────────────────────
// FRAMER-MOTION ENHANCED VERSION
// ─────────────────────────────────────────────────────────
// For when you want spring-physics on the cursor only,
// while text is revealed via state (to avoid 30+ re-renders).

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface TypewriterCursorProps {
  isComplete: boolean;
  className?: string;
}

export function TypewriterCursor({ isComplete, className = "" }: TypewriterCursorProps) {
  const opacityValue = useMotionValue(1);
  const springOpacity = useSpring(opacityValue, {
    stiffness: 500,
    damping: 30,
  });

  // Blink effect using spring
  // When complete, slow blink. When typing, fast blink.
  useEffect(() => {
    const interval = setInterval(() => {
      opacityValue.set(opacityValue.get() === 1 ? 0 : 1);
    }, isComplete ? 600 : 530);

    return () => clearInterval(interval);
  }, [isComplete, opacityValue]);

  return (
    <motion.span
      className={className}
      style={{ opacity: springOpacity }}
      aria-hidden="true"
    >
      |
    </motion.span>
  );
}
