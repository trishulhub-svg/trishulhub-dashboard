/**
 * ═══════════════════════════════════════════════════════════════════
 * ANIMATION VARIANTS LIBRARY — TrishulHub Landing Page
 * ═══════════════════════════════════════════════════════════════════
 *
 * Every variant is designed with:
 *  - GPU-composited transforms only (will-change: transform)
 *  - Spring physics tuned for premium feel (no linear easing)
 *  - Reduced-motion respect via prefers-reduced-motion
 *  - CSS fallback equivalents noted in comments
 *
 * Tech: framer-motion ^12.23.2, React 19, Next.js 16
 * ═══════════════════════════════════════════════════════════════════
 */

import type { Variants, Transition } from "framer-motion";

// ─────────────────────────────────────────────────────────
// 1. GLOBAL SPRING PRESETS
// ─────────────────────────────────────────────────────────
// These presets are referenced by all variants for consistency.

export const spring = {
  /** Snappy but smooth — used for most UI elements */
  snappy: {
    type: "spring" as const,
    stiffness: 400,
    damping: 25,
    mass: 0.8,
  },
  /** Heavy, dramatic entrance — used for hero title */
  heavy: {
    type: "spring" as const,
    stiffness: 200,
    damping: 20,
    mass: 1.2,
  },
  /** Soft, floaty — used for particles and background elements */
  floaty: {
    type: "spring" as const,
    stiffness: 120,
    damping: 14,
    mass: 0.6,
  },
  /** Gentle — used for secondary text and subtle reveals */
  gentle: {
    type: "spring" as const,
    stiffness: 250,
    damping: 30,
    mass: 0.8,
  },
  /** Bouncy — used for button interactions */
  bouncy: {
    type: "spring" as const,
    stiffness: 500,
    damping: 15,
    mass: 0.5,
  },
  /** Ultra slow — used for background blobs */
  organic: {
    type: "spring" as const,
    stiffness: 50,
    damping: 20,
    mass: 1.5,
  },
} satisfies Record<string, Transition>;

// ─────────────────────────────────────────────────────────
// 2. PAGE LOAD CHOREOGRAPHY MASTER SEQUENCE
// ─────────────────────────────────────────────────────────
/**
 * Page load sequence (total choreography time: ~2.4s):
 *
 *   t=0.0s  Background blobs begin (already animating via CSS/framer)
 *   t=0.0s  Particles fade in
 *   t=0.1s  Noise/vignette overlay
 *   t=0.2s  Top bar slides down
 *   t=0.35s  Dot grid fades in
 *   t=0.5s  Central orb pulses in
 *   t=0.6s  Title letters stagger in (150ms each)
 *   t=1.4s  Subtitle fades up
 *   t=1.55s Typewriter starts (55ms/char)
 *   t=2.1s  Feature pills stagger in
 *   t=2.3s  Buttons stagger in
 *   t=2.5s  Footer fades up
 */

export const pageLoadSequence = {
  /** Delay offset for each layer (in seconds) */
  delays: {
    background: 0,
    particles: 0,
    overlay: 0.1,
    topBar: 0.2,
    dotGrid: 0.35,
    orb: 0.5,
    title: 0.6,
    subtitle: 1.4,
    typewriter: 1.55,
    featurePills: 2.1,
    buttons: 2.3,
    footer: 2.5,
  },
} as const;

// ─────────────────────────────────────────────────────────
// 3. TITLE — Letter-by-letter spring animation
// ─────────────────────────────────────────────────────────
/**
 * Each letter animates from:
 *   opacity: 0, y: 40, rotateX: -90, filter: blur(4px)
 * To:
 *   opacity: 1, y: 0, rotateX: 0, filter: blur(0px)
 *
 * Spring: stiffness 200, damping 20, mass 1.2 (heavy/dramatic)
 * Stagger: 0.06s between letters (150ms for "TrishulHub" = ~0.9s total)
 *
 * CSS fallback: @keyframes letterIn {
 *   from { opacity:0; transform: translateY(40px) rotateX(-90deg); filter: blur(4px); }
 *   to   { opacity:1; transform: translateY(0) rotateX(0); filter: blur(0); }
 * }
 * .letter { animation: letterIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; }
 * .letter nth-child(1) { animation-delay: 0.06s; } // etc
 */

