"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * AnimatedTitle — Letter-by-letter spring reveal
 * ═══════════════════════════════════════════════════════════════
 *
 * Each letter is a separate motion.span with staggerChildren timing.
 * The container uses overflow:hidden to clip letters during animation.
 *
 * Spring config: stiffness=200, damping=20, mass=1.2
 * Stagger: 0.06s per letter
 * Blur filter animates from 4px → 0px during entrance
 *
 * Performance:
 *   - Each letter gets will-change: transform (GPU composited)
 *   - Filter animation is NOT GPU-composited, but blur is lightweight
 *     for small text elements
 *   - 10 letters × 2 properties (transform + filter) = well within budget
 *
 * CSS fallback: see variants.ts titleLetter comments
 */

import React from "react";
import { motion, type Variants } from "framer-motion";
import {
  titleContainer,
  titleLetter,
  pageLoadSequence,
} from "../lib/variants";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface AnimatedTitleProps {
  text: string;
  className?: string;
  letterClassName?: string;
  as?: "h1" | "h2" | "h3" | "span";
  /** Override the default delay */
  delay?: number;
}

export function AnimatedTitle({
  text,
  className = "",
  letterClassName = "",
  as: Tag = "h1",
  delay,
}: AnimatedTitleProps) {
  const prefersReducedMotion = useReducedMotion();

  // Reduced motion: show all text immediately
  if (prefersReducedMotion) {
    return (
      <Tag className={className} style={{ perspective: "800px" }}>
        {text}
      </Tag>
    );
  }

  const containerVariants: Variants = {
    hidden: { overflow: "hidden" },
    visible: {
      overflow: "hidden",
      transition: {
        staggerChildren: 0.06,
        delayChildren: delay ?? pageLoadSequence.delays.title,
      },
    },
  };

  const MotionTag = motion.create(Tag);

  return (
    <MotionTag
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ perspective: "800px", perspectiveOrigin: "center bottom" }}
    >
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          className={letterClassName}
          variants={titleLetter}
          style={{
            display: "inline-block",
            willChange: "transform, opacity, filter",
            // Give the browser a hint about upcoming transforms
            transformOrigin: "center bottom",
          }}
          aria-hidden={false}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </MotionTag>
  );
}
