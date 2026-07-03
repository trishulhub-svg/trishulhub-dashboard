"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { ArrowUpRight, KeyRound, Zap, Shield, Globe } from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════
   TRISHULHUB — Redesigned Workspace (Framer Motion + Glassmorphism)
   ══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────
   1. SPRING PHYSICS PRESETS
   ───────────────────────────────────── */
const spring = {
  snappy: { type: "spring" as const, stiffness: 400, damping: 25, mass: 0.8 },
  heavy: { type: "spring" as const, stiffness: 200, damping: 20, mass: 1.2 },
  gentle: { type: "spring" as const, stiffness: 250, damping: 30, mass: 0.8 },
  bouncy: { type: "spring" as const, stiffness: 500, damping: 15, mass: 0.5 },
  organic: { type: "spring" as const, stiffness: 50, damping: 20, mass: 1.5 },
};

/* ─────────────────────────────────────
   2. ANIMATION VARIANTS
   ───────────────────────────────────── */

/* Background blobs — fade in at t=0.0s */
const blobVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 2.5, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

/* Topbar — slides down at t=0.1s */
const topbarVariants = {
  hidden: { opacity: 0, y: -24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring.snappy, delay: 0.1 },
  },
};

/* Orb — scales in at t=0.0s (behind everything) */
const orbWrapVariants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { ...spring.heavy, delay: 0 },
  },
};

/* Title container — stagger children from t=0.3s */
const titleContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.3 },
  },
};

/* Each title character — spring bounce in */
const charVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.85, rotateX: -40 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    transition: spring.snappy,
  },
};

/* Subtitle — fades up at t=0.9s */
const subtitleVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring.gentle, delay: 0.9 },
  },
};

/* Tagline — fades up at t=1.2s */
const taglineVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring.gentle, delay: 1.2 },
  },
};

/* Actions container (buttons) — fade up with scale at t=1.0s */
const actionsVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.94 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...spring.gentle, delay: 1.0 },
  },
};

/* Credential card — slides up at t=1.08s */
const credVariants = {
  hidden: { opacity: 0, y: 14, x: -8 },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    transition: { ...spring.gentle, delay: 1.08 },
  },
};

/* Pills container — stagger from t=1.3s */
const pillsContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 1.3 },
  },
};

/* Individual pill */
const pillVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.88 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: spring.snappy,
  },
};

/* Footer — fade in at t=1.5s */
const footerVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 1.5, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

/* START hint text */
const hintVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delay: 1.3, duration: 0.6 },
  },
};

/* ─────────────────────────────────────
   3. PARTICLE DATA GENERATOR
   ───────────────────────────────────── */
function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 10,
    opacity: Math.random() * 0.4 + 0.1,
  }));
}

/* Feature pill definitions */
const FEATURE_PILLS = [
  { icon: Shield, label: "Secured" },
  { icon: Zap, label: "AI Powered" },
  { icon: Globe, label: "Cloud Native" },
];