export const titleContainer: Variants = {
  hidden: { overflow: "hidden" },
  visible: {
    overflow: "hidden",
    transition: {
      staggerChildren: 0.06,
      delayChildren: pageLoadSequence.delays.title,
    },
  },
};

export const titleLetter: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
    rotateX: -90,
    filter: "blur(4px)",
    // CSS fallback: use inline style with animation-delay
  },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: {
      ...spring.heavy,
      // Filter transitions are not GPU-composited, so we blend:
      opacity: { duration: 0.3, ease: "easeOut" },
      filter: { duration: 0.5, ease: "easeOut" },
    },
  },
};

// ─────────────────────────────────────────────────────────
// 4. SUBTITLE — Fade up reveal
// ─────────────────────────────────────────────────────────
/**
 * From: opacity:0, y:20
 * To:   opacity:1, y:0
 * Transition: gentle spring
 *
 * CSS fallback: @keyframes fadeUp {
 *   from { opacity:0; transform: translateY(20px); }
 *   to   { opacity:1; transform: translateY(0); }
 * }
 */

export const subtitleVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...spring.gentle,
      delay: pageLoadSequence.delays.subtitle,
    },
  },
};

// ─────────────────────────────────────────────────────────
// 5. TYPEWRITER — Character-by-character with cursor
// ─────────────────────────────────────────────────────────
/**
 * "I am ready to cook." = 19 characters (including period, excluding cursor)
 * At 55ms/char = ~1.05s total typing duration
 * Starts after subtitle finishes (delay: 1.55s)
 *
 * Implementation: useSpring + AnimatedCursor component
 * NOT framer-motion variants — uses useMotionValue + useSpring
 * for the character-count-driven reveal.
 *
 * CSS fallback: @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
 * .cursor { animation: blink 1s step-end infinite; }
 */

// Typewriter doesn't use variants — it uses a custom hook.
// See hooks/useTypewriter.ts for the full implementation.
// The cursor component:

export const cursorVariants: Variants = {
  blink: {
    opacity: [1, 1, 0, 0],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "easeInOut",
      times: [0, 0.5, 0.5, 1],
    },
  },
};

// ─────────────────────────────────────────────────────────
// 6. BUTTON INTERACTIONS — Hover, tap, magnetic
// ─────────────────────────────────────────────────────────
/**
 * Hover: scale(1.04) + glow shadow intensification
 * Tap:   scale(0.97) + reduced glow
 * Magnetic: subtle pull toward cursor (±6px)
 *
 * CSS fallback: .btn { transition: transform 0.2s, box-shadow 0.2s; }
 *               .btn:hover { transform: scale(1.04); box-shadow: ...; }
 *               .btn:active { transform: scale(0.97); }
 */

export const buttonVariants: Variants = {
  idle: {
    scale: 1,
    boxShadow: "0 0 20px rgba(99,102,241,0.15), 0 0 0 1px rgba(99,102,241,0.1)",
  },
  hover: {
    scale: 1.04,
    boxShadow:
      "0 0 40px rgba(99,102,241,0.3), 0 0 80px rgba(99,102,241,0.1), 0 0 0 1px rgba(99,102,241,0.2)",
    transition: { ...spring.bouncy },
  },
  tap: {
    scale: 0.97,
    boxShadow: "0 0 10px rgba(99,102,241,0.1), 0 0 0 1px rgba(99,102,241,0.05)",
    transition: { type: "spring", stiffness: 600, damping: 20, mass: 0.4 },
  },
};

/** Staggered reveal for the buttons group */
export const buttonContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: pageLoadSequence.delays.buttons,
    },
  },
};

export const buttonRevealVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...spring.gentle },
  },
};

// ─────────────────────────────────────────────────────────
// 7. FEATURE PILLS — Staggered reveal with icon spin
// ─────────────────────────────────────────────────────────
/**
 * Each pill fades up + slides from below, icon rotates 360° on enter
 * Stagger: 0.1s between pills
 *
 * CSS fallback: @keyframes pillIn {
 *   from { opacity:0; transform: translateY(12px) scale(0.9); }
 *   to   { opacity:1; transform: translateY(0) scale(1); }
 * }
 */

