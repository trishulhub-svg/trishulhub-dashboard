"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Cpu, Shield, Rocket, ArrowUpRight, Sparkles } from "lucide-react";

/* ─── Data ─── */
const features = [
  {
    icon: Cpu,
    title: "7 AI Agents",
    description:
      "Development, Sales, Finance, HR, Content, Support & Project Management.",
    accent: "rgba(6, 182, 212, 1)",
    glow: "rgba(6, 182, 212, 0.15)",
  },
  {
    icon: Shield,
    title: "OTP Authentication",
    description:
      "Secure email-based login with 6-digit OTP and 5-minute expiry.",
    accent: "rgba(52, 211, 153, 1)",
    glow: "rgba(52, 211, 153, 0.15)",
  },
  {
    icon: Rocket,
    title: "Live Protocol",
    description:
      "Trishul Protocol v4.0 — structured 7-stage development pipeline.",
    accent: "rgba(168, 85, 247, 1)",
    glow: "rgba(168, 85, 247, 0.15)",
  },
];

const MARQUEE_TEXT =
  "DEVELOPMENT \u2022 AI AGENTS \u2022 DESIGN \u2022 COLLABORATION \u2022 DEPLOYMENT \u2022 PROTOCOL \u2022 ";

/* ─── Component ─── */
export default function TrishulWorkspacePage() {
  const { data: session } = useSession();
  const userName = session?.user?.name || "User";
  const userRole = (session?.user?.role || "DEVELOPER").replace(/_/g, " ");

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

  return (
    <>
      {/* ── Custom Cursor ── */}
      <div ref={cursorRef} className="trishul-cursor" aria-hidden />
      <div ref={cursorDotRef} className="trishul-cursor-dot" aria-hidden />

      {/* ── Full-bleed wrapper — counters dashboard layout padding ── */}
      <div className="trishul-root">
        {/* Noise / Film grain overlay */}
        <div className="trishul-noise" aria-hidden />

        {/* Vignette overlay */}
        <div className="trishul-vignette" aria-hidden />

        {/* Ambient gradient orbs */}
        <div className="trishul-ambient" aria-hidden />

        {/* ──────── HERO ──────── */}
        <section className="trishul-hero">
          {/* Protocol badge */}
          <div className="trishul-badge-wrap">
            <div className="trishul-badge">
              <Sparkles className="trishul-badge-icon" />
              <span>TRISHUL PROTOCOL v4.0</span>
            </div>
          </div>

          {/* Massive title — letter-by-letter reveal */}
          <h1 className="trishul-title-stroke" aria-label="TRISHUL">
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
            className="trishul-subtitle"
            style={{ animationDelay: "1.2s" }}
          >
            WORKSPACE
          </p>

          {/* Separator line that draws in */}
          <div className="trishul-line-wrap">
            <div
              className="trishul-line"
              style={{ animationDelay: "1.5s" }}
            />
          </div>

          {/* Scroll hint */}
          <div className="trishul-scroll-hint" style={{ animationDelay: "2.2s" }}>
            <span className="trishul-scroll-text">SCROLL</span>
            <div className="trishul-scroll-line" />
          </div>
        </section>

        {/* ──────── MARQUEE BAND ──────── */}
        <section
          ref={marqueeRef}
          className={`trishul-marquee ${marqueeVisible ? "trishul-marquee--visible" : ""}`}
        >
          <div className="trishul-marquee-track" aria-hidden>
            <span className="trishul-marquee-text">
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
                className="trishul-card"
                style={{
                  "--card-accent": f.accent,
                  "--card-glow": f.glow,
                  animationDelay: `${idx * 0.18}s`,
                } as React.CSSProperties}
              >
                {/* Glow backdrop on hover */}
                <div className="trishul-card-glow" />
                <div className="trishul-card-content">
                  <div className="trishul-card-icon-wrap">
                    <f.icon className="trishul-card-icon" />
                  </div>
                  <h3 className="trishul-card-title">{f.title}</h3>
                  <p className="trishul-card-desc">{f.description}</p>
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
            <p className="trishul-launch-pre">Ready to build?</p>
            <button
              ref={magneticRef}
              onClick={handleLaunch}
              className="trishul-launch-btn"
              style={{
                transform: `translate3d(${magneticOffset.x}px, ${magneticOffset.y}px, 0)`,
              }}
              type="button"
            >
              <span className="trishul-launch-btn-text">LAUNCH</span>
              <ArrowUpRight className="trishul-launch-arrow" />
            </button>
            <p className="trishul-launch-sub">Opens chat.z.ai in a new tab</p>
          </div>
        </section>

        {/* ──────── FOOTER ──────── */}
        <footer
          ref={footerRef}
          className={`trishul-footer ${footerVisible ? "trishul-footer--visible" : ""}`}
        >
          <div className="trishul-footer-inner">
            <p className="trishul-footer-welcome">
              Welcome back,{" "}
              <span className="trishul-footer-name">{userName}</span>
            </p>
            <span className="trishul-footer-role">{userRole}</span>
          </div>
          <p className="trishul-footer-copy">
            &copy; {new Date().getFullYear()} TrishulHub &mdash; AI-Powered
            Workspace
          </p>
        </footer>
      </div>

      {/* ── Scoped Keyframes & Styles ── */}
      <style jsx global>{`
        /* ═══════════════════════════════════
           TRISHUL WORKSPACE — Lusion-inspired
           ═══════════════════════════════════ */

        /* Hide cursor on touch devices / inside this page */
        .trishul-root,
        .trishul-root * {
          cursor: none !important;
        }
        @media (pointer: coarse) {
          .trishul-cursor,
          .trishul-cursor-dot {
            display: none !important;
          }
          .trishul-root,
          .trishul-root * {
            cursor: auto !important;
          }
        }

        /* ── Root wrapper — full bleed ── */
        .trishul-root {
          position: relative;
          min-height: 100vh;
          background: #050505;
          overflow: hidden;
          margin: -1.25rem; /* counters main padding p-5 */
          margin-top: -1.25rem;
        }
        @media (min-width: 768px) {
          .trishul-root {
            margin: -2rem; /* counters md:p-8 */
            margin-top: -2rem;
          }
        }

        /* ── Custom cursor ── */
        .trishul-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 40px;
          height: 40px;
          border: 1.5px solid rgba(255, 255, 255, 0.35);
          border-radius: 50%;
          pointer-events: none;
          z-index: 99999;
          will-change: transform;
          mix-blend-mode: difference;
          transition: width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      border-color 0.3s ease;
        }
        .trishul-cursor-dot {
          position: fixed;
          top: 0;
          left: 0;
          width: 8px;
          height: 8px;
          background: #fff;
          border-radius: 50%;
          pointer-events: none;
          z-index: 99999;
          will-change: transform;
        }

        /* ── Noise overlay ── */
        .trishul-noise {
          position: fixed;
          inset: 0;
          z-index: 9000;
          pointer-events: none;
          opacity: 0.035;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 180px 180px;
        }

        /* ── Vignette ── */
        .trishul-vignette {
          position: fixed;
          inset: 0;
          z-index: 8999;
          pointer-events: none;
          background: radial-gradient(
            ellipse 70% 60% at 50% 50%,
            transparent 0%,
            rgba(0, 0, 0, 0.55) 100%
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
        }
        .trishul-ambient::before {
          width: 600px;
          height: 600px;
          top: -15%;
          left: -10%;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%);
          animation: trishul-float-a 14s ease-in-out infinite;
        }
        .trishul-ambient::after {
          width: 500px;
          height: 500px;
          bottom: -10%;
          right: -8%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.07) 0%, transparent 70%);
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
          padding: 6rem 1.5rem 4rem;
          text-align: center;
        }

        /* Protocol badge */
        .trishul-badge-wrap {
          opacity: 0;
          animation: trishul-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
        }
        .trishul-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 1.2rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 100px;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
        }
        .trishul-badge-icon {
          width: 12px;
          height: 12px;
          color: rgba(251, 191, 36, 0.8);
        }

        /* Massive title — outlined text */
        .trishul-title-stroke {
          font-size: clamp(4.5rem, 18vw, 16rem);
          font-weight: 900;
          line-height: 0.85;
          letter-spacing: -0.03em;
          color: transparent;
          -webkit-text-stroke: 1.5px rgba(255, 255, 255, 0.25);
          margin: 2.5rem 0 0.5rem;
          display: flex;
          justify-content: center;
          user-select: none;
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .trishul-title-stroke {
            -webkit-text-stroke: 2px rgba(255, 255, 255, 0.25);
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
        .trishul-letter:hover {
          color: #fff;
          -webkit-text-stroke-color: #fff;
        }

        /* Subtitle — gradient fill */
        .trishul-subtitle {
          font-size: clamp(3rem, 14vw, 13rem);
          font-weight: 900;
          line-height: 0.9;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          opacity: 0;
          animation: trishul-fade-up 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          user-select: none;
        }

        /* Separator line */
        .trishul-line-wrap {
          width: 100%;
          max-width: 480px;
          margin: 3rem 0 2rem;
          height: 1px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
        }
        .trishul-line {
          height: 100%;
          width: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(6, 182, 212, 0.5),
            rgba(168, 85, 247, 0.5),
            rgba(236, 72, 153, 0.5),
            transparent
          );
          animation: trishul-line-grow 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
          color: rgba(255, 255, 255, 0.2);
        }
        .trishul-scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.2), transparent);
          animation: trishul-scroll-pulse 2s ease-in-out infinite;
        }

        /* ═══════════════════════════════════
           MARQUEE
           ═══════════════════════════════════ */
        .trishul-marquee {
          position: relative;
          z-index: 1;
          overflow: hidden;
          padding: 1.25rem 0;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
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
          color: rgba(255, 255, 255, 0.12);
          white-space: nowrap;
          padding-right: 0;
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
          .trishul-features {
            padding: 8rem 2rem;
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

        /* Card */
        .trishul-card {
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.02);
          overflow: hidden;
          transition: border-color 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .trishul-card:hover {
          border-color: var(--card-accent);
          transform: scale(1.02);
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
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
          margin-bottom: 1.5rem;
          transition: border-color 0.4s ease, background 0.4s ease;
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
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 0.6rem;
          letter-spacing: -0.01em;
        }

        .trishul-card-desc {
          font-size: 0.82rem;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.35);
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
          padding: 4rem 1.5rem 6rem;
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
          color: rgba(255, 255, 255, 0.25);
          margin-bottom: 2rem;
        }

        .trishul-launch-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1.25rem 3.5rem;
          border: none;
          border-radius: 100px;
          background: linear-gradient(135deg, #06b6d4, #a855f7, #ec4899);
          background-size: 200% 200%;
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          outline: none;
          will-change: transform;
          transition: box-shadow 0.4s ease, background-position 0.5s ease;
          animation: trishul-btn-glow 3s ease-in-out infinite,
                     trishul-btn-gradient 5s ease-in-out infinite;
        }
        .trishul-launch-btn:hover {
          background-position: 100% 50%;
          box-shadow: 0 0 50px rgba(6, 182, 212, 0.3),
                      0 0 100px rgba(168, 85, 247, 0.2),
                      0 0 150px rgba(236, 72, 153, 0.1);
        }
        .trishul-launch-btn:active {
          transform: scale(0.97) !important;
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

        /* Pulsing ring around button */
        .trishul-launch-btn::before {
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
        .trishul-launch-btn:hover::before {
          opacity: 0.6;
        }

        .trishul-launch-sub {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.18);
          margin-top: 1.5rem;
          letter-spacing: 0.04em;
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
          color: rgba(255, 255, 255, 0.3);
        }
        .trishul-footer-name {
          color: rgba(255, 255, 255, 0.7);
          font-weight: 600;
        }
        .trishul-footer-role {
          display: inline-block;
          padding: 0.2rem 0.65rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 100px;
          background: rgba(255, 255, 255, 0.03);
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.3);
        }

        .trishul-footer-copy {
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.12);
          letter-spacing: 0.05em;
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

        @keyframes trishul-btn-glow {
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
