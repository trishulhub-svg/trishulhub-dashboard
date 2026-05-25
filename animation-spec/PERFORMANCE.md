/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE GUIDE & ARCHITECTURE NOTES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This document covers GPU compositing strategy, layer management,
 * and performance budgeting for the TrishulHub landing page animations.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────
// GPU COMPOSITING RULES
// ─────────────────────────────────────────────────────────
//
// ✅ COMPOSITOR-FRIENDLY (runs on GPU, no layout/paint):
//    transform: translate(), scale(), rotate(), rotateX/Y/Z()
//    opacity
//    filter: blur() — lightweight for small elements
//
// ⚠️ PARTIALLY COMPOSITED:
//    box-shadow — triggers paint, but usually acceptable for
//    small elements (buttons, orb). NOT for large areas.
//
// ❌ AVOID ANIMATING (triggers layout → paint → composite):
//    width, height, top, left, right, bottom
//    margin, padding, border-width
//    font-size, line-height
//    color (expensive for many elements)
//    background-color (triggers paint)
//
// For color transitions: use Tailwind's transition utilities
// or framer-motion's animate with the theme transition preset.

// ─────────────────────────────────────────────────────────
// LAYER BUDGET
// ─────────────────────────────────────────────────────────
//
// Each will-change: transform creates a GPU layer.
// Excessive layers (>50-100) cause memory pressure.
//
// LANDING PAGE LAYER COUNT:
//
//   Background blobs:     4 layers   (transform + filter)
//   Particles:           30 layers   (transform + opacity)
//   Orb core:             1 layer    (transform + box-shadow)
//   Orb rings:            3 layers   (transform + opacity)
//   Orb pulse overlay:    1 layer    (transform + box-shadow)
//   Title letters:       10 layers   (transform + opacity + filter)
//   Buttons (×2):        2 layers    (transform + box-shadow)
//   Feature pills (×3):   3 layers    (transform + opacity)
//   Top bar:              1 layer    (transform + opacity)
//   Subtitle:             1 layer    (transform + opacity)
//   Typewriter cursor:    1 layer    (opacity)
//   Footer:               1 layer    (transform + opacity)
//   ─────────────────────────────────
//   TOTAL:              ~58 layers
//
//   This is within acceptable range (< 100).
//   On mobile, particles reduce to 15, bringing total to ~43.
//
//   OPTIMIZATION: If layer count becomes an issue:
//   1. Remove will-change from elements that animate infrequently
//   2. Group particles into a single canvas element
//   3. Use CSS animations for particles (single will-change on parent)

// ─────────────────────────────────────────────────────────
// will-change USAGE POLICY
// ─────────────────────────────────────────────────────────
//
// ✅ USE will-change FOR:
//   - Elements that animate continuously (blobs, particles, orb)
//   - Elements with complex spring physics (buttons, title)
//   - Elements that receive frequent pointer events (magnetic buttons)
//
// ❌ DO NOT USE will-change FOR:
//   - Elements that animate once (footer, subtitle, top bar)
//     → Use inline style willChange on motion.div, which
//       framer-motion cleans up automatically after animation
//   - Static elements
//   - Elements inside reduced-motion media query
//
// FRAMER-MOTION AUTO-CLEANUP:
//   Framer-motion automatically removes will-change after
//   animation completes when using the `whileInView` or
//   `whileHover` props. For continuous animations (animate
//   prop with repeat: Infinity), will-change stays active.