export const pillsContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: pageLoadSequence.delays.featurePills,
    },
  },
};

export const pillVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      ...spring.gentle,
      // Icon inside rotates with slightly different timing
    },
  },
  hover: {
    scale: 1.05,
    y: -2,
    transition: { ...spring.bouncy },
  },
};

export const pillIconVariants: Variants = {
  hidden: { rotate: -90, scale: 0.5 },
  visible: {
    rotate: 0,
    scale: 1,
    transition: { ...spring.snappy, delay: 0.1 },
  },
};

// ─────────────────────────────────────────────────────────
// 8. STAGGERED CHILDREN — Generic reveal pattern
// ─────────────────────────────────────────────────────────
/**
 * Reusable for any list that needs staggered reveal.
 * Default: fade up with 0.08s stagger
 *
 * Performance: uses transform + opacity only (compositor-friendly)
 */

export const staggerContainer = (
  stagger: number = 0.08,
  delay: number = 0
): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring.gentle },
  },
};

// ─────────────────────────────────────────────────────────
// 9. TOP BAR — Slide down from top
// ─────────────────────────────────────────────────────────
/**
 * From: y:-100%, opacity:0
 * To:   y:0, opacity:1
 * Spring: gentle
 *
 * CSS fallback: @keyframes slideDown {
 *   from { transform: translateY(-100%); opacity:0; }
 *   to   { transform: translateY(0); opacity:1; }
 * }
 */

export const topBarVariants: Variants = {
  hidden: { y: -60, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      ...spring.gentle,
      delay: pageLoadSequence.delays.topBar,
    },
  },
};

// ─────────────────────────────────────────────────────────
// 10. FOOTER — Fade up
// ─────────────────────────────────────────────────────────

export const footerVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...spring.gentle,
      delay: pageLoadSequence.delays.footer,
    },
  },
};

// ─────────────────────────────────────────────────────────
// 11. BACKGROUND BLOBS — Slow organic movement
// ─────────────────────────────────────────────────────────
/**
 * 4 blobs with independent keyframe animations.
 * Each blob uses a unique path defined by multiple bezier points.
 * Duration: 20-30s per cycle (slow, organic)
 *
 * Performance: transform only (translate + scale), GPU-composited
 * will-change: transform (set via style prop, cleaned up on unmount)
 *
 * CSS fallback: @keyframes blob1 {
 *   0%, 100% { transform: translate(0,0) scale(1); }
 *   25% { transform: translate(30px,-50px) scale(1.1); }
 *   50% { transform: translate(-20px,20px) scale(0.95); }
 *   75% { transform: translate(15px,35px) scale(1.05); }
 * }
 * .blob { animation: blob1 25s ease-in-out infinite; }
 */

export const blobVariants: Variants[] = [
  // Blob 1 — large, slow drift (20s cycle)
  {
    animate: {
      x: [0, 30, -20, 15, 0],
      y: [0, -50, 20, 35, 0],
      scale: [1, 1.1, 0.95, 1.05, 1],
      transition: {
        duration: 20,
        repeat: Infinity,
        ease: "easeInOut",
        ...spring.organic,
      },
    },
  },
  // Blob 2 — medium, offset timing (25s cycle)
  {
    animate: {
      x: [0, -40, 25, -15, 0],
      y: [0, 30, -40, -20, 0],
      scale: [1, 0.9, 1.08, 0.97, 1],
      transition: {
        duration: 25,
        repeat: Infinity,
        ease: "easeInOut",
        ...spring.organic,
      },
    },
  },
  // Blob 3 — medium, different pattern (22s cycle)
  {
    animate: {
      x: [0, 20, -35, 10, 0],
      y: [0, -25, 15, -30, 0],
      scale: [1, 1.05, 0.92, 1.08, 1],
      transition: {
        duration: 22,
        repeat: Infinity,
        ease: "easeInOut",
        ...spring.organic,
      },
    },
  },
  // Blob 4 — small, faster movement (18s cycle)
  {
    animate: {
      x: [0, -25, 15, -30, 0],
      y: [0, 35, -15, 25, 0],
      scale: [1, 1.12, 0.88, 1.06, 1],
      transition: {
        duration: 18,
        repeat: Infinity,
        ease: "easeInOut",
        ...spring.organic,
      },
    },
  },
];

