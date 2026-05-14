"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Cpu, Shield, Rocket, ArrowUpRight, Sparkles, KeyRound, Globe } from "lucide-react";

/* ─── Data ─── */
const features = [
  {
    icon: Cpu,
    title: "AI Workspace",
    description:
      "Collaborative AI workspace for development, management, and communication.",
    accentDark: "rgba(6, 182, 212, 1)",
    glowDark: "rgba(6, 182, 212, 0.15)",
    accentLight: "rgba(6, 150, 180, 1)",
    glowLight: "rgba(6, 150, 180, 0.10)",
  },
  {
    icon: Shield,
    title: "OTP Authentication",
    description:
      "Secure email-based login with 6-digit OTP and 5-minute expiry.",
    accentDark: "rgba(52, 211, 153, 1)",
    glowDark: "rgba(52, 211, 153, 0.15)",
    accentLight: "rgba(16, 160, 120, 1)",
    glowLight: "rgba(16, 160, 120, 0.10)",
  },
  {
    icon: Rocket,
    title: "Live Protocol",
    description:
      "Trishul Protocol v5.0 — structured 7-stage development pipeline.",
    accentDark: "rgba(168, 85, 247, 1)",
    glowDark: "rgba(168, 85, 247, 0.15)",
    accentLight: "rgba(140, 60, 210, 1)",
    glowLight: "rgba(140, 60, 210, 0.10)",
  },
];

const MARQUEE_TEXT =
  "DEVELOPMENT \u2022 WORKSPACE \u2022 DESIGN \u2022 COLLABORATION \u2022 DEPLOYMENT \u2022 PROTOCOL \u2022 ";