// ─────────────────────────────────────────────────────────
// REDUCED MOTION STRATEGY
// ─────────────────────────────────────────────────────────
//
// When prefers-reduced-motion: reduce is active:
//
// 1. TITLE: Show all letters instantly (no stagger, no spring)
// 2. SUBTITLE: Show instantly (no fade-up)
// 3. TYPEWRITER: Show full text immediately (no 55ms delay)
// 4. BUTTONS: Static (no hover scale, no magnetic, no orbit)
// 5. FEATURE PILLS: Static (no tilt, no stagger)
// 6. ORB: Static (no pulse, no ring animation)
// 7. BACKGROUND BLOBS: Static position (no drift)
// 8. PARTICLES: Reduce to 5 static dots (from 30)
// 9. DOT GRID: Show instantly (no fade-in)
// 10. NOISE/VIGNETTE: Show instantly (no fade-in)
// 11. THEME TRANSITION: Still animate (accessibility doesn't
//     prevent color changes — they're not motion)
// 12. IN-VIEW: Show instantly (no fade-up on scroll)
//
// Implementation: useReducedMotion() hook returns boolean.
// Pass to MotionConfig as reducedMotion="user" for global
// framer-motion respect, plus component-level conditional
// rendering for elements with custom animations (particles, orb).

// ─────────────────────────────────────────────────────────
// MEMORY MANAGEMENT
// ─────────────────────────────────────────────────────────
//
// 1. PARTICLES: Use useMemo for particle data generation.
//    Never regenerate on re-render.
//
// 2. SPRING VALUES: useMotionValue persists across renders.
//    Do NOT create new MotionValues inside render.
//
// 3. EVENT HANDLERS: useCallback for all pointer handlers
//    to prevent garbage collection churn.
//
// 4. ANIMATION CLEANUP: framer-motion auto-cancels animations
//    on unmount. For custom intervals (typewriter), always
//    clear in useEffect cleanup.
//
// 5. SVG NOISE: Inline data URI — no network request, but
//    decoded as bitmap in memory. Consider CSS backdrop-filter
//    alternative: backdrop-filter: url(#noise) with inline SVG.
//    Current approach is fine for single-page use.

// ─────────────────────────────────────────────────────────
// BUNDLE SIZE CONSIDERATIONS
// ─────────────────────────────────────────────────────────
//
// framer-motion ^12.23.2 tree-shaking:
//   Import only what's needed:
//     ✅ import { motion, useMotionValue, useSpring } from "framer-motion"
//     ❌ import * as motion from "framer-motion" (imports everything)
//
//   Next.js optimizePackageImports (next.config.ts):
//     experimental: { optimizePackageImports: ["framer-motion"] }
//
//   Estimated framer-motion bundle contribution:
//     - motion + useMotionValue + useSpring: ~25KB gzipped
//     - Full framer-motion: ~45KB gzipped
//     - With tree-shaking: ~25-30KB gzipped

// ─────────────────────────────────────────────────────────
// SSR / HYDRATION STRATEGY
// ─────────────────────────────────────────────────────────
//
// PROBLEM: framer-motion animations on SSR can cause hydration
// mismatches (initial styles differ between server and client).
//
// SOLUTION:
// 1. Wrap entire page in "use client"
// 2. Use mounted state guard to prevent SSR flash:
//    const [mounted, setMounted] = useState(false);
//    useEffect(() => setMounted(true), []);
//    if (!mounted) return <div className="min-h-screen bg-gray-950" />;
// 3. Use AnimatePresence for exit animations
// 4. All initial states are "hidden" — animations only run
//    after mount (initial="hidden" animate="visible")
//
// CLS (Cumulative Layout Shift):
//   The SSR placeholder has the same min-h-screen as the
//   animated page, so no layout shift occurs.

// ─────────────────────────────────────────────────────────
// SCROLL PERFORMANCE
// ─────────────────────────────────────────────────────────
//
// useScroll + useTransform use IntersectionObserver under
// the hood in framer-motion v12+. This means:
//   - No scroll event listeners
//   - Runs on the main thread but is very lightweight
//   - Compositor-friendly for parallax transforms
//
// For heavy parallax (multiple layers), consider using
// CSS scroll-driven animations (supported in Chrome 115+):
//   @keyframes parallax {
//     from { transform: translateY(0); }
//     to { transform: translateY(-50px); }
//   }
//   .parallax-bg {
//     animation: parallax linear;
//     animation-timeline: scroll();
//   }