// ─────────────────────────────────────────────────────────
// 12. PARTICLE SYSTEM — Floating, drifting particles
// ─────────────────────────────────────────────────────────
/**
 * 30 particles with randomized:
 *   - initial position (distributed across viewport)
 *   - drift speed (15-40s per cycle)
 *   - size (2-6px)
 *   - opacity (0.1-0.5)
 *
 * Each particle follows a unique keyframe path.
 * Uses transform only for GPU compositing.
 *
 * Performance: 30 animated elements — acceptable.
 * Consider reducing to 15 on mobile via useReducedMotion.
 *
 * CSS fallback: @keyframes particle {
 *   0%, 100% { transform: translate(0, 0); opacity: var(--p-opacity); }
 *   25% { transform: translate(var(--dx1), var(--dy1)); }
 *   50% { transform: translate(var(--dx2), var(--dy2)); }
 *   75% { transform: translate(var(--dx3), var(--dy3)); }
 * }
 */

export function createParticleVariants(seed: number): Variants {
  // Deterministic pseudo-random based on seed
  const rand = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    return x - Math.floor(x);
  };

  const duration = 15 + rand(0) * 25; // 15-40s
  const x1 = (rand(1) - 0.5) * 200;
  const y1 = (rand(2) - 0.5) * 200;
  const x2 = (rand(3) - 0.5) * 300;
  const y2 = (rand(4) - 0.5) * 300;
  const x3 = (rand(5) - 0.5) * 150;
  const y3 = (rand(6) - 0.5) * 150;

  return {
    initial: {
      opacity: 0,
    },
    animate: {
      x: [0, x1, x2, x3, 0],
      y: [0, y1, y2, y3, 0],
      opacity: [0, 0.3 + rand(7) * 0.2, 0.2 + rand(8) * 0.15, 0.35 + rand(9) * 0.15, 0],
      transition: {
        duration,
        repeat: Infinity,
        ease: "linear",
        delay: rand(10) * 5, // stagger start times
      },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.5 },
    },
  };
}

// ─────────────────────────────────────────────────────────
// 13. CENTRAL ORB — Pulse / glow animation
// ─────────────────────────────────────────────────────────
/**
 * Central orb with 3 concentric rings.
 * Ring 1 (inner): pulsing scale 0.8→1.1→0.8, opacity oscillation
 * Ring 2 (middle): counter-rotate + scale pulse
 * Ring 3 (outer): slow rotation + very subtle scale
 *
 * Core orb: constant glow pulse (box-shadow animation)
 *
 * CSS fallback: @keyframes pulse {
 *   0%, 100% { transform: scale(1); box-shadow: 0 0 30px rgba(99,102,241,0.4); }
 *   50% { transform: scale(1.1); box-shadow: 0 0 60px rgba(99,102,241,0.6); }
 * }
 */

export const orbCoreVariants: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      ...spring.heavy,
      delay: pageLoadSequence.delays.orb,
    },
  },
};