/* ══════════════════════════════════════════════════════════════════════
   4. MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function TrishulWorkspacePage() {
  /* ── Hooks ── */
  const { data: session } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  /* ── Kill parent <main> scroll & padding for full-bleed workspace ── */
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const origOverflow = main.style.overflow;
    const origPadding = main.style.padding;
    const origHeight = main.style.height;
    const origMinHeight = main.style.minHeight;
    main.style.overflow = "hidden";
    main.style.padding = "0";
    main.style.height = "calc(100vh - 4rem)";
    main.style.minHeight = "0";
    return () => {
      main.style.overflow = origOverflow;
      main.style.padding = origPadding;
      main.style.height = origHeight;
      main.style.minHeight = origMinHeight;
    };
  }, []);

  const userName = session?.user?.name || "User";
  const userRole = (session?.user?.role || "DEVELOPER").replace(/_/g, " ");

  /* ── Mode detection ── */
  const mode = mounted
    ? resolvedTheme === "bluelight"
      ? "bluelight"
      : resolvedTheme === "dark"
      ? "dark"
      : "light"
    : "dark";

  /* ── Typewriter effect ── */
  const tagline = "I am ready to cook.";
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    if (!mounted) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const typingTimer = setTimeout(() => {
      let idx = 0;
      intervalId = setInterval(() => {
        idx++;
        setTypedText(tagline.slice(0, idx));
        if (idx >= tagline.length) {
          if (intervalId) clearInterval(intervalId);
          intervalId = null;
          setTypingDone(true);
        }
      }, 55);
    }, 1200);

    return () => {
      clearTimeout(typingTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [mounted]);

  /* ── Particles ── */
  const particlesRef = useRef(generateParticles(30));

  /* ── Orb floating motion (spring-driven) ── */
  const orbFloatY = useMotionValue(0);
  const orbFloatX = useMotionValue(0);
  const orbSpringY = useSpring(orbFloatY, { stiffness: 30, damping: 15 });
  const orbSpringX = useSpring(orbFloatX, { stiffness: 25, damping: 18 });

  useEffect(() => {
    let frame: number;
    const animate = () => {
      const t = Date.now() / 1000;
      orbFloatY.set(Math.sin(t * 0.5) * 12 + Math.sin(t * 0.8) * 5);
      orbFloatX.set(Math.cos(t * 0.4) * 8 + Math.sin(t * 0.7) * 4);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [orbFloatY, orbFloatX]);

  /* ── Mouse-following spotlight ── */
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 150, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 150, damping: 25 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  /* ── Magnetic hover on START button ── */
  const [btnHovered, setBtnHovered] = useState(false);
  const btnMagX = useMotionValue(0);
  const btnMagY = useMotionValue(0);
  const btnSpringX = useSpring(btnMagX, { stiffness: 200, damping: 20 });
  const btnSpringY = useSpring(btnMagY, { stiffness: 200, damping: 20 });

  const handleBtnMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distX = e.clientX - centerX;
      const distY = e.clientY - centerY;
      const maxShift = 5;
      const distance = Math.sqrt(distX * distX + distY * distY);
      const factor = Math.min(distance / 100, 1);
      btnMagX.set(distX * factor * (maxShift / 50));
      btnMagY.set(distY * factor * (maxShift / 50));
    },
    [btnMagX, btnMagY]
  );

  const handleBtnMouseLeave = useCallback(() => {
    btnMagX.set(0);
    btnMagY.set(0);
    setBtnHovered(false);
  }, [btnMagX, btnMagY]);

  /* ── Handlers ── */
  const handleStart = useCallback(() => {
    window.open("https://workspace-dashboard-rho.vercel.app/", "_blank");
  }, []);

  const handleCredentials = useCallback(() => {
    router.push("/dashboard/credentials");
  }, [router]);

  /* ── Loading guard ── */
  if (!mounted) {
    return (
      <div className="nx-root nx-root--dark">
        <div className="nx-noise" aria-hidden />
        <div className="nx-vignette nx-vignette--dark" aria-hidden />
      </div>
    );
  }

  /* ── Cursor blink config ── */
  const cursorAnimation = typingDone
    ? { opacity: [1, 1, 0, 0] }
    : { opacity: 1 };
  const cursorTransition = typingDone
    ? { duration: 1.0, repeat: Infinity, times: [0, 0.48, 0.52, 1], ease: "linear" as const }
    : { duration: 0 };

  /* ── Spotlight gradient color per mode ── */
  const spotlightColor =
    mode === "dark"
      ? "rgba(6, 182, 212, 0.07), rgba(139, 92, 246, 0.04)"
      : mode === "bluelight"
      ? "rgba(251, 191, 36, 0.07), rgba(217, 119, 6, 0.04)"
      : "rgba(30, 64, 120, 0.06), rgba(6, 182, 212, 0.03)";

  /* ════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          className={`nx-root nx-root--${mode}`}
          initial="hidden"
          animate="visible"
        >
          {/* ════════════════════════════════════════
              BACKGROUND LAYERS (CSS-animated)
              ════════════════════════════════════════ */}

          {/* Mouse-following spotlight */}
          <motion.div
            className="nx-spotlight"
            aria-hidden
            style={{
              left: springX,
              top: springY,
              background: `radial-gradient(350px circle at 0px 0px, ${spotlightColor}, transparent)`,
            }}
          />

          {/* Animated mesh gradient — 4 aurora blobs */}
          <div className="nx-mesh" aria-hidden>
            <motion.div
              className="nx-mesh-blob nx-mesh-blob--1"
              variants={blobVariants}
            />
            <motion.div
              className="nx-mesh-blob nx-mesh-blob--2"
              variants={blobVariants}
            />
            <motion.div
              className="nx-mesh-blob nx-mesh-blob--3"
              variants={blobVariants}
            />
            <motion.div
              className="nx-mesh-blob nx-mesh-blob--4"
              variants={blobVariants}
            />
          </div>

          {/* Dot grid */}
          <div className="nx-grid" aria-hidden />

          {/* Floating particles */}
          <div className="nx-particles" aria-hidden>
            {particlesRef.current.map((p) => (
              <span
                key={p.id}
                className="nx-particle"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  opacity: p.opacity,
                  animationDuration: `${p.duration}s`,
                  animationDelay: `${p.delay}s`,
                }}
              />
            ))}
          </div>

          {/* Noise texture */}
          <div className="nx-noise" aria-hidden />

          {/* Vignette */}
          <div className={`nx-vignette nx-vignette--${mode}`} aria-hidden />

          {/* ════════════════════════════════════════
              MAIN CONTENT (Framer Motion)
              ════════════════════════════════════════ */}
          <div className="nx-content">
            {/* ── Top Bar (Glassmorphism) ── */}
            <motion.header
              className={`nx-topbar nx-topbar--${mode}`}
              variants={topbarVariants}
            >
              <div className="nx-topbar-left">
                <div className={`nx-logo-dot nx-logo-dot--${mode}`} />
                <span className={`nx-logo-text nx-logo-text--${mode}`}>
                  TrishulHub
                </span>
              </div>
              <div className="nx-topbar-right">
                <span className={`nx-badge nx-badge--${mode}`}>
                  Protocol v5.0
                </span>
              </div>
            </motion.header>

            {/* ── Hero Section ── */}
            <section className="nx-hero">
              {/* Floating geometric accents (decorative) */}
              <div className="nx-geo-accent nx-geo-accent--1" aria-hidden />
              <div className="nx-geo-accent nx-geo-accent--2" aria-hidden />
              <div className="nx-geo-accent nx-geo-accent--3" aria-hidden />
              <div className="nx-geo-accent nx-geo-accent--4" aria-hidden />

              {/* Central orb with spring-driven float */}
              <motion.div
                className="nx-orb-wrap"
                variants={orbWrapVariants}
                style={{ y: orbSpringY, x: orbSpringX }}
                aria-hidden
              >
                <div className="nx-orb">
                  <div className={`nx-orb-ring nx-orb-ring--${mode}`} />
                  <div className={`nx-orb-ring nx-orb-ring--2 nx-orb-ring--${mode}`} />
                  <div className={`nx-orb-ring nx-orb-ring--3 nx-orb-ring--${mode}`} />
                  {/* Enhanced double glow */}
                  <div className={`nx-orb-glow nx-orb-glow--${mode}`} />
                  <div className={`nx-orb-glow-outer nx-orb-glow-outer--${mode}`} />
                  <div className={`nx-orb-core nx-orb-core--${mode}`} />
                  {/* Energy pulse rings */}
                  <div className={`nx-orb-pulse-ring nx-orb-pulse-ring--1 nx-orb-pulse-ring--${mode}`} />
                  <div className={`nx-orb-pulse-ring nx-orb-pulse-ring--2 nx-orb-pulse-ring--${mode}`} />
                </div>
              </motion.div>

              {/* Title cluster */}
              <motion.div
                className="nx-title-cluster"
                variants={titleContainerVariants}
              >
                <motion.h1 className={`nx-title nx-title--${mode}`}>
                  {"TrishulHub".split("").map((char, i) => (
                    <motion.span key={i} variants={charVariants}>
                      {char}
                    </motion.span>
                  ))}
                </motion.h1>

                <motion.p
                  className={`nx-subtitle nx-subtitle--${mode}`}
                  variants={subtitleVariants}
                >
                  Your Personal Workspace
                </motion.p>

                {/* Typewriter tagline */}
                <motion.div
                  className="nx-tagline"
                  variants={taglineVariants}
                >
                  <span className={`nx-tagline-line nx-tagline-line--${mode}`} />
                  <span className={`nx-tagline-text nx-tagline-text--${mode}`}>
                    {typedText}
                    <motion.span
                      className={`nx-cursor nx-cursor--${mode}`}
                      animate={cursorAnimation}
                      transition={cursorTransition}
                    />
                  </span>
                </motion.div>
              </motion.div>

              {/* ── Action Buttons ── */}
              <motion.div
                className="nx-actions"
                variants={actionsVariants}
              >
                {/* START — primary CTA with magnetic hover */}
                <motion.button
                  onClick={handleStart}
                  className={`nx-start-btn nx-start-btn--${mode}`}
                  type="button"
                  style={{ x: btnSpringX, y: btnSpringY }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onMouseEnter={() => setBtnHovered(true)}
                  onMouseMove={handleBtnMouseMove}
                  onMouseLeave={handleBtnMouseLeave}
                >
                  <span className={`nx-start-ring nx-start-ring--${mode}`} aria-hidden />
                  <AnimatePresence>
                    {btnHovered && (
                      <motion.span
                        className={`nx-start-glow-ring nx-start-glow-ring--${mode}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        aria-hidden
                      />
                    )}
                  </AnimatePresence>
                  <span className="nx-start-icon" aria-hidden>
                    <Zap size={18} strokeWidth={2.5} />
                  </span>
                  <span className="nx-start-label">START</span>
                  <span className="nx-start-arrow" aria-hidden>
                    <ArrowUpRight size={16} />
                  </span>
                </motion.button>

                <motion.p
                  className={`nx-start-hint nx-start-hint--${mode}`}
                  variants={hintVariants}
                >
                  Opens workspace in a new tab
                </motion.p>

                {/* Credential card (glassmorphism) */}
                <motion.button
                  onClick={handleCredentials}
                  className={`nx-cred-btn nx-cred-btn--${mode}`}
                  type="button"
                  variants={credVariants}
                  whileHover={{ x: 4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={`nx-cred-icon-wrap nx-cred-icon-wrap--${mode}`}>
                    <KeyRound className="nx-cred-icon" />
                  </div>
                  <div className="nx-cred-text">
                    <span className={`nx-cred-title nx-cred-title--${mode}`}>
                      Claim Credentials
                    </span>
                    <span className={`nx-cred-desc nx-cred-desc--${mode}`}>
                      Get your ID &amp; Password
                    </span>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className={`nx-cred-arrow nx-cred-arrow--${mode}`}
                  />
                </motion.button>
              </motion.div>
            </section>

            {/* ── Feature Pills ── */}
            <motion.div
              className="nx-pills"
              variants={pillsContainerVariants}
            >
              {FEATURE_PILLS.map((pill) => {
                const Icon = pill.icon;
                return (
                  <motion.div
                    key={pill.label}
                    className={`nx-pill nx-pill--${mode}`}
                    variants={pillVariants}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Icon size={14} />
                    <span>{pill.label}</span>
                    <span className="nx-pill-shimmer" aria-hidden />
                  </motion.div>
                );
              })}
            </motion.div>

            {/* ── Footer ── */}
            <motion.footer
              className={`nx-footer nx-footer--${mode}`}
              variants={footerVariants}
            >
              <div className="nx-footer-inner">
                <p className={`nx-footer-text nx-footer-text--${mode}`}>
                  Welcome back,{" "}
                  <span className={`nx-footer-name nx-footer-name--${mode}`}>
                    {userName}
                  </span>
                </p>
                <div className={`nx-footer-divider nx-footer-divider--${mode}`} />
                <span className={`nx-footer-role nx-footer-role--${mode}`}>
                  {userRole}
                </span>
              </div>
            </motion.footer>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
         STYLES — GPU-composited CSS animations + theme styling
         ═══════════════════════════════════════════════════════════════ */}
      <style jsx global>{`
        /* ── Touch cursor reset ── */
        @media (pointer: coarse) {
          .nx-root,
          .nx-root * {
            cursor: auto !important;
          }
        }

        /* ═══════════════════════
           ROOT
           ═══════════════════════ */
        .nx-root {
          position: relative;
          height: 100%;
          overflow: hidden;
          background: #06060a;
          font-family: "Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .nx-root--light {
          background: #f4f5f8;
        }
        .nx-root--bluelight {
          background: #0a0808;
        }

        /* ═══════════════════════
           MOUSE-FOLLOWING SPOTLIGHT
           ═══════════════════════ */
        .nx-spotlight {
          position: fixed;
          width: 700px;
          height: 700px;
          z-index: 3;
          pointer-events: none;
          transform: translate(-50%, -50%);
          will-change: left, top;
        }

        /* ═══════════════════════
           ANIMATED MESH GRADIENT
           ═══════════════════════ */
        .nx-mesh {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .nx-mesh-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          will-change: transform;
        }

        /* Blob 1 — top-left cyan */
        .nx-mesh-blob--1 {
          width: 600px;
          height: 600px;
          top: -20%;
          left: -10%;
          background: rgba(6, 182, 212, 0.12);
          animation: nx-float-1 18s ease-in-out infinite;
        }
        /* Blob 2 — bottom-right purple */
        .nx-mesh-blob--2 {
          width: 500px;
          height: 500px;
          bottom: -15%;
          right: -8%;
          background: rgba(139, 92, 246, 0.10);
          animation: nx-float-2 22s ease-in-out infinite;
        }
        /* Blob 3 — center-right pink */
        .nx-mesh-blob--3 {
          width: 400px;
          height: 400px;
          top: 30%;
          right: 20%;
          background: rgba(236, 72, 153, 0.06);
          animation: nx-float-3 25s ease-in-out infinite;
        }
        /* Blob 4 — center-left blue */
        .nx-mesh-blob--4 {
          width: 350px;
          height: 350px;
          top: 60%;
          left: 15%;
          background: rgba(59, 130, 246, 0.07);
          animation: nx-float-4 20s ease-in-out infinite;
        }

        /* Light mode — 50-60% blob opacity */
        .nx-root--light .nx-mesh-blob--1 {
          background: rgba(6, 182, 212, 0.07);
        }
        .nx-root--light .nx-mesh-blob--2 {
          background: rgba(139, 92, 246, 0.05);
        }
        .nx-root--light .nx-mesh-blob--3 {
          background: rgba(236, 72, 153, 0.03);
        }
        .nx-root--light .nx-mesh-blob--4 {
          background: rgba(59, 130, 246, 0.04);
        }

        /* Bluelight mode — amber family */
        .nx-root--bluelight .nx-mesh-blob--1 {
          background: rgba(251, 191, 36, 0.10);
        }
        .nx-root--bluelight .nx-mesh-blob--2 {
          background: rgba(217, 119, 6, 0.08);
        }
        .nx-root--bluelight .nx-mesh-blob--3 {
          background: rgba(245, 158, 11, 0.05);
        }
        .nx-root--bluelight .nx-mesh-blob--4 {
          background: rgba(180, 83, 9, 0.06);
        }

        @keyframes nx-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(80px, 60px) scale(1.1); }
          66% { transform: translate(-40px, 100px) scale(0.95); }
        }
        @keyframes nx-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-70px, -50px) scale(1.05); }
          66% { transform: translate(50px, -80px) scale(0.9); }
        }
        @keyframes nx-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-60px, 40px) scale(1.15); }
        }
        @keyframes nx-float-4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -60px) scale(1.1); }
        }

        /* ═══════════════════════
           DOT GRID
           ═══════════════════════ */
        .nx-grid {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background-image: radial-gradient(
            circle,
            rgba(255, 255, 255, 0.03) 1px,
            transparent 1px
          );
          background-size: 40px 40px;
          mask-image: radial-gradient(
            ellipse 60% 50% at 50% 50%,
            black 0%,
            transparent 100%
          );
          -webkit-mask-image: radial-gradient(
            ellipse 60% 50% at 50% 50%,
            black 0%,
            transparent 100%
          );
        }
        .nx-root--light .nx-grid {
          background-image: radial-gradient(
            circle,
            rgba(0, 0, 0, 0.04) 1px,
            transparent 1px
          );
        }
        .nx-root--bluelight .nx-grid {
          background-image: radial-gradient(
            circle,
            rgba(251, 191, 36, 0.025) 1px,
            transparent 1px
          );
        }

        /* ═══════════════════════
           FLOATING PARTICLES
           ═══════════════════════ */
        .nx-particles {
          position: fixed;
          inset: 0;
          z-index: 2;
          pointer-events: none;
        }
        .nx-particle {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          animation: nx-particle-drift linear infinite;
        }
        .nx-root--light .nx-particle {
          background: rgba(0, 0, 0, 0.25);
        }
        .nx-root--bluelight .nx-particle {
          background: rgba(251, 191, 36, 0.45);
        }

        @keyframes nx-particle-drift {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-120px) translateX(40px); opacity: 0; }
        }

        /* ═══════════════════════
           NOISE & VIGNETTE
           ═══════════════════════ */
        .nx-noise {
          position: fixed;
          inset: 0;
          z-index: 8000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 200px;
          opacity: 0.025;
        }
        .nx-vignette {
          position: fixed;
          inset: 0;
          z-index: 7999;
          pointer-events: none;
        }
        .nx-vignette--dark,
        .nx-vignette--bluelight {
          background: radial-gradient(
            ellipse 65% 55% at 50% 45%,
            transparent 0%,
            rgba(0, 0, 0, 0.6) 100%
          );
        }
        .nx-vignette--light {
          background: radial-gradient(
            ellipse 65% 55% at 50% 45%,
            transparent 0%,
            rgba(180, 190, 220, 0.25) 100%
          );
        }

        /* ═══════════════════════
           CONTENT LAYOUT
           ═══════════════════════ */
        .nx-content {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 2rem 1.5rem;
        }

        /* ═══════════════════════
           TOP BAR (Glassmorphism)
           ═══════════════════════ */
        .nx-topbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 2rem;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          pointer-events: none;
        }
        .nx-topbar--dark {
          background: rgba(6, 6, 10, 0.5);
        }
        .nx-topbar--light {
          background: rgba(244, 245, 248, 0.65);
          border-bottom-color: rgba(0, 0, 0, 0.04);
        }
        .nx-topbar--bluelight {
          background: rgba(10, 8, 8, 0.55);
          border-bottom-color: rgba(251, 191, 36, 0.04);
        }

        .nx-topbar-left {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .nx-logo-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          box-shadow: 0 0 12px rgba(6, 182, 212, 0.4),
            0 0 4px rgba(139, 92, 246, 0.3);
        }
        .nx-logo-dot--light {
          background: linear-gradient(135deg, #0891b2, #7c3aed);
          box-shadow: 0 0 10px rgba(6, 182, 212, 0.25);
        }
        .nx-logo-dot--bluelight {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.4),
            0 0 4px rgba(217, 119, 6, 0.3);
        }

        .nx-logo-text {
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: rgba(255, 255, 255, 0.7);
        }
        .nx-logo-text--light {
          color: rgba(0, 0, 0, 0.6);
        }
        .nx-logo-text--bluelight {
          color: rgba(251, 191, 36, 0.7);
        }

        .nx-badge {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0.3rem 0.75rem;
          border-radius: 100px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.35);
        }
        .nx-badge--light {
          border-color: rgba(0, 0, 0, 0.06);
          background: rgba(0, 0, 0, 0.02);
          color: rgba(0, 0, 0, 0.35);
        }
        .nx-badge--bluelight {
          border-color: rgba(251, 191, 36, 0.1);
          background: rgba(251, 191, 36, 0.03);
          color: rgba(251, 191, 36, 0.4);
        }

        /* ═══════════════════════
           HERO SECTION
           ═══════════════════════ */
        .nx-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          text-align: center;
          position: relative;
        }

        /* ── Floating Geometric Accents ── */
        .nx-geo-accent {
          position: absolute;
          pointer-events: none;
          z-index: 0;
        }
        .nx-geo-accent--1 {
          width: 6px;
          height: 6px;
          top: 15%;
          left: 18%;
          background: rgba(6, 182, 212, 0.10);
          border-radius: 50%;
          animation: nx-geo-float-1 12s ease-in-out infinite;
        }
        .nx-geo-accent--2 {
          width: 8px;
          height: 8px;
          top: 25%;
          right: 15%;
          background: rgba(139, 92, 246, 0.08);
          transform: rotate(45deg);
          border-radius: 1px;
          animation: nx-geo-float-2 16s ease-in-out infinite;
        }
        .nx-geo-accent--3 {
          width: 5px;
          height: 5px;
          bottom: 30%;
          left: 12%;
          background: rgba(236, 72, 153, 0.09);
          border-radius: 50%;
          animation: nx-geo-float-3 14s ease-in-out infinite;
        }
        .nx-geo-accent--4 {
          width: 7px;
          height: 7px;
          bottom: 22%;
          right: 20%;
          background: rgba(59, 130, 246, 0.08);
          transform: rotate(45deg);
          border-radius: 1px;
          animation: nx-geo-float-4 18s ease-in-out infinite;
        }

        /* Geo accent per mode */
        .nx-root--light .nx-geo-accent--1 { background: rgba(6, 182, 212, 0.08); }
        .nx-root--light .nx-geo-accent--2 { background: rgba(139, 92, 246, 0.06); }
        .nx-root--light .nx-geo-accent--3 { background: rgba(236, 72, 153, 0.07); }
        .nx-root--light .nx-geo-accent--4 { background: rgba(59, 130, 246, 0.06); }
        .nx-root--bluelight .nx-geo-accent--1 { background: rgba(251, 191, 36, 0.10); }
        .nx-root--bluelight .nx-geo-accent--2 { background: rgba(217, 119, 6, 0.08); }
        .nx-root--bluelight .nx-geo-accent--3 { background: rgba(245, 158, 11, 0.09); }
        .nx-root--bluelight .nx-geo-accent--4 { background: rgba(180, 83, 9, 0.08); }

        @keyframes nx-geo-float-1 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(180deg); }
        }
        @keyframes nx-geo-float-2 {
          0%, 100% { transform: translateY(0) rotate(45deg); }
          50% { transform: translateY(-14px) rotate(225deg); }
        }
        @keyframes nx-geo-float-3 {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-10px) translateX(6px); }
          66% { transform: translateY(-16px) translateX(-4px); }
        }
        @keyframes nx-geo-float-4 {
          0%, 100% { transform: translateY(0) rotate(45deg); }
          50% { transform: translateY(-20px) rotate(-135deg); }
        }

        /* ── Central Orb ── */
        .nx-orb-wrap {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 0;
          pointer-events: none;
        }
        .nx-orb {
          position: relative;
          width: 300px;
          height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Spinning rings */
        .nx-orb-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(6, 182, 212, 0.15);
          animation: nx-orb-spin 20s linear infinite;
        }
        .nx-orb-ring--2 {
          inset: 20px;
          border-color: rgba(139, 92, 246, 0.12);
          animation-duration: 28s;
          animation-direction: reverse;
        }
        .nx-orb-ring--3 {
          inset: 50px;
          border-color: rgba(236, 72, 153, 0.08);
          animation-duration: 35s;
        }

        /* Ring colors per mode */
        .nx-orb-ring--bluelight { border-color: rgba(251, 191, 36, 0.12); }
        .nx-orb-ring--2.nx-orb-ring--bluelight { border-color: rgba(217, 119, 6, 0.10); }
        .nx-orb-ring--3.nx-orb-ring--bluelight { border-color: rgba(245, 158, 11, 0.06); }
        .nx-orb-ring--light { border-color: rgba(6, 182, 212, 0.10); }
        .nx-orb-ring--2.nx-orb-ring--light { border-color: rgba(139, 92, 246, 0.08); }
        .nx-orb-ring--3.nx-orb-ring--light { border-color: rgba(236, 72, 153, 0.05); }

        /* Enhanced double glow */
        .nx-orb-glow {
          position: absolute;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(6, 182, 212, 0.12) 0%,
            transparent 70%
          );
          filter: blur(8px);
          animation: nx-orb-pulse 4s ease-in-out infinite;
          z-index: 1;
        }
        .nx-orb-glow-outer {
          position: absolute;
          width: 140px;
          height: 140px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(6, 182, 212, 0.04) 0%,
            rgba(139, 92, 246, 0.02) 40%,
            transparent 70%
          );
          filter: blur(20px);
          animation: nx-orb-pulse 6s ease-in-out infinite reverse;
          z-index: 0;
        }

        /* Glow per mode */
        .nx-orb-glow--light {
          background: radial-gradient(
            circle,
            rgba(6, 182, 212, 0.08) 0%,
            transparent 70%
          );
        }
        .nx-orb-glow-outer--light {
          background: radial-gradient(
            circle,
            rgba(6, 182, 212, 0.03) 0%,
            transparent 70%
          );
        }
        .nx-orb-glow--bluelight {
          background: radial-gradient(
            circle,
            rgba(251, 191, 36, 0.10) 0%,
            transparent 70%
          );
        }
        .nx-orb-glow-outer--bluelight {
          background: radial-gradient(
            circle,
            rgba(251, 191, 36, 0.03) 0%,
            rgba(217, 119, 6, 0.01) 40%,
            transparent 70%
          );
        }

        /* Orb core */
        .nx-orb-core {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(6, 182, 212, 0.7);
          box-shadow: 0 0 40px rgba(6, 182, 212, 0.35),
            0 0 80px rgba(139, 92, 246, 0.15);
          animation: nx-orb-pulse 4s ease-in-out infinite;
          z-index: 2;
        }
        .nx-orb-core--light {
          background: rgba(6, 182, 212, 0.45);
          box-shadow: 0 0 40px rgba(6, 182, 212, 0.15);
        }
        .nx-orb-core--bluelight {
          background: rgba(251, 191, 36, 0.6);
          box-shadow: 0 0 40px rgba(251, 191, 36, 0.3),
            0 0 80px rgba(217, 119, 6, 0.1);
        }

        /* ── Orb Energy Pulse Rings ── */
        .nx-orb-pulse-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(6, 182, 212, 0.15);
          pointer-events: none;
          animation: nx-energy-pulse 3s ease-out infinite;
        }
        .nx-orb-pulse-ring--2 {
          animation-delay: 1.5s;
        }
        .nx-orb-pulse-ring--bluelight {
          border-color: rgba(251, 191, 36, 0.12);
        }
        .nx-orb-pulse-ring--light {
          border-color: rgba(6, 182, 212, 0.10);
        }

        @keyframes nx-energy-pulse {
          0% {
            transform: scale(0.3);
            opacity: 0.3;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        @keyframes nx-orb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes nx-orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 1; }
        }

        /* ── Title ── */
        .nx-title-cluster {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .nx-title {
          font-size: clamp(3rem, 10vw, 7rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1;
          display: flex;
          justify-content: center;
          perspective: 600px;
        }
        .nx-title--dark {
          color: transparent;
          background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 40%, #e2e8f0 80%);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .nx-title--light {
          color: transparent;
          background: linear-gradient(135deg, #1e293b 0%, #475569 40%, #1e293b 80%);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .nx-title--bluelight {
          color: transparent;
          background: linear-gradient(135deg, #fbbf24 0%, #d97706 40%, #fbbf24 80%);
          -webkit-background-clip: text;
          background-clip: text;
        }

        /* Subtitle */
        .nx-subtitle {
          font-size: clamp(0.9rem, 2.5vw, 1.15rem);
          font-weight: 400;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-top: 0.75rem;
        }
        .nx-subtitle--dark { color: rgba(255, 255, 255, 0.35); }
        .nx-subtitle--light { color: rgba(0, 0, 0, 0.3); }
        .nx-subtitle--bluelight { color: rgba(251, 191, 36, 0.4); }

        /* ── Typewriter Tagline ── */
        .nx-tagline {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1.25rem;
        }
        .nx-tagline-line {
          width: 24px;
          height: 1px;
          flex-shrink: 0;
        }
        .nx-tagline-line--dark { background: rgba(255, 255, 255, 0.15); }
        .nx-tagline-line--light { background: rgba(0, 0, 0, 0.12); }
        .nx-tagline-line--bluelight { background: rgba(251, 191, 36, 0.2); }

        .nx-tagline-text {
          font-size: clamp(0.85rem, 2vw, 1rem);
          font-weight: 300;
          letter-spacing: 0.02em;
          font-style: italic;
          display: inline;
        }
        .nx-tagline-text--dark { color: rgba(255, 255, 255, 0.5); }
        .nx-tagline-text--light { color: rgba(0, 0, 0, 0.4); }
        .nx-tagline-text--bluelight { color: rgba(251, 191, 36, 0.55); }

        .nx-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          border-radius: 1px;
        }
        .nx-cursor--dark { background: rgba(226, 232, 240, 0.7); }
        .nx-cursor--light { background: rgba(30, 41, 59, 0.5); }
        .nx-cursor--bluelight { background: rgba(251, 191, 36, 0.6); }

        /* ═══════════════════════
           ACTION BUTTONS
           ═══════════════════════ */
        .nx-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          margin-top: 3rem;
        }

        /* ── START Button ── */
        .nx-start-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.9rem 2.2rem;
          border-radius: 60px;
          border: 1px solid rgba(6, 182, 212, 0.3);
          background: rgba(6, 182, 212, 0.06);
          color: #06b6d4;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          font-family: inherit;
          cursor: pointer;
          transition: border-color 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            background 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .nx-start-btn:hover {
          border-color: rgba(6, 182, 212, 0.6);
          background: rgba(6, 182, 212, 0.12);
          box-shadow: 0 0 30px rgba(6, 182, 212, 0.15),
            inset 0 0 30px rgba(6, 182, 212, 0.05);
        }

        /* Light mode START */
        .nx-start-btn--light {
          border-color: rgba(6, 182, 212, 0.4);
          background: rgba(6, 182, 212, 0.08);
          color: #0891b2;
        }
        .nx-start-btn--light:hover {
          border-color: rgba(6, 182, 212, 0.7);
          background: rgba(6, 182, 212, 0.14);
          box-shadow: 0 0 30px rgba(6, 182, 212, 0.1);
        }

        /* Bluelight mode START */
        .nx-start-btn--bluelight {
          border-color: rgba(251, 191, 36, 0.3);
          background: rgba(251, 191, 36, 0.06);
          color: #f59e0b;
        }
        .nx-start-btn--bluelight:hover {
          border-color: rgba(251, 191, 36, 0.6);
          background: rgba(251, 191, 36, 0.12);
          box-shadow: 0 0 30px rgba(251, 191, 36, 0.15),
            inset 0 0 30px rgba(251, 191, 36, 0.05);
        }

        /* Orbiting ring */
        .nx-start-ring {
          position: absolute;
          inset: -4px;
          border-radius: 60px;
          border: 1.5px solid transparent;
          border-top-color: rgba(6, 182, 212, 0.4);
          animation: nx-ring-spin 3s linear infinite;
          pointer-events: none;
        }
        .nx-start-ring--light {
          border-top-color: rgba(6, 182, 212, 0.35);
        }
        .nx-start-ring--bluelight {
          border-top-color: rgba(251, 191, 36, 0.4);
        }
        @keyframes nx-ring-spin {
          to { transform: rotate(360deg); }
        }

        /* Pulsing glow ring on hover */
        .nx-start-glow-ring {
          position: absolute;
          inset: -6px;
          border-radius: 60px;
          pointer-events: none;
          animation: nx-glow-ring-pulse 1.5s ease-in-out infinite;
        }
        .nx-start-glow-ring--dark {
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.2),
            0 0 40px rgba(139, 92, 246, 0.1);
        }
        .nx-start-glow-ring--light {
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.15),
            0 0 40px rgba(6, 182, 212, 0.05);
        }
        .nx-start-glow-ring--bluelight {
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.2),
            0 0 40px rgba(217, 119, 6, 0.1);
        }
        @keyframes nx-glow-ring-pulse {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.04);
          }
        }

        .nx-start-icon {
          display: flex;
          align-items: center;
        }
        .nx-start-arrow {
          display: flex;
          align-items: center;
          opacity: 0.5;
          transition: opacity 0.3s, transform 0.3s;
        }
        .nx-start-btn:hover .nx-start-arrow {
          opacity: 1;
          transform: translate(2px, -2px);
        }

        .nx-start-hint {
          font-size: 0.72rem;
          letter-spacing: 0.05em;
          margin-top: -0.25rem;
        }
        .nx-start-hint--dark { color: rgba(255, 255, 255, 0.2); }
        .nx-start-hint--light { color: rgba(0, 0, 0, 0.25); }
        .nx-start-hint--bluelight { color: rgba(251, 191, 36, 0.25); }

        /* ── Credential Button (Glassmorphism) ── */
        .nx-cred-btn {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.85rem 1.5rem;
          border-radius: 16px;
          font-family: inherit;
          cursor: pointer;
          transition: border-color 0.35s cubic-bezier(0.16, 1, 0.3, 1),
            background 0.35s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          margin-top: 0.25rem;
          text-align: left;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .nx-cred-btn--dark {
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }
        .nx-cred-btn--dark:hover {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 0 24px rgba(139, 92, 246, 0.06);
        }

        .nx-cred-btn--light {
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.6);
        }
        .nx-cred-btn--light:hover {
          border-color: rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.85);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
        }

        .nx-cred-btn--bluelight {
          border: 1px solid rgba(251, 191, 36, 0.08);
          background: rgba(251, 191, 36, 0.02);
        }
        .nx-cred-btn--bluelight:hover {
          border-color: rgba(251, 191, 36, 0.15);
          background: rgba(251, 191, 36, 0.04);
          box-shadow: 0 0 24px rgba(251, 191, 36, 0.06);
        }

        .nx-cred-icon-wrap {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          flex-shrink: 0;
          transition: all 0.3s;
        }
        .nx-cred-icon-wrap--dark {
          background: rgba(139, 92, 246, 0.08);
          border: 1px solid rgba(139, 92, 246, 0.12);
        }
        .nx-cred-btn--dark:hover .nx-cred-icon-wrap--dark {
          background: rgba(139, 92, 246, 0.12);
          border-color: rgba(139, 92, 246, 0.2);
        }
        .nx-cred-icon-wrap--bluelight {
          background: rgba(251, 191, 36, 0.06);
          border: 1px solid rgba(251, 191, 36, 0.1);
        }
        .nx-cred-btn--bluelight:hover .nx-cred-icon-wrap--bluelight {
          background: rgba(251, 191, 36, 0.10);
          border-color: rgba(251, 191, 36, 0.18);
        }
        .nx-cred-icon-wrap--light {
          background: rgba(139, 92, 246, 0.06);
          border: 1px solid rgba(139, 92, 246, 0.10);
        }
        .nx-cred-btn--light:hover .nx-cred-icon-wrap--light {
          background: rgba(139, 92, 246, 0.10);
          border-color: rgba(139, 92, 246, 0.16);
        }

        .nx-cred-icon {
          width: 18px;
          height: 18px;
          color: #8b5cf6;
        }
        .nx-cred-btn--bluelight .nx-cred-icon {
          color: #f59e0b;
        }

        .nx-cred-text {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .nx-cred-title {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .nx-cred-title--dark { color: rgba(255, 255, 255, 0.8); }
        .nx-cred-title--light { color: rgba(0, 0, 0, 0.75); }
        .nx-cred-title--bluelight { color: rgba(251, 191, 36, 0.8); }

        .nx-cred-desc {
          font-size: 0.72rem;
        }
        .nx-cred-desc--dark { color: rgba(255, 255, 255, 0.3); }
        .nx-cred-desc--light { color: rgba(0, 0, 0, 0.35); }
        .nx-cred-desc--bluelight { color: rgba(251, 191, 36, 0.35); }

        .nx-cred-arrow {
          opacity: 0.3;
          transition: all 0.3s;
          flex-shrink: 0;
        }
        .nx-cred-arrow--dark { color: #fff; }
        .nx-cred-arrow--light { color: #000; }
        .nx-cred-arrow--bluelight { color: #f59e0b; }
        .nx-cred-btn:hover .nx-cred-arrow {
          opacity: 0.7;
          transform: translate(2px, -2px);
        }

        /* ═══════════════════════
           FEATURE PILLS (Glassmorphism + Shimmer)
           ═══════════════════════ */
        .nx-pills {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-top: 2.5rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .nx-pill {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.85rem;
          border-radius: 100px;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          color: rgba(255, 255, 255, 0.35);
          transition: border-color 0.3s, color 0.3s, background 0.3s;
          overflow: hidden;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .nx-pill:hover {
          border-color: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.6);
        }

        .nx-pill--light {
          border-color: rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.5);
          color: rgba(0, 0, 0, 0.35);
        }
        .nx-pill--light:hover {
          border-color: rgba(0, 0, 0, 0.1);
          color: rgba(0, 0, 0, 0.6);
          background: rgba(255, 255, 255, 0.8);
        }

        .nx-pill--bluelight {
          border-color: rgba(251, 191, 36, 0.08);
          background: rgba(251, 191, 36, 0.02);
          color: rgba(251, 191, 36, 0.35);
        }
        .nx-pill--bluelight:hover {
          border-color: rgba(251, 191, 36, 0.15);
          color: rgba(251, 191, 36, 0.6);
        }

        /* Pill shimmer on hover */
        .nx-pill-shimmer {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.04) 50%,
            transparent 100%
          );
          transform: translateX(-100%);
          pointer-events: none;
        }
        .nx-pill:hover .nx-pill-shimmer {
          animation: nx-pill-shimmer 1.2s ease-out forwards;
        }
        .nx-pill--bluelight .nx-pill-shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(251, 191, 36, 0.06) 50%,
            transparent 100%
          );
        }
        @keyframes nx-pill-shimmer {
          to { transform: translateX(100%); }
        }

        /* ═══════════════════════
           FOOTER
           ═══════════════════════ */
        .nx-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          justify-content: center;
          padding: 1.25rem 2rem;
          pointer-events: none;
        }

        .nx-footer-inner {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .nx-footer-text { font-size: 0.8rem; }
        .nx-footer-text--dark { color: rgba(255, 255, 255, 0.25); }
        .nx-footer-text--light { color: rgba(0, 0, 0, 0.3); }
        .nx-footer-text--bluelight { color: rgba(251, 191, 36, 0.3); }

        .nx-footer-name { font-weight: 600; }
        .nx-footer-name--dark { color: rgba(255, 255, 255, 0.5); }
        .nx-footer-name--light { color: rgba(0, 0, 0, 0.55); }
        .nx-footer-name--bluelight { color: rgba(251, 191, 36, 0.55); }

        .nx-footer-divider {
          width: 3px;
          height: 3px;
          border-radius: 50%;
        }
        .nx-footer-divider--dark { background: rgba(255, 255, 255, 0.15); }
        .nx-footer-divider--light { background: rgba(0, 0, 0, 0.12); }
        .nx-footer-divider--bluelight { background: rgba(251, 191, 36, 0.2); }

        .nx-footer-role {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .nx-footer-role--dark { color: rgba(255, 255, 255, 0.18); }
        .nx-footer-role--light { color: rgba(0, 0, 0, 0.22); }
        .nx-footer-role--bluelight { color: rgba(251, 191, 36, 0.22); }

        /* ═══════════════════════
           RESPONSIVE
           ═══════════════════════ */
        @media (max-width: 640px) {
          .nx-topbar { padding: 0.75rem 1rem; }
          .nx-orb { width: 220px; height: 220px; }
          .nx-actions { gap: 0.75rem; }
          .nx-start-btn { padding: 0.75rem 1.75rem; font-size: 0.85rem; }
          .nx-cred-btn { padding: 0.7rem 1rem; }
          .nx-footer { padding: 1rem; }
          .nx-pills { gap: 0.4rem; }
          .nx-geo-accent { display: none; }
        }
        @media (max-width: 380px) {
          .nx-orb { width: 160px; height: 160px; }
          .nx-orb-ring--2 { inset: 12px; }
          .nx-orb-ring--3 { inset: 30px; }
        }
      `}</style>
    </>
  );
}