// ─────────────────────────────────────────────────────────
// DEBUGGING TIPS
// ─────────────────────────────────────────────────────────
//
// 1. Chrome DevTools → Layers panel:
//    See all composited layers. Count should be ~58.
//
// 2. Chrome DevTools → Performance panel:
//    Record animation. Look for:
//    - No "Layout" or "Paint" bars during animation
//    - FPS should stay at 60fps throughout
//
// 3. Framer Motion DevTools:
//    Install "Framer Motion Developer Tools" browser extension.
//    Shows active animations and their spring states.
//
// 4. Render tracking:
//    Add React Profiler to check re-render count.
//    Motion values should NOT cause re-renders.
//    Only state changes (typewriter text) should cause renders.
//
// 5. Common issues:
//    - "Layout forced before scroll" → add will-change: transform
//    - Janky animations → check for competing CSS transitions
//    - Memory growth → check for MotionValue leaks (not cleaned up)

// ─────────────────────────────────────────────────────────
// ANIMATION TIMING REFERENCE CARD
// ─────────────────────────────────────────────────────────
//
// SPRING PRESETS (tuned for this page):
// ┌─────────────┬────────────┬──────────┬──────┬───────────────────┐
// │ Name        │ Stiffness │ Damping  │ Mass │ Use Case          │
// ├─────────────┼────────────┼──────────┼──────┼───────────────────┤
// │ snappy      │ 400       │ 25       │ 0.8  │ General UI        │
// │ heavy       │ 200       │ 20       │ 1.2  │ Title entrance    │
// │ floaty      │ 120       │ 14       │ 0.6  │ Particles, orbs   │
// │ gentle      │ 250       │ 30       │ 0.8  │ Secondary text    │
// │ bouncy      │ 500       │ 15       │ 0.5  │ Button hover/tap  │
// │ organic     │ 50        │ 20       │ 1.5  │ Background blobs  │
// └─────────────┴────────────┴──────────┴──────┴───────────────────┘
//
// UNDERDAMPED RATIO (ζ) = damping / (2 * √(stiffness * mass))
// ζ < 1 → bouncy (overshoots)
// ζ = 1 → critically damped (no overshoot)
// ζ > 1 → overdamped (sluggish)
//
// heavy:    ζ = 20/(2*√(200*1.2)) = 20/30.98 = 0.65  ← bouncy
// snappy:   ζ = 25/(2*√(400*0.8)) = 25/35.78 = 0.70  ← slightly bouncy
// gentle:   ζ = 30/(2*√(250*0.8)) = 30/28.28 = 1.06  ← critically damped
// bouncy:   ζ = 15/(2*√(500*0.5)) = 15/31.62 = 0.47  ← very bouncy
// organic:  ζ = 20/(2*√(50*1.5))  = 20/17.32 = 1.15  ← slightly overdamped
// floaty:   ζ = 14/(2*√(120*0.6)) = 14/16.97 = 0.82  ← mildly bouncy
//
// CHOREOGRAPHY DELAYS:
// ┌──────────────────┬─────────┬──────────────────┐
// │ Element          │ Delay   │ Duration         │
// ├──────────────────┼─────────┼──────────────────┤
// │ Background blobs │ 0.0s    │ infinite         │
// │ Particles        │ 0.0s    │ 15-40s per cycle │
// │ Noise/Vignette   │ 0.1s    │ 1.0s fade-in     │
// │ Top bar          │ 0.2s    │ 0.6s spring      │
// │ Dot grid         │ 0.35s   │ 1.5s fade-in     │
// │ Central orb      │ 0.5s    │ 0.6s spring      │
// │ Title            │ 0.6s    │ ~0.9s stagger    │
// │ Subtitle         │ 1.4s    │ 0.5s spring      │
// │ Typewriter       │ 1.55s   │ ~1.05s typing    │
// │ Feature pills    │ 2.1s    │ 0.3s stagger     │
// │ Buttons          │ 2.3s    │ 0.24s stagger    │
// │ Footer           │ 2.5s    │ 0.5s spring      │
// └──────────────────┴─────────┴──────────────────┘
// Total choreography: ~3.6s to full state
// Interactive threshold: ~1.5s (buttons visible)