export const orbPulseVariants: Variants = {
  animate: {
    scale: [1, 1.08, 1],
    boxShadow: [
      "0 0 30px rgba(99,102,241,0.4), 0 0 60px rgba(99,102,241,0.15)",
      "0 0 50px rgba(99,102,241,0.6), 0 0 100px rgba(99,102,241,0.25)",
      "0 0 30px rgba(99,102,241,0.4), 0 0 60px rgba(99,102,241,0.15)",
    ],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

export const orbRingVariants = (index: number): Variants => {
  const configs = [
    // Ring 0 (innermost): fast pulse
    { scaleRange: [0.8, 1.15, 0.8] as const, duration: 3, opacityRange: [0.6, 0.3, 0.6] as const },
    // Ring 1 (middle): medium, opposite phase
    { scaleRange: [1.1, 0.85, 1.1] as const, duration: 4, opacityRange: [0.4, 0.6, 0.4] as const },
    // Ring 2 (outer): slow, subtle
    { scaleRange: [0.95, 1.05, 0.95] as const, duration: 5, opacityRange: [0.25, 0.4, 0.25] as const },
  ];
  const cfg = configs[index] ?? configs[0];

  return {
    hidden: { opacity: 0, scale: 0.5 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        ...spring.floaty,
        delay: pageLoadSequence.delays.orb + 0.15 * (index + 1),
      },
    },
    animate: {
      scale: [...cfg.scaleRange],
      opacity: [...cfg.opacityRange],
      transition: {
        duration: cfg.duration,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };
};

// ─────────────────────────────────────────────────────────
// 14. DOT GRID OVERLAY
// ─────────────────────────────────────────────────────────

export const dotGridVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 1.5,
      delay: pageLoadSequence.delays.dotGrid,
      ease: "easeOut",
    },
  },
};

// ─────────────────────────────────────────────────────────
// 15. NOISE + VIGNETTE OVERLAY
// ─────────────────────────────────────────────────────────

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 1,
      delay: pageLoadSequence.delays.overlay,
      ease: "easeOut",
    },
  },
};

// ─────────────────────────────────────────────────────────
// 16. CARD HOVER WITH 3D TILT
// ─────────────────────────────────────────────────────────
/**
 * Perspective: 1000px on parent
 * rotateX/Y: ±12° based on mouse position
 * glare: gradient overlay that follows cursor
 *
 * Implementation: useMotionValue + useTransform + onPointerMove
 * See components/TiltCard.tsx for full component.
 *
 * CSS fallback: .card {
 *   transition: transform 0.2s ease;
 *   transform-style: preserve-3d;
 * }
 * .card:hover { transform: perspective(1000px) rotateX(var(--rx)) rotateY(var(--ry)); }
 */

export const tiltCardVariants: Variants = {
  idle: {
    rotateX: 0,
    rotateY: 0,
    scale: 1,
  },
  hover: {
    scale: 1.02,
    transition: { type: "spring", stiffness: 400, damping: 25 },
  },
};

// ─────────────────────────────────────────────────────────
// 17. VIEWPORT ENTER — useInView based reveal
// ─────────────────────────────────────────────────────────
/**
 * For elements that animate when scrolling into view.
 * Uses whileInView prop with once: true.
 *
 * CSS fallback: @keyframes fadeInUp {
 *   from { opacity: 0; transform: translateY(30px); }
 *   to { opacity: 1; transform: translateY(0); }
 * }
 * .in-view { animation: fadeInUp 0.6s ease forwards; }
 */

export const inViewVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 30,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...spring.gentle,
      // Framer-motion handles trigger via whileInView
    },
  },
};

/** Scale-in variant for viewport enter (for icons/avatars) */
export const inViewScaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { ...spring.snappy },
  },
};

// ─────────────────────────────────────────────────────────
// 18. SCROLL PARALLAX
// ─────────────────────────────────────────────────────────
/**
 * Parallax effect: background moves at 0.5x scroll speed.
 * Implemented with useScroll + useTransform.
 * Not a variant — requires hook composition.
 *
 * CSS fallback: @keyframes none (requires JS scroll listener)
 */

// ─────────────────────────────────────────────────────────
// 19. THEME TRANSITION
// ─────────────────────────────────────────────────────────
/**
 * Smooth theme transition: background color, text color, and
 * all accent colors morph over 500ms.
 *
 * CSS fallback: * { transition: background-color 0.5s, color 0.5s, border-color 0.5s; }
 */

export const themeTransition = {
  duration: 0.5,
  ease: [0.4, 0, 0.2, 1] as const, // cubic-bezier(0.4, 0, 0.2, 1)
};

// ─────────────────────────────────────────────────────────
// 20. COMPLETE PAGE MASTER VARIANTS
// ─────────────────────────────────────────────────────────
/**
 * Wraps the entire page content for orchestration.
 * All children inherit timing from this container.
 */

export const pageMaster: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};