/* ─── Component ─── */
export default function TrishulWorkspacePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const userName = session?.user?.name || "User";
  const userRole = (session?.user?.role || "DEVELOPER").replace(/_/g, " ");

  // Prevent hydration mismatch — only render theme-dependent styles after mount
  useEffect(() => setMounted(true), []);

  // Derive mode: "dark", "light", or "bluelight"
  const mode = mounted
    ? resolvedTheme === "bluelight"
      ? "bluelight"
      : resolvedTheme === "dark"
      ? "dark"
      : "light"
    : "dark"; // SSR default

  // Custom cursor state
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const cursorPos = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number>(0);

  // Magnetic button state
  const magneticRef = useRef<HTMLButtonElement>(null);
  const [magneticOffset, setMagneticOffset] = useState({ x: 0, y: 0 });

  // Refs for Intersection Observer
  const marqueeRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [marqueeVisible, setMarqueeVisible] = useState(false);
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const [launchVisible, setLaunchVisible] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);

  /* ── Custom cursor with lerp ── */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };

    // Magnetic effect for button
    if (magneticRef.current) {
      const rect = magneticRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distX = e.clientX - centerX;
      const distY = e.clientY - centerY;
      const dist = Math.sqrt(distX * distX + distY * distY);

      if (dist < 200) {
        const pull = (1 - dist / 200) * 0.35;
        setMagneticOffset({ x: distX * pull, y: distY * pull });
      } else {
        setMagneticOffset({ x: 0, y: 0 });
      }
    }
  }, []);

  useEffect(() => {
    const animateCursor = () => {
      const lerp = 0.12;
      cursorPos.current.x +=
        (mousePos.current.x - cursorPos.current.x) * lerp;
      cursorPos.current.y +=
        (mousePos.current.y - cursorPos.current.y) * lerp;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${cursorPos.current.x - 20}px, ${cursorPos.current.y - 20}px, 0)`;
      }
      if (cursorDotRef.current) {
        cursorDotRef.current.style.transform = `translate3d(${mousePos.current.x - 4}px, ${mousePos.current.y - 4}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(animateCursor);
    };

    window.addEventListener("mousemove", handleMouseMove);
    rafRef.current = requestAnimationFrame(animateCursor);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  /* ── Intersection Observer ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            if (target.dataset.section === "marquee") setMarqueeVisible(true);
            if (target.dataset.section === "features") setFeaturesVisible(true);
            if (target.dataset.section === "launch") setLaunchVisible(true);
            if (target.dataset.section === "footer") setFooterVisible(true);
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = [
      { ref: marqueeRef, key: "marquee" },
      { ref: featuresRef, key: "features" },
      { ref: launchRef, key: "launch" },
      { ref: footerRef, key: "footer" },
    ];

    elements.forEach(({ ref, key }) => {
      if (ref.current) {
        ref.current.dataset.section = key;
        observer.observe(ref.current);
      }
    });

    return () => observer.disconnect();
  }, []);

  const handleLaunch = useCallback(() => {
    window.open("https://chat.z.ai", "_blank");
  }, []);

  const handleSecondWorkspace = useCallback(() => {
    router.push("/dashboard/workspace");
  }, [router]);

  const handleClaimCredentials = useCallback(() => {
    router.push("/dashboard/credentials");
  }, [router]);

  // Theme-aware accent values for cards
  const cardAccent = (f: (typeof features)[number]) =>
    mode === "light" ? f.accentLight : f.accentDark;
  const cardGlow = (f: (typeof features)[number]) =>
    mode === "light" ? f.glowLight : f.glowDark;

  return (
    <>
      {/* ── Custom Cursor ── */}
      <div
        ref={cursorRef}
        className={`trishul-cursor trishul-cursor--${mode}`}
        aria-hidden
      />
      <div
        ref={cursorDotRef}
        className={`trishul-cursor-dot trishul-cursor-dot--${mode}`}
        aria-hidden
      />

      {/* ── Full-bleed wrapper — counters dashboard layout padding ── */}
      <div className={`trishul-root trishul-root--${mode}`}>
        {/* Noise / Film grain overlay */}
        <div className={`trishul-noise trishul-noise--${mode}`} aria-hidden />

        {/* Vignette overlay */}
        <div className={`trishul-vignette trishul-vignette--${mode}`} aria-hidden />

        {/* Ambient gradient orbs */}
        <div className={`trishul-ambient trishul-ambient--${mode}`} aria-hidden />

        {/* ──────── HERO ──────── */}
        <section className="trishul-hero">
          {/* Protocol badge */}
          <div className="trishul-badge-wrap">
            <div className={`trishul-badge trishul-badge--${mode}`}>
              <Sparkles className={`trishul-badge-icon trishul-badge-icon--${mode}`} />
              <span>TRISHUL PROTOCOL v5.0</span>
            </div>
          </div>

          {/* Massive title — letter-by-letter reveal */}
          <h1
            className={`trishul-title-stroke trishul-title-stroke--${mode}`}
            aria-label="TRISHUL"
          >
            {"TRISHUL".split("").map((char, i) => (
              <span
                key={i}
                className="trishul-letter"
                style={{ animationDelay: `${0.6 + i * 0.07}s` }}
              >
                {char}
              </span>
            ))}
          </h1>

          {/* "WORKSPACE" gradient line */}
          <p
            className={`trishul-subtitle trishul-subtitle--${mode}`}
            style={{ animationDelay: "1.2s" }}
          >
            WORKSPACE
          </p>

          {/* Separator line that draws in */}
          <div className="trishul-line-wrap">
            <div
              className={`trishul-line trishul-line--${mode}`}
              style={{ animationDelay: "1.5s" }}
            />
          </div>

          {/* Scroll hint */}
          <div
            className="trishul-scroll-hint"
            style={{ animationDelay: "2.2s" }}
          >
            <span className={`trishul-scroll-text trishul-scroll-text--${mode}`}>
              SCROLL
            </span>
            <div className={`trishul-scroll-line trishul-scroll-line--${mode}`} />
          </div>
        </section>

        {/* ──────── MARQUEE BAND ──────── */}
        <section
          ref={marqueeRef}
          className={`trishul-marquee trishul-marquee--${mode} ${marqueeVisible ? "trishul-marquee--visible" : ""}`}
        >
          <div className="trishul-marquee-track" aria-hidden>
            <span className={`trishul-marquee-text trishul-marquee-text--${mode}`}>
              {MARQUEE_TEXT}
              {MARQUEE_TEXT}
              {MARQUEE_TEXT}
              {MARQUEE_TEXT}
            </span>
          </div>
        </section>

        {/* ──────── FEATURES ──────── */}
        <section ref={featuresRef} className="trishul-features">
          <div
            className={`trishul-features-grid ${featuresVisible ? "trishul-features-grid--visible" : ""}`}
          >
            {features.map((f, idx) => (
              <div
                key={f.title}
                className={`trishul-card trishul-card--${mode}`}
                style={{
                  "--card-accent": cardAccent(f),
                  "--card-glow": cardGlow(f),
                  animationDelay: `${idx * 0.18}s`,
                } as React.CSSProperties}
              >
                {/* Glow backdrop on hover */}
                <div className="trishul-card-glow" />
                <div className="trishul-card-content">
                  <div className={`trishul-card-icon-wrap trishul-card-icon-wrap--${mode}`}>
                    <f.icon className="trishul-card-icon" />
                  </div>
                  <h3 className={`trishul-card-title trishul-card-title--${mode}`}>
                    {f.title}
                  </h3>
                  <p className={`trishul-card-desc trishul-card-desc--${mode}`}>
                    {f.description}
                  </p>
                  <div className="trishul-card-line" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ──────── LAUNCH ──────── */}
        <section ref={launchRef} className="trishul-launch">
          <div
            className={`trishul-launch-inner ${launchVisible ? "trishul-launch-inner--visible" : ""}`}
          >
            <p className={`trishul-launch-pre trishul-launch-pre--${mode}`}>
              Ready to build?
            </p>

            {/* Primary LAUNCH — chat.z.ai */}
            <button
              ref={magneticRef}
              onClick={handleLaunch}
              className={`trishul-launch-btn trishul-launch-btn--${mode}`}
              style={{
                transform: `translate3d(${magneticOffset.x}px, ${magneticOffset.y}px, 0)`,
              }}
              type="button"
            >
              <span className="trishul-launch-btn-text">LAUNCH</span>
              <ArrowUpRight className="trishul-launch-arrow" />
            </button>
            <p className={`trishul-launch-sub trishul-launch-sub--${mode}`}>
              Opens workspace in a new tab
            </p>

            {/* Secondary action buttons */}
            <div className="trishul-actions-row">
              <button
                onClick={handleSecondWorkspace}
                className={`trishul-action-btn trishul-action-btn--${mode}`}
                type="button"
              >
                <Globe className="trishul-action-icon" />
                <div className="trishul-action-text-wrap">
                  <span className={`trishul-action-title trishul-action-title--${mode}`}>2nd Workspace</span>
                  <span className={`trishul-action-desc trishul-action-desc--${mode}`}>TrishulHub AI Chat</span>
                </div>
                <ArrowUpRight className="trishul-action-arrow" />
              </button>

              <button
                onClick={handleClaimCredentials}
                className={`trishul-action-btn trishul-action-btn--${mode}`}
                type="button"
              >
                <KeyRound className="trishul-action-icon" />
                <div className="trishul-action-text-wrap">
                  <span className={`trishul-action-title trishul-action-title--${mode}`}>Claim Credentials</span>
                  <span className={`trishul-action-desc trishul-action-desc--${mode}`}>ID & Password</span>
                </div>
                <ArrowUpRight className="trishul-action-arrow" />
              </button>
            </div>
          </div>
        </section>

        {/* ──────── FOOTER ──────── */}
        <footer
          ref={footerRef}
          className={`trishul-footer trishul-footer--${mode} ${footerVisible ? "trishul-footer--visible" : ""}`}
        >
          <div className="trishul-footer-inner">
            <p className={`trishul-footer-welcome trishul-footer-welcome--${mode}`}>
              Welcome back,{" "}
              <span className={`trishul-footer-name trishul-footer-name--${mode}`}>
                {userName}
              </span>
            </p>
            <span className={`trishul-footer-role trishul-footer-role--${mode}`}>
              {userRole}
            </span>
          </div>
          <p className={`trishul-footer-copy trishul-footer-copy--${mode}`}>
            &copy; {new Date().getFullYear()} TrishulHub &mdash; AI-Powered
            Workspace
          </p>
        </footer>
      </div>

      {/* ── Scoped Keyframes & Styles ── */}
      <style jsx global>{`
        /* ═══════════════════════════════════
           TRISHUL WORKSPACE — Lusion-inspired
           DARK / LIGHT / BLUELIGHT
           ═══════════════════════════════════ */

        /* Hide cursor on touch devices */
        @media (pointer: coarse) {
          .trishul-cursor,
          .trishul-cursor-dot {
            display: none !important;
          }
          .trishul-root,
          .trishul-root * {
            cursor: auto !important;
          }
          /* Disable card hover scale on touch */
          .trishul-card:hover {
            transform: none !important;
          }
          /* Disable launch button glow on touch */
          .trishul-launch-btn--dark:hover::before,
          .trishul-launch-btn--light:hover::before,
          .trishul-launch-btn--bluelight:hover::before {
            opacity: 0 !important;
          }
          .trishul-launch-btn--dark:hover,
          .trishul-launch-btn--light:hover,
          .trishul-launch-btn--bluelight:hover {
            box-shadow: none !important;
          }
        }

        /* ── Cursor: dark ── */
        .trishul-root--dark,
        .trishul-root--dark * {
          cursor: none !important;
        }
        /* ── Cursor: light ── */
        .trishul-root--light,
        .trishul-root--light * {
          cursor: none !important;
        }
        /* ── Cursor: bluelight ── */
        .trishul-root--bluelight,
        .trishul-root--bluelight * {
          cursor: none !important;
        }

        /* ── Custom cursor base ── */
        .trishul-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 99999;
          will-change: transform;
          mix-blend-mode: difference;
          transition: width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      border-color 0.3s ease;
        }
        .trishul-cursor--dark {
          border: 1.5px solid rgba(255, 255, 255, 0.35);
        }
        .trishul-cursor--light {
          border: 1.5px solid rgba(0, 0, 0, 0.25);
        }
        .trishul-cursor--bluelight {
          border: 1.5px solid rgba(255, 200, 100, 0.35);
        }

        .trishul-cursor-dot {
          position: fixed;
          top: 0;
          left: 0;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 99999;
          will-change: transform;
        }
        .trishul-cursor-dot--dark {
          background: #fff;
        }
        .trishul-cursor-dot--light {
          background: #1a1a2e;
        }
        .trishul-cursor-dot--bluelight {
          background: #fbbf24;
        }

        /* ═══════════════════════════════════
           ROOT WRAPPER
           ═══════════════════════════════════ */
        .trishul-root {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          margin: -1.25rem;
          margin-top: -1.25rem;
          transition: background 0.5s ease;
        }
        @media (min-width: 768px) {
          .trishul-root {
            margin: -2rem;
            margin-top: -2rem;
          }
        }

        /* DARK */
        .trishul-root--dark {
          background: #050505;
        }
        /* LIGHT */
        .trishul-root--light {
          background: #f8f9fc;
        }
        /* BLUELIGHT */
        .trishul-root--bluelight {
          background: #0c0a09;
        }

        /* ── Noise overlay ── */
        .trishul-noise {
          position: fixed;
          inset: 0;
          z-index: 9000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 180px 180px;
          transition: opacity 0.5s ease;
        }
        .trishul-noise--dark {
          opacity: 0.035;
        }
        .trishul-noise--light {
          opacity: 0.018;
        }
        .trishul-noise--bluelight {
          opacity: 0.025;
        }

        /* ── Vignette ── */
        .trishul-vignette {
          position: fixed;
          inset: 0;
          z-index: 8999;
          pointer-events: none;
          transition: background 0.5s ease;
        }
        .trishul-vignette--dark {
          background: radial-gradient(
            ellipse 70% 60% at 50% 50%,
            transparent 0%,
            rgba(0, 0, 0, 0.55) 100%
          );
        }
        .trishul-vignette--light {
          background: radial-gradient(
            ellipse 70% 60% at 50% 50%,
            transparent 0%,
            rgba(200, 210, 230, 0.25) 100%
          );
        }
        .trishul-vignette--bluelight {
          background: radial-gradient(
            ellipse 70% 60% at 50% 50%,
            transparent 0%,
            rgba(0, 0, 0, 0.50) 100%
          );
        }

        /* ── Ambient gradient orbs ── */
        .trishul-ambient {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .trishul-ambient::before,
        .trishul-ambient::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          transition: background 0.5s ease;
        }

        /* DARK orbs */
        .trishul-ambient--dark::before {
          width: 600px; height: 600px;
          top: -15%; left: -10%;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%);
          animation: trishul-float-a 14s ease-in-out infinite;
        }
        .trishul-ambient--dark::after {
          width: 500px; height: 500px;
          bottom: -10%; right: -8%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.07) 0%, transparent 70%);
          animation: trishul-float-b 18s ease-in-out infinite;
        }

        /* LIGHT orbs */
        .trishul-ambient--light::before {
          width: 600px; height: 600px;
          top: -15%; left: -10%;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%);
          animation: trishul-float-a 14s ease-in-out infinite;
        }
        .trishul-ambient--light::after {
          width: 500px; height: 500px;
          bottom: -10%; right: -8%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.05) 0%, transparent 70%);
          animation: trishul-float-b 18s ease-in-out infinite;
        }

        /* BLUELIGHT orbs */
        .trishul-ambient--bluelight::before {
          width: 600px; height: 600px;
          top: -15%; left: -10%;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.06) 0%, transparent 70%);
          animation: trishul-float-a 14s ease-in-out infinite;
        }
        .trishul-ambient--bluelight::after {
          width: 500px; height: 500px;
          bottom: -10%; right: -8%;
          background: radial-gradient(circle, rgba(217, 119, 6, 0.05) 0%, transparent 70%);
          animation: trishul-float-b 18s ease-in-out infinite;
        }

        /* ═══════════════════════════════════
           HERO
           ═══════════════════════════════════ */
        .trishul-hero {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 4rem 1rem 3rem;
          text-align: center;
        }

        /* Protocol badge — base */
        .trishul-badge-wrap {
          opacity: 0;
          animation: trishul-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
        }
        .trishul-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 1.2rem;
          border-radius: 100px;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          backdrop-filter: blur(12px);
          transition: border-color 0.4s ease, background 0.4s ease, color 0.4s ease;
        }
        .trishul-badge--dark {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.5);
        }
        .trishul-badge--light {
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(255, 255, 255, 0.7);
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          color: rgba(0, 0, 0, 0.45);
        }
        .trishul-badge--bluelight {
          border: 1px solid rgba(251, 191, 36, 0.15);
          background: rgba(251, 191, 36, 0.05);
          color: rgba(251, 191, 36, 0.6);
        }

        .trishul-badge-icon {
          width: 12px;
          height: 12px;
        }
        .trishul-badge-icon--dark {
          color: rgba(251, 191, 36, 0.8);
        }
        .trishul-badge-icon--light {
          color: rgba(217, 119, 6, 0.8);
        }
        .trishul-badge-icon--bluelight {
          color: rgba(251, 191, 36, 0.9);
        }

        /* Massive title — outlined text */
        .trishul-title-stroke {
          font-size: clamp(4.5rem, 18vw, 16rem);
          font-weight: 900;
          line-height: 0.85;
          letter-spacing: -0.03em;
          color: transparent;
          margin: 2.5rem 0 0.5rem;
          display: flex;
          justify-content: center;
          user-select: none;
          overflow: hidden;
        }
        .trishul-title-stroke--dark {
          -webkit-text-stroke: 2px rgba(255, 255, 255, 0.22);
        }
        @media (max-width: 767px) {
          .trishul-title-stroke--dark {
            -webkit-text-stroke: 1.5px rgba(255, 255, 255, 0.22);
          }
        }
        .trishul-title-stroke--light {
          -webkit-text-stroke: 2px rgba(20, 20, 60, 0.12);
        }
        @media (max-width: 767px) {
          .trishul-title-stroke--light {
            -webkit-text-stroke: 1.5px rgba(20, 20, 60, 0.12);
          }
        }
        .trishul-title-stroke--bluelight {
          -webkit-text-stroke: 2px rgba(251, 191, 36, 0.18);
        }
        @media (max-width: 767px) {
          .trishul-title-stroke--bluelight {
            -webkit-text-stroke: 1.5px rgba(251, 191, 36, 0.18);
          }
        }

        /* Letter animation */
        .trishul-letter {
          display: inline-block;
          opacity: 0;
          transform: translateY(100%) rotateX(-80deg);
          animation: trishul-letter-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transition: color 0.3s ease, -webkit-text-stroke-color 0.3s ease;
        }
        .trishul-root--dark .trishul-letter:hover {
          color: #fff;
          -webkit-text-stroke-color: #fff;
        }
        .trishul-root--light .trishul-letter:hover {
          color: #1a1a2e;
          -webkit-text-stroke-color: #1a1a2e;
        }
        .trishul-root--bluelight .trishul-letter:hover {
          color: #fbbf24;
          -webkit-text-stroke-color: #fbbf24;
        }

        /* Subtitle — gradient fill */
        .trishul-subtitle {
          font-size: clamp(3rem, 14vw, 13rem);
          font-weight: 900;
          line-height: 0.9;
          letter-spacing: -0.03em;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          opacity: 0;
          animation: trishul-fade-up 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          user-select: none;
        }
        .trishul-subtitle--dark {
          background-image: linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%);
        }
        .trishul-subtitle--light {
          background-image: linear-gradient(135deg, #0891b2 0%, #7c3aed 50%, #db2777 100%);
        }
        .trishul-subtitle--bluelight {
          background-image: linear-gradient(135deg, #f59e0b 0%, #d97706 40%, #fbbf24 100%);
        }

        /* Separator line */
        .trishul-line-wrap {
          width: 100%;
          max-width: 480px;
          margin: 3rem 0 2rem;
          height: 1px;
          overflow: hidden;
          transition: background 0.4s ease;
        }
        .trishul-line-wrap:has(.trishul-line--dark) {
          background: rgba(255, 255, 255, 0.04);
        }
        .trishul-line-wrap:has(.trishul-line--light) {
          background: rgba(0, 0, 0, 0.06);
        }
        .trishul-line-wrap:has(.trishul-line--bluelight) {
          background: rgba(251, 191, 36, 0.06);
        }

        .trishul-line {
          height: 100%;
          width: 0;
          animation: trishul-line-grow 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .trishul-line--dark {
          background: linear-gradient(
            90deg, transparent, rgba(6, 182, 212, 0.5), rgba(168, 85, 247, 0.5), rgba(236, 72, 153, 0.5), transparent
          );
        }
        .trishul-line--light {
          background: linear-gradient(
            90deg, transparent, rgba(8, 145, 178, 0.45), rgba(124, 58, 237, 0.45), rgba(219, 39, 119, 0.45), transparent
          );
        }
        .trishul-line--bluelight {
          background: linear-gradient(
            90deg, transparent, rgba(245, 158, 11, 0.4), rgba(217, 119, 6, 0.4), rgba(251, 191, 36, 0.4), transparent
          );
        }

        /* Scroll hint */
        .trishul-scroll-hint {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          opacity: 0;
          animation: trishul-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .trishul-scroll-text {
          font-size: 0.6rem;
          font-weight: 500;
          letter-spacing: 0.25em;
          transition: color 0.4s ease;
        }
        .trishul-scroll-text--dark {
          color: rgba(255, 255, 255, 0.2);
        }
        .trishul-scroll-text--light {
          color: rgba(0, 0, 0, 0.15);
        }
        .trishul-scroll-text--bluelight {
          color: rgba(251, 191, 36, 0.25);
        }

        .trishul-scroll-line {
          width: 1px;
          height: 40px;
          animation: trishul-scroll-pulse 2s ease-in-out infinite;
          transition: background 0.4s ease;
        }
        .trishul-scroll-line--dark {
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.2), transparent);
        }
        .trishul-scroll-line--light {
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0.15), transparent);
        }
        .trishul-scroll-line--bluelight {
          background: linear-gradient(to bottom, rgba(251, 191, 36, 0.25), transparent);
        }

        /* ═══════════════════════════════════
           MARQUEE
           ═══════════════════════════════════ */
        .trishul-marquee {
          position: relative;
          z-index: 1;
          overflow: hidden;
          padding: 1.25rem 0;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      background 0.4s ease,
                      border-color 0.4s ease;
        }
        .trishul-marquee--dark {
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .trishul-marquee--light {
          background: rgba(255, 255, 255, 0.6);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .trishul-marquee--bluelight {
          background: rgba(251, 191, 36, 0.03);
          border-top: 1px solid rgba(251, 191, 36, 0.08);
          border-bottom: 1px solid rgba(251, 191, 36, 0.08);
        }
        .trishul-marquee--visible {
          opacity: 1;
          transform: translateY(0);
        }

        .trishul-marquee-track {
          display: flex;
          width: max-content;
          animation: trishul-marquee-scroll 35s linear infinite;
        }
        .trishul-marquee-text {
          font-size: clamp(0.75rem, 1.5vw, 1rem);
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          white-space: nowrap;
          padding-right: 0;
          transition: color 0.4s ease;
        }
        .trishul-marquee-text--dark {
          color: rgba(255, 255, 255, 0.12);
        }
        .trishul-marquee-text--light {
          color: rgba(0, 0, 0, 0.10);
        }
        .trishul-marquee-text--bluelight {
          color: rgba(251, 191, 36, 0.12);
        }

        /* ═══════════════════════════════════
           FEATURES
           ═══════════════════════════════════ */
        .trishul-features {
          position: relative;
          z-index: 1;
          padding: 6rem 1.5rem;
          display: flex;
          justify-content: center;
        }
        @media (min-width: 768px) {
          .trishul-hero {
            padding: 6rem 1.5rem 4rem;
          }
        }

        @media (min-width: 1024px) {
          .trishul-hero {
            padding: 6rem 2rem 4rem;
          }
        }

        .trishul-features {
          position: relative;
          z-index: 1;
          padding: 4rem 1rem;
          display: flex;
          justify-content: center;
        }
        @media (min-width: 768px) {
          .trishul-features {
            padding: 6rem 2rem;
          }
        }

        .trishul-features-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          width: 100%;
          max-width: 1100px;
        }
        @media (min-width: 768px) {
          .trishul-features-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
          }
        }

        /* Staggered entry */
        .trishul-features-grid > * {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-features-grid--visible > * {
          opacity: 1;
          transform: translateY(0);
        }

        /* Card — base */
        .trishul-card {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          transition: border-color 0.4s ease,
                      transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                      background 0.4s ease,
                      box-shadow 0.4s ease;
        }
        .trishul-card:hover {
          border-color: var(--card-accent) !important;
          transform: scale(1.02);
        }

        /* DARK card */
        .trishul-card--dark {
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }
        .trishul-card--dark:hover {
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3);
        }
        /* LIGHT card */
        .trishul-card--light {
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(16px);
        }
        .trishul-card--light:hover {
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0,0,0,0.03);
          background: rgba(255, 255, 255, 0.95);
        }
        /* BLUELIGHT card */
        .trishul-card--bluelight {
          border: 1px solid rgba(251, 191, 36, 0.08);
          background: rgba(251, 191, 36, 0.03);
        }
        .trishul-card--bluelight:hover {
          box-shadow: 0 8px 40px rgba(251, 191, 36, 0.05);
        }

        .trishul-card-glow {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.5s ease;
          background: radial-gradient(
            ellipse 60% 50% at 50% 0%,
            var(--card-glow),
            transparent 70%
          );
          pointer-events: none;
        }
        .trishul-card:hover .trishul-card-glow {
          opacity: 1;
        }

        .trishul-card-content {
          position: relative;
          z-index: 1;
          padding: 2rem 1.75rem 1.75rem;
        }

        .trishul-card-icon-wrap {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          margin-bottom: 1.5rem;
          transition: border-color 0.4s ease, background 0.4s ease;
        }
        .trishul-card--dark .trishul-card-icon-wrap {
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
        }
        .trishul-card--light .trishul-card-icon-wrap {
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(0, 0, 0, 0.03);
        }
        .trishul-card--bluelight .trishul-card-icon-wrap {
          border: 1px solid rgba(251, 191, 36, 0.1);
          background: rgba(251, 191, 36, 0.05);
        }
        .trishul-card:hover .trishul-card-icon-wrap {
          border-color: var(--card-accent);
          background: var(--card-glow);
        }

        .trishul-card-icon {
          width: 22px;
          height: 22px;
          color: var(--card-accent);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-card:hover .trishul-card-icon {
          transform: scale(1.15) rotate(-5deg);
        }

        .trishul-card-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 0.6rem;
          letter-spacing: -0.01em;
          transition: color 0.4s ease;
        }
        .trishul-card-title--dark {
          color: rgba(255, 255, 255, 0.9);
        }
        .trishul-card-title--light {
          color: rgba(20, 20, 60, 0.9);
        }
        .trishul-card-title--bluelight {
          color: rgba(255, 220, 150, 0.9);
        }

        .trishul-card-desc {
          font-size: 0.82rem;
          line-height: 1.6;
          transition: color 0.4s ease;
        }
        .trishul-card-desc--dark {
          color: rgba(255, 255, 255, 0.35);
        }
        .trishul-card-desc--light {
          color: rgba(0, 0, 0, 0.4);
        }
        .trishul-card-desc--bluelight {
          color: rgba(251, 191, 36, 0.4);
        }

        .trishul-card-line {
          height: 1px;
          margin-top: 1.5rem;
          width: 0;
          background: var(--card-accent);
          transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-card:hover .trishul-card-line {
          width: 100%;
        }

        /* ═══════════════════════════════════
           LAUNCH
           ═══════════════════════════════════ */
        .trishul-launch {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: center;
          padding: 3rem 1rem 4rem;
        }

        .trishul-launch-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-launch-inner--visible {
          opacity: 1;
          transform: translateY(0);
        }

        .trishul-launch-pre {
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: 2rem;
          transition: color 0.4s ease;
        }
        .trishul-launch-pre--dark {
          color: rgba(255, 255, 255, 0.25);
        }
        .trishul-launch-pre--light {
          color: rgba(0, 0, 0, 0.2);
        }
        .trishul-launch-pre--bluelight {
          color: rgba(251, 191, 36, 0.35);
        }

        .trishul-launch-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1.1rem 2.5rem;
          border: none;
          border-radius: 100px;
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          outline: none;
          will-change: transform;
          background-size: 200% 200%;
          animation: trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn:active {
          transform: scale(0.97) !important;
        }

        /* DARK btn */
        .trishul-launch-btn--dark {
          background: linear-gradient(135deg, #06b6d4, #a855f7, #ec4899);
          animation: trishul-btn-glow-dark 3s ease-in-out infinite,
                     trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn--dark:hover {
          background-position: 100% 50%;
          box-shadow: 0 0 50px rgba(6, 182, 212, 0.3),
                      0 0 100px rgba(168, 85, 247, 0.2),
                      0 0 150px rgba(236, 72, 153, 0.1);
        }
        .trishul-launch-btn--dark::before {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: 100px;
          background: linear-gradient(135deg, #06b6d4, #a855f7, #ec4899);
          background-size: 200% 200%;
          z-index: -1;
          opacity: 0;
          filter: blur(12px);
          transition: opacity 0.4s ease;
          animation: trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn--dark:hover::before {
          opacity: 0.6;
        }

        /* LIGHT btn */
        .trishul-launch-btn--light {
          background: linear-gradient(135deg, #0891b2, #7c3aed, #db2777);
          color: #fff;
          animation: trishul-btn-glow-light 3s ease-in-out infinite,
                     trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn--light:hover {
          background-position: 100% 50%;
          box-shadow: 0 0 40px rgba(8, 145, 178, 0.25),
                      0 0 80px rgba(124, 58, 237, 0.15),
                      0 0 120px rgba(219, 39, 119, 0.08);
        }
        .trishul-launch-btn--light::before {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: 100px;
          background: linear-gradient(135deg, #0891b2, #7c3aed, #db2777);
          background-size: 200% 200%;
          z-index: -1;
          opacity: 0;
          filter: blur(12px);
          transition: opacity 0.4s ease;
          animation: trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn--light:hover::before {
          opacity: 0.5;
        }

        /* BLUELIGHT btn */
        .trishul-launch-btn--bluelight {
          background: linear-gradient(135deg, #d97706, #f59e0b, #fbbf24);
          color: #1a0f00;
          animation: trishul-btn-glow-bluelight 3s ease-in-out infinite,
                     trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn--bluelight:hover {
          background-position: 100% 50%;
          box-shadow: 0 0 40px rgba(251, 191, 36, 0.25),
                      0 0 80px rgba(217, 119, 6, 0.15),
                      0 0 120px rgba(245, 158, 11, 0.08);
        }
        .trishul-launch-btn--bluelight::before {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: 100px;
          background: linear-gradient(135deg, #d97706, #f59e0b, #fbbf24);
          background-size: 200% 200%;
          z-index: -1;
          opacity: 0;
          filter: blur(12px);
          transition: opacity 0.4s ease;
          animation: trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn--bluelight:hover::before {
          opacity: 0.5;
        }

        .trishul-launch-btn-text {
          position: relative;
          z-index: 1;
        }

        .trishul-launch-arrow {
          width: 20px;
          height: 20px;
          position: relative;
          z-index: 1;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-launch-btn:hover .trishul-launch-arrow {
          transform: translate(3px, -3px) rotate(-45deg);
        }

        .trishul-launch-sub {
          font-size: 0.7rem;
          margin-top: 1.5rem;
          letter-spacing: 0.04em;
          transition: color 0.4s ease;
        }
        .trishul-launch-sub--dark {
          color: rgba(255, 255, 255, 0.18);
        }
        .trishul-launch-sub--light {
          color: rgba(0, 0, 0, 0.15);
        }
        .trishul-launch-sub--bluelight {
          color: rgba(251, 191, 36, 0.25);
        }

        /* ═══════════════════════════════════
           SECONDARY ACTION BUTTONS
           ═══════════════════════════════════ */
        .trishul-actions-row {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .trishul-action-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.9rem 1.5rem;
          border-radius: 16px;
          border: none;
          outline: none;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.3s ease,
                      background 0.3s ease,
                      border-color 0.3s ease;
          min-width: 220px;
        }
        .trishul-action-btn:hover {
          transform: translateY(-2px);
        }
        .trishul-action-btn:active {
          transform: scale(0.98) !important;
        }

        .trishul-action-btn--dark {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .trishul-action-btn--dark:hover {
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .trishul-action-btn--light {
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }
        .trishul-action-btn--light:hover {
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
          border-color: rgba(0, 0, 0, 0.12);
        }

        .trishul-action-btn--bluelight {
          background: rgba(251, 191, 36, 0.05);
          border: 1px solid rgba(251, 191, 36, 0.12);
        }
        .trishul-action-btn--bluelight:hover {
          background: rgba(251, 191, 36, 0.1);
          box-shadow: 0 8px 30px rgba(251, 191, 36, 0.08);
          border-color: rgba(251, 191, 36, 0.25);
        }

        .trishul-action-icon {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }
        .trishul-action-icon--dark {
          color: rgba(6, 182, 212, 0.8);
        }
        .trishul-action-icon--light {
          color: rgba(8, 145, 178, 0.8);
        }
        .trishul-action-icon--bluelight {
          color: rgba(251, 191, 36, 0.8);
        }

        .trishul-action-text-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }

        .trishul-action-title {
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: color 0.3s ease;
        }
        .trishul-action-title--dark {
          color: rgba(255, 255, 255, 0.85);
        }
        .trishul-action-title--light {
          color: rgba(20, 20, 60, 0.85);
        }
        .trishul-action-title--bluelight {
          color: rgba(255, 220, 150, 0.85);
        }

        .trishul-action-desc {
          font-size: 0.65rem;
          font-weight: 400;
          transition: color 0.3s ease;
        }
        .trishul-action-desc--dark {
          color: rgba(255, 255, 255, 0.3);
        }
        .trishul-action-desc--light {
          color: rgba(0, 0, 0, 0.35);
        }
        .trishul-action-desc--bluelight {
          color: rgba(251, 191, 36, 0.4);
        }

        .trishul-action-arrow {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          margin-left: auto;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-action-arrow--dark {
          color: rgba(255, 255, 255, 0.2);
        }
        .trishul-action-arrow--light {
          color: rgba(0, 0, 0, 0.2);
        }
        .trishul-action-arrow--bluelight {
          color: rgba(251, 191, 36, 0.3);
        }
        .trishul-action-btn:hover .trishul-action-arrow {
          transform: translate(2px, -2px);
        }

        /* ═══════════════════════════════════
           FOOTER
           ═══════════════════════════════════ */
        .trishul-footer {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2rem 1.5rem 3rem;
          opacity: 0;
          transform: translateY(15px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-footer--visible {
          opacity: 1;
          transform: translateY(0);
        }

        .trishul-footer-inner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .trishul-footer-welcome {
          font-size: 0.8rem;
          transition: color 0.4s ease;
        }
        .trishul-footer-welcome--dark {
          color: rgba(255, 255, 255, 0.3);
        }
        .trishul-footer-welcome--light {
          color: rgba(0, 0, 0, 0.3);
        }
        .trishul-footer-welcome--bluelight {
          color: rgba(251, 191, 36, 0.35);
        }

        .trishul-footer-name {
          font-weight: 600;
          transition: color 0.4s ease;
        }
        .trishul-footer-name--dark {
          color: rgba(255, 255, 255, 0.7);
        }
        .trishul-footer-name--light {
          color: rgba(20, 20, 60, 0.7);
        }
        .trishul-footer-name--bluelight {
          color: rgba(251, 191, 36, 0.7);
        }

        .trishul-footer-role {
          display: inline-block;
          padding: 0.2rem 0.65rem;
          border-radius: 100px;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: border-color 0.4s ease, background 0.4s ease, color 0.4s ease;
        }
        .trishul-footer-role--dark {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.3);
        }
        .trishul-footer-role--light {
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(0, 0, 0, 0.03);
          color: rgba(0, 0, 0, 0.3);
        }
        .trishul-footer-role--bluelight {
          border: 1px solid rgba(251, 191, 36, 0.12);
          background: rgba(251, 191, 36, 0.05);
          color: rgba(251, 191, 36, 0.4);
        }

        .trishul-footer-copy {
          font-size: 0.65rem;
          letter-spacing: 0.05em;
          transition: color 0.4s ease;
        }
        .trishul-footer-copy--dark {
          color: rgba(255, 255, 255, 0.12);
        }
        .trishul-footer-copy--light {
          color: rgba(0, 0, 0, 0.12);
        }
        .trishul-footer-copy--bluelight {
          color: rgba(251, 191, 36, 0.18);
        }

        /* ═══════════════════════════════════
           RESPONSIVE — MOBILE / TABLET
           ═══════════════════════════════════ */

        /* ── Mobile (max-width: 639px / sm breakpoint) ── */
        @media (max-width: 639px) {
          /* Hero: tighter padding, shorter vh */
          .trishul-hero {
            min-height: 85vh;
            padding: 3rem 0.75rem 2rem;
          }

          /* Badge: smaller on tiny screens */
          .trishul-badge {
            padding: 0.35rem 0.9rem;
            font-size: 0.55rem;
            letter-spacing: 0.14em;
          }
          .trishul-badge-icon {
            width: 10px;
            height: 10px;
          }

          /* Title: tighter margins */
          .trishul-title-stroke {
            margin: 1.5rem 0 0.25rem;
          }

          /* Line separator: narrower margins */
          .trishul-line-wrap {
            max-width: 280px;
            margin: 2rem auto 1.5rem;
          }

          /* Scroll hint: smaller */
          .trishul-scroll-text {
            font-size: 0.5rem;
          }
          .trishul-scroll-line {
            height: 28px;
          }

          /* Marquee: readable on small phones */
          .trishul-marquee {
            padding: 1rem 0;
          }
          .trishul-marquee-text {
            font-size: 0.7rem;
            letter-spacing: 0.14em;
          }

          /* Features: tighter padding */
          .trishul-features {
            padding: 3rem 0.75rem;
          }
          .trishul-features-grid {
            gap: 1rem;
            max-width: 100%;
          }

          /* Card: smaller radius & padding on mobile */
          .trishul-card {
            border-radius: 16px;
          }
          .trishul-card-content {
            padding: 1.5rem 1.25rem 1.25rem;
          }
          .trishul-card-icon-wrap {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            margin-bottom: 1rem;
          }
          .trishul-card-icon {
            width: 18px;
            height: 18px;
          }
          .trishul-card-title {
            font-size: 1rem;
          }
          .trishul-card-desc {
            font-size: 0.78rem;
          }
          .trishul-card-line {
            margin-top: 1.25rem;
          }
          /* Launch: full-width button */
          .trishul-launch {
            padding: 2.5rem 1rem 3rem;
          }
          .trishul-launch-inner {
            width: 100%;
            max-width: 100%;
            padding: 0 0.5rem;
          }
          .trishul-launch-pre {
            font-size: 0.6rem;
            margin-bottom: 1.5rem;
          }
          .trishul-launch-btn {
            width: 100%;
            justify-content: center;
            padding: 1rem 2rem;
            font-size: 0.9rem;
            letter-spacing: 0.12em;
          }
          .trishul-launch-arrow {
            width: 18px;
            height: 18px;
          }
          .trishul-launch-sub {
            font-size: 0.6rem;
            margin-top: 1rem;
          }

          /* Footer: responsive layout */
          .trishul-footer {
            padding: 2rem 1rem 2.5rem;
          }
          .trishul-footer-inner {
            flex-direction: column;
            gap: 0.5rem;
            text-align: center;
          }
          .trishul-footer-welcome {
            font-size: 0.75rem;
          }
          .trishul-footer-copy {
            font-size: 0.58rem;
          }
        }

        /* ── Tablet (max-width: 767px / md breakpoint) ── */
        @media (max-width: 767px) {
          .trishul-hero {
            padding: 3.5rem 1rem 2.5rem;
          }

          /* Floating orbs: much smaller on mobile */
          .trishul-ambient--dark::before,
          .trishul-ambient--light::before,
          .trishul-ambient--bluelight::before {
            width: 320px !important;
            height: 320px !important;
          }
          .trishul-ambient--dark::after,
          .trishul-ambient--light::after,
          .trishul-ambient--bluelight::after {
            width: 280px !important;
            height: 280px !important;
          }

          /* Line separator: narrower on tablet */
          .trishul-line-wrap {
            max-width: 360px;
          }
        }

        /* ── Small phone (max-width: 374px / iPhone SE) ── */
        @media (max-width: 374px) {
          .trishul-badge {
            padding: 0.3rem 0.7rem;
            font-size: 0.5rem;
            letter-spacing: 0.12em;
          }
          .trishul-title-stroke {
            margin: 1rem 0 0.15rem;
          }
          .trishul-line-wrap {
            max-width: 220px;
            margin: 1.5rem auto 1rem;
          }
          .trishul-launch-btn {
            padding: 0.9rem 1.5rem;
            font-size: 0.85rem;
          }
          .trishul-card-content {
            padding: 1.25rem 1rem 1rem;
          }
        }

        /* ═══════════════════════════════════
           KEYFRAMES
           ═══════════════════════════════════ */

        @keyframes trishul-letter-in {
          0% {
            opacity: 0;
            transform: translateY(100%) rotateX(-80deg);
          }
          100% {
            opacity: 1;
            transform: translateY(0) rotateX(0deg);
          }
        }

        @keyframes trishul-fade-up {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes trishul-line-grow {
          0% { width: 0; }
          100% { width: 100%; }
        }

        @keyframes trishul-marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes trishul-btn-glow-dark {
          0%, 100% {
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.2),
                        0 0 40px rgba(168, 85, 247, 0.15),
                        0 0 0px rgba(236, 72, 153, 0);
          }
          50% {
            box-shadow: 0 0 30px rgba(6, 182, 212, 0.35),
                        0 0 60px rgba(168, 85, 247, 0.25),
                        0 0 90px rgba(236, 72, 153, 0.1);
          }
        }

        @keyframes trishul-btn-glow-light {
          0%, 100% {
            box-shadow: 0 0 15px rgba(8, 145, 178, 0.15),
                        0 0 30px rgba(124, 58, 237, 0.10),
                        0 0 0px rgba(219, 39, 119, 0);
          }
          50% {
            box-shadow: 0 0 25px rgba(8, 145, 178, 0.25),
                        0 0 50px rgba(124, 58, 237, 0.15),
                        0 0 75px rgba(219, 39, 119, 0.06);
          }
        }

        @keyframes trishul-btn-glow-bluelight {
          0%, 100% {
            box-shadow: 0 0 15px rgba(251, 191, 36, 0.15),
                        0 0 30px rgba(217, 119, 6, 0.10),
                        0 0 0px rgba(245, 158, 11, 0);
          }
          50% {
            box-shadow: 0 0 25px rgba(251, 191, 36, 0.30),
                        0 0 50px rgba(217, 119, 6, 0.20),
                        0 0 75px rgba(245, 158, 11, 0.08);
          }
        }

        @keyframes trishul-btn-gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes trishul-float-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 30px) scale(1.05); }
          66% { transform: translate(-20px, 50px) scale(0.97); }
        }

        @keyframes trishul-float-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-30px, -40px) scale(1.08); }
          70% { transform: translate(20px, -20px) scale(0.95); }
        }

        @keyframes trishul-scroll-pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scaleY(1);
          }
          50% {
            opacity: 0.7;
            transform: scaleY(1.2);
          }
        }
      `}</style>
    </>
  );
}
