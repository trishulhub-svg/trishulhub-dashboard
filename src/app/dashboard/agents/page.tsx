"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowUpRight, KeyRound, Zap, Shield, Globe } from "lucide-react";

/* ══════════════════════════════════════════════════════
   NEXUS — Original TrishulHub Workspace
   ══════════════════════════════════════════════════════ */

export default function TrishulWorkspacePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const userName = session?.user?.name || "User";
  const userRole = (session?.user?.role || "DEVELOPER").replace(/_/g, " ");

  useEffect(() => setMounted(true), []);

  const mode = mounted
    ? resolvedTheme === "bluelight"
      ? "bluelight"
      : resolvedTheme === "dark"
      ? "dark"
      : "light"
    : "dark";

  /* ── Entrance animation trigger ── */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(t);
  }, []);

  /* ── Typewriter effect for tagline ── */
  const tagline = "I am ready to cook.";
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    if (!entered) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setTypedText(tagline.slice(0, idx));
      if (idx >= tagline.length) {
        clearInterval(interval);
        setTypingDone(true);
      }
    }, 55);
    return () => clearInterval(interval);
  }, [entered]);

  /* ── Floating particles (pure CSS via refs) ── */
  const particleCount = 30;
  const particles = useRef(
    Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
      opacity: Math.random() * 0.4 + 0.1,
    }))
  );

  /* ── Handlers ── */
  const handleStart = useCallback(() => {
    window.open("https://chat.z.ai", "_blank");
  }, []);
  const handleCredentials = useCallback(() => {
    router.push("/dashboard/credentials");
  }, [router]);

  return (
    <>
      <div className={`nx-root nx-root--${mode}`}>
        {/* ═══ ANIMATED BACKGROUND LAYERS ═══ */}

        {/* Mesh gradient — slow-moving color blobs */}
        <div className="nx-mesh" aria-hidden>
          <div className="nx-mesh-blob nx-mesh-blob--1" />
          <div className="nx-mesh-blob nx-mesh-blob--2" />
          <div className="nx-mesh-blob nx-mesh-blob--3" />
          <div className="nx-mesh-blob nx-mesh-blob--4" />
        </div>

        {/* Dot grid overlay */}
        <div className="nx-grid" aria-hidden />

        {/* Floating particles */}
        <div className="nx-particles" aria-hidden>
          {particles.current.map((p) => (
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

        {/* ═══ MAIN CONTENT ═══ */}
        <div className="nx-content">
          {/* ── Top bar ── */}
          <div className={`nx-topbar ${entered ? "nx-topbar--visible" : ""}`}>
            <div className="nx-topbar-left">
              <div className={`nx-logo-dot nx-logo-dot--${mode}`} />
              <span className={`nx-logo-text nx-logo-text--${mode}`}>TrishulHub</span>
            </div>
            <div className="nx-topbar-right">
              <span className={`nx-badge nx-badge--${mode}`}>Protocol v5.0</span>
            </div>
          </div>

          {/* ── Hero Section ── */}
          <section className="nx-hero">
            {/* Central pulsing orb */}
            <div className="nx-orb-wrap" aria-hidden>
              <div className={`nx-orb nx-orb--${mode} ${entered ? "nx-orb--active" : ""}`}>
                <div className={`nx-orb-ring nx-orb-ring--${mode}`} />
                <div className={`nx-orb-ring nx-orb-ring--2 nx-orb-ring--${mode}`} />
                <div className={`nx-orb-ring nx-orb-ring--3 nx-orb-ring--${mode}`} />
                <div className={`nx-orb-core nx-orb-core--${mode}`} />
              </div>
            </div>

            {/* Title cluster */}
            <div className="nx-title-cluster">
              <h1 className={`nx-title nx-title--${mode} ${entered ? "nx-title--visible" : ""}`}>
                {"TrishulHub".split("").map((char, i) => (
                  <span
                    key={i}
                    className="nx-char"
                    style={{ animationDelay: `${0.3 + i * 0.06}s` }}
                  >
                    {char}
                  </span>
                ))}
              </h1>

              <p className={`nx-subtitle nx-subtitle--${mode} ${entered ? "nx-subtitle--visible" : ""}`}>
                Your Personal Workspace
              </p>

              {/* Typewriter tagline */}
              <div className={`nx-tagline nx-tagline--${mode} ${entered ? "nx-tagline--visible" : ""}`}>
                <span className="nx-tagline-line" />
                <span className={`nx-tagline-text nx-tagline-text--${mode}`}>
                  {typedText}
                  <span className={`nx-cursor nx-cursor--${mode} ${typingDone ? "nx-cursor--blink" : ""}`} />
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={`nx-actions ${entered ? "nx-actions--visible" : ""}`}>
              {/* START — primary CTA */}
              <button
                onClick={handleStart}
                className={`nx-start-btn nx-start-btn--${mode}`}
                type="button"
              >
                <span className="nx-start-ring" aria-hidden />
                <span className="nx-start-icon" aria-hidden>
                  <Zap size={18} strokeWidth={2.5} />
                </span>
                <span className="nx-start-label">START</span>
                <span className="nx-start-arrow" aria-hidden>
                  <ArrowUpRight size={16} />
                </span>
              </button>

              <p className={`nx-start-hint nx-start-hint--${mode}`}>
                Opens workspace in a new tab
              </p>

              {/* Credential card */}
              <button
                onClick={handleCredentials}
                className={`nx-cred-btn nx-cred-btn--${mode}`}
                type="button"
              >
                <div className="nx-cred-icon-wrap">
                  <KeyRound className="nx-cred-icon" />
                </div>
                <div className="nx-cred-text">
                  <span className={`nx-cred-title nx-cred-title--${mode}`}>Claim Credentials</span>
                  <span className={`nx-cred-desc nx-cred-desc--${mode}`}>Get your ID & Password</span>
                </div>
                <ArrowUpRight size={16} className={`nx-cred-arrow nx-cred-arrow--${mode}`} />
              </button>
            </div>
          </section>

          {/* ── Feature pills ── */}
          <div className={`nx-pills ${entered ? "nx-pills--visible" : ""}`}>
            <div className={`nx-pill nx-pill--${mode}`}>
              <Shield size={14} />
              <span>Secured</span>
            </div>
            <div className={`nx-pill nx-pill--${mode}`}>
              <Zap size={14} />
              <span>AI Powered</span>
            </div>
            <div className={`nx-pill nx-pill--${mode}`}>
              <Globe size={14} />
              <span>Cloud Native</span>
            </div>
          </div>

          {/* ── Footer ── */}
          <footer className={`nx-footer ${entered ? "nx-footer--visible" : ""}`}>
            <div className="nx-footer-inner">
              <p className={`nx-footer-text nx-footer-text--${mode}`}>
                Welcome back, <span className={`nx-footer-name nx-footer-name--${mode}`}>{userName}</span>
              </p>
              <div className="nx-footer-divider" />
              <span className={`nx-footer-role nx-footer-role--${mode}`}>{userRole}</span>
            </div>
          </footer>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
         STYLES — NEXUS ORIGINAL
         ═══════════════════════════════════════════════════ */}
      <style jsx global>{`
        /* ── Reset cursor on touch ── */
        @media (pointer: coarse) {
          .nx-root, .nx-root * { cursor: auto !important; }
        }

        /* ═══════════════════════
           ROOT
           ═══════════════════════ */
        .nx-root {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          margin: -1.25rem;
          margin-top: -1.25rem;
          background: #06060a;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        @media (min-width: 768px) {
          .nx-root { margin: -2rem; margin-top: -2rem; }
        }
        .nx-root--light { background: #f4f5f8; }
        .nx-root--bluelight { background: #0a0808; }

        /* ═══════════════════════
           ANIMATED MESH GRADIENT
           ═══════════════════════ */
        .nx-mesh {
          position: fixed; inset: 0; z-index: 0;
          overflow: hidden;
        }
        .nx-mesh-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          will-change: transform;
        }
        /* Blob 1 — top left cyan */
        .nx-mesh-blob--1 {
          width: 600px; height: 600px;
          top: -20%; left: -10%;
          background: rgba(6, 182, 212, 0.12);
          animation: nx-float-1 18s ease-in-out infinite;
        }
        /* Blob 2 — bottom right purple */
        .nx-mesh-blob--2 {
          width: 500px; height: 500px;
          bottom: -15%; right: -8%;
          background: rgba(139, 92, 246, 0.10);
          animation: nx-float-2 22s ease-in-out infinite;
        }
        /* Blob 3 — center-right pink */
        .nx-mesh-blob--3 {
          width: 400px; height: 400px;
          top: 30%; right: 20%;
          background: rgba(236, 72, 153, 0.06);
          animation: nx-float-3 25s ease-in-out infinite;
        }
        /* Blob 4 — center-left blue */
        .nx-mesh-blob--4 {
          width: 350px; height: 350px;
          top: 60%; left: 15%;
          background: rgba(59, 130, 246, 0.07);
          animation: nx-float-4 20s ease-in-out infinite;
        }

        /* Light mode blobs */
        .nx-root--light .nx-mesh-blob--1 { background: rgba(6, 182, 212, 0.08); }
        .nx-root--light .nx-mesh-blob--2 { background: rgba(139, 92, 246, 0.06); }
        .nx-root--light .nx-mesh-blob--3 { background: rgba(236, 72, 153, 0.04); }
        .nx-root--light .nx-mesh-blob--4 { background: rgba(59, 130, 246, 0.05); }

        /* Bluelight blobs */
        .nx-root--bluelight .nx-mesh-blob--1 { background: rgba(251, 191, 36, 0.10); }
        .nx-root--bluelight .nx-mesh-blob--2 { background: rgba(217, 119, 6, 0.08); }
        .nx-root--bluelight .nx-mesh-blob--3 { background: rgba(245, 158, 11, 0.05); }
        .nx-root--bluelight .nx-mesh-blob--4 { background: rgba(180, 83, 9, 0.06); }

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
          position: fixed; inset: 0; z-index: 1;
          pointer-events: none;
          background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse 60% 50% at 50% 50%, black 0%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 50%, black 0%, transparent 100%);
        }
        .nx-root--light .nx-grid {
          background-image: radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px);
        }
        .nx-root--bluelight .nx-grid {
          background-image: radial-gradient(circle, rgba(251,191,36,0.025) 1px, transparent 1px);
        }

        /* ═══════════════════════
           FLOATING PARTICLES
           ═══════════════════════ */
        .nx-particles {
          position: fixed; inset: 0; z-index: 2;
          pointer-events: none;
        }
        .nx-particle {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.6);
          animation: nx-particle-drift linear infinite;
        }
        .nx-root--light .nx-particle { background: rgba(0,0,0,0.3); }
        .nx-root--bluelight .nx-particle { background: rgba(251,191,36,0.5); }

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
          position: fixed; inset: 0; z-index: 8000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 200px;
          opacity: 0.025;
        }
        .nx-vignette {
          position: fixed; inset: 0; z-index: 7999;
          pointer-events: none;
        }
        .nx-vignette--dark, .nx-vignette--bluelight {
          background: radial-gradient(ellipse 65% 55% at 50% 45%, transparent 0%, rgba(0,0,0,0.6) 100%);
        }
        .nx-vignette--light {
          background: radial-gradient(ellipse 65% 55% at 50% 45%, transparent 0%, rgba(180,190,220,0.25) 100%);
        }

        /* ═══════════════════════
           CONTENT LAYOUT
           ═══════════════════════ */
        .nx-content {
          position: relative; z-index: 10;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          min-height: 100vh;
          padding: 2rem 1.5rem;
        }

        /* ═══════════════════════
           TOP BAR
           ═══════════════════════ */
        .nx-topbar {
          position: fixed; top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 2rem;
          opacity: 0; transform: translateY(-20px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-topbar--visible { opacity: 1; transform: translateY(0); }

        .nx-topbar-left {
          display: flex; align-items: center; gap: 0.6rem;
        }
        .nx-logo-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          box-shadow: 0 0 12px rgba(6, 182, 212, 0.4);
        }
        .nx-logo-dot--bluelight {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
        }
        .nx-logo-text {
          font-size: 0.9rem; font-weight: 700;
          letter-spacing: 0.5px;
          color: rgba(255,255,255,0.7);
        }
        .nx-logo-text--light { color: rgba(0,0,0,0.6); }
        .nx-logo-text--bluelight { color: rgba(251,191,36,0.7); }

        .nx-badge {
          font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase;
          padding: 0.3rem 0.75rem;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.35);
        }
        .nx-badge--light {
          border-color: rgba(0,0,0,0.08);
          background: rgba(0,0,0,0.03);
          color: rgba(0,0,0,0.35);
        }
        .nx-badge--bluelight {
          border-color: rgba(251,191,36,0.12);
          background: rgba(251,191,36,0.03);
          color: rgba(251,191,36,0.4);
        }

        /* ═══════════════════════
           HERO SECTION
           ═══════════════════════ */
        .nx-hero {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 0;
          text-align: center;
          position: relative;
        }

        /* ── Central Orb ── */
        .nx-orb-wrap {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 0;
          pointer-events: none;
        }
        .nx-orb {
          position: relative;
          width: 300px; height: 300px;
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity 1.2s ease;
        }
        .nx-orb--active { opacity: 1; }

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

        .nx-orb-ring--bluelight {
          border-color: rgba(251, 191, 36, 0.12);
        }
        .nx-orb-ring--2.nx-orb-ring--bluelight {
          border-color: rgba(217, 119, 6, 0.10);
        }
        .nx-orb-ring--3.nx-orb-ring--bluelight {
          border-color: rgba(245, 158, 11, 0.06);
        }

        .nx-orb-core {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: rgba(6, 182, 212, 0.6);
          box-shadow: 0 0 40px rgba(6, 182, 212, 0.3), 0 0 80px rgba(139, 92, 246, 0.15);
          animation: nx-orb-pulse 4s ease-in-out infinite;
        }
        .nx-orb-core--light {
          background: rgba(6, 182, 212, 0.4);
          box-shadow: 0 0 40px rgba(6, 182, 212, 0.15);
        }
        .nx-orb-core--bluelight {
          background: rgba(251, 191, 36, 0.5);
          box-shadow: 0 0 40px rgba(251, 191, 36, 0.25), 0 0 80px rgba(217, 119, 6, 0.1);
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
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center;
        }

        .nx-title {
          font-size: clamp(3rem, 10vw, 7rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1;
          display: flex;
          justify-content: center;
          opacity: 0;
          transform: translateY(30px);
          transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-title--visible { opacity: 1; transform: translateY(0); }

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

        .nx-char {
          display: inline-block;
          opacity: 0;
          transform: translateY(25px) scale(0.9);
          animation: nx-char-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes nx-char-in {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .nx-subtitle {
          font-size: clamp(0.9rem, 2.5vw, 1.15rem);
          font-weight: 400;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-top: 0.75rem;
          opacity: 0; transform: translateY(15px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s;
        }
        .nx-subtitle--visible { opacity: 1; transform: translateY(0); }

        .nx-subtitle--dark { color: rgba(255,255,255,0.35); }
        .nx-subtitle--light { color: rgba(0,0,0,0.3); }
        .nx-subtitle--bluelight { color: rgba(251,191,36,0.4); }

        /* ── Typewriter Tagline ── */
        .nx-tagline {
          display: flex; align-items: center; gap: 0.75rem;
          margin-top: 1.25rem;
          opacity: 0; transform: translateY(10px);
          transition: all 0.8s ease 0.8s;
        }
        .nx-tagline--visible { opacity: 1; transform: translateY(0); }

        .nx-tagline-line {
          width: 24px; height: 1px;
          background: rgba(255,255,255,0.15);
          flex-shrink: 0;
        }
        .nx-root--light .nx-tagline-line { background: rgba(0,0,0,0.12); }
        .nx-root--bluelight .nx-tagline-line { background: rgba(251,191,36,0.2); }

        .nx-tagline-text {
          font-size: clamp(0.85rem, 2vw, 1rem);
          font-weight: 300;
          letter-spacing: 0.02em;
          font-style: italic;
          display: inline;
        }
        .nx-tagline-text--dark { color: rgba(255,255,255,0.5); }
        .nx-tagline-text--light { color: rgba(0,0,0,0.4); }
        .nx-tagline-text--bluelight { color: rgba(251,191,36,0.55); }

        .nx-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: currentColor;
        }
        .nx-cursor--blink {
          animation: nx-blink 1s step-end infinite;
        }
        @keyframes nx-blink {
          50% { opacity: 0; }
        }

        /* ═══════════════════════
           ACTION BUTTONS
           ═══════════════════════ */
        .nx-actions {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center; gap: 1rem;
          margin-top: 3rem;
          opacity: 0; transform: translateY(20px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1s;
        }
        .nx-actions--visible { opacity: 1; transform: translateY(0); }

        /* START button */
        .nx-start-btn {
          position: relative;
          display: flex; align-items: center; gap: 0.65rem;
          padding: 0.9rem 2.2rem;
          border-radius: 60px;
          border: 1px solid rgba(6, 182, 212, 0.3);
          background: rgba(6, 182, 212, 0.06);
          color: #06b6d4;
          font-size: 0.95rem; font-weight: 600;
          letter-spacing: 0.15em;
          font-family: inherit;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .nx-start-btn:hover {
          border-color: rgba(6, 182, 212, 0.6);
          background: rgba(6, 182, 212, 0.12);
          box-shadow: 0 0 30px rgba(6, 182, 212, 0.15), inset 0 0 30px rgba(6, 182, 212, 0.05);
          transform: scale(1.03);
        }
        .nx-start-btn:active { transform: scale(0.98); }

        /* Light mode */
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

        /* Bluelight mode */
        .nx-start-btn--bluelight {
          border-color: rgba(251, 191, 36, 0.3);
          background: rgba(251, 191, 36, 0.06);
          color: #f59e0b;
        }
        .nx-start-btn--bluelight:hover {
          border-color: rgba(251, 191, 36, 0.6);
          background: rgba(251, 191, 36, 0.12);
          box-shadow: 0 0 30px rgba(251, 191, 36, 0.15), inset 0 0 30px rgba(251, 191, 36, 0.05);
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
        .nx-start-btn--bluelight .nx-start-ring {
          border-top-color: rgba(251, 191, 36, 0.4);
        }
        @keyframes nx-ring-spin {
          to { transform: rotate(360deg); }
        }

        .nx-start-icon {
          display: flex; align-items: center;
        }
        .nx-start-arrow {
          display: flex; align-items: center;
          opacity: 0.5;
          transition: opacity 0.3s, transform 0.3s;
        }
        .nx-start-btn:hover .nx-start-arrow {
          opacity: 1; transform: translate(2px, -2px);
        }

        .nx-start-hint {
          font-size: 0.72rem;
          letter-spacing: 0.05em;
          margin-top: -0.25rem;
        }
        .nx-start-hint--dark { color: rgba(255,255,255,0.2); }
        .nx-start-hint--light { color: rgba(0,0,0,0.25); }
        .nx-start-hint--bluelight { color: rgba(251,191,36,0.25); }

        /* ── Credential Button ── */
        .nx-cred-btn {
          display: flex; align-items: center; gap: 0.85rem;
          padding: 0.85rem 1.5rem;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          font-family: inherit;
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          margin-top: 0.25rem;
          text-align: left;
        }
        .nx-cred-btn:hover {
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          transform: translateX(4px);
        }
        .nx-root--light .nx-cred-btn {
          border-color: rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.6);
        }
        .nx-root--light .nx-cred-btn:hover {
          border-color: rgba(0,0,0,0.1);
          background: rgba(255,255,255,0.85);
        }
        .nx-root--bluelight .nx-cred-btn {
          border-color: rgba(251,191,36,0.08);
          background: rgba(251,191,36,0.02);
        }
        .nx-root--bluelight .nx-cred-btn:hover {
          border-color: rgba(251,191,36,0.15);
          background: rgba(251,191,36,0.04);
        }

        .nx-cred-icon-wrap {
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 12px;
          background: rgba(139, 92, 246, 0.08);
          border: 1px solid rgba(139, 92, 246, 0.12);
          flex-shrink: 0;
          transition: all 0.3s;
        }
        .nx-cred-btn:hover .nx-cred-icon-wrap {
          background: rgba(139, 92, 246, 0.12);
          border-color: rgba(139, 92, 246, 0.2);
        }
        .nx-root--bluelight .nx-cred-icon-wrap {
          background: rgba(251,191,36,0.06);
          border-color: rgba(251,191,36,0.1);
        }
        .nx-root--bluelight .nx-cred-btn:hover .nx-cred-icon-wrap {
          background: rgba(251,191,36,0.10);
          border-color: rgba(251,191,36,0.18);
        }
        .nx-cred-icon {
          width: 18px; height: 18px;
          color: #8b5cf6;
        }
        .nx-root--bluelight .nx-cred-icon { color: #f59e0b; }

        .nx-cred-text {
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        .nx-cred-title {
          font-size: 0.85rem; font-weight: 600;
        }
        .nx-cred-title--dark { color: rgba(255,255,255,0.8); }
        .nx-cred-title--light { color: rgba(0,0,0,0.75); }
        .nx-cred-title--bluelight { color: rgba(251,191,36,0.8); }

        .nx-cred-desc {
          font-size: 0.72rem;
        }
        .nx-cred-desc--dark { color: rgba(255,255,255,0.3); }
        .nx-cred-desc--light { color: rgba(0,0,0,0.35); }
        .nx-cred-desc--bluelight { color: rgba(251,191,36,0.35); }

        .nx-cred-arrow {
          opacity: 0.3;
          transition: all 0.3s;
          flex-shrink: 0;
        }
        .nx-cred-arrow--dark { color: #fff; }
        .nx-cred-arrow--light { color: #000; }
        .nx-cred-arrow--bluelight { color: #f59e0b; }
        .nx-cred-btn:hover .nx-cred-arrow {
          opacity: 0.7; transform: translate(2px, -2px);
        }

        /* ═══════════════════════
           FEATURE PILLS
           ═══════════════════════ */
        .nx-pills {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 0.6rem;
          margin-top: 2.5rem;
          opacity: 0; transform: translateY(15px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.3s;
          flex-wrap: wrap; justify-content: center;
        }
        .nx-pills--visible { opacity: 1; transform: translateY(0); }

        .nx-pill {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.35rem 0.85rem;
          border-radius: 100px;
          font-size: 0.7rem; font-weight: 500;
          letter-spacing: 0.04em;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: rgba(255,255,255,0.35);
          transition: all 0.3s;
        }
        .nx-pill:hover {
          border-color: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.6);
        }
        .nx-pill--light {
          border-color: rgba(0,0,0,0.06);
          background: rgba(0,0,0,0.02);
          color: rgba(0,0,0,0.35);
        }
        .nx-pill--light:hover {
          border-color: rgba(0,0,0,0.1);
          color: rgba(0,0,0,0.6);
        }
        .nx-pill--bluelight {
          border-color: rgba(251,191,36,0.08);
          background: rgba(251,191,36,0.02);
          color: rgba(251,191,36,0.35);
        }
        .nx-pill--bluelight:hover {
          border-color: rgba(251,191,36,0.15);
          color: rgba(251,191,36,0.6);
        }

        /* ═══════════════════════
           FOOTER
           ═══════════════════════ */
        .nx-footer {
          position: fixed; bottom: 0; left: 0; right: 0;
          z-index: 100;
          display: flex; justify-content: center;
          padding: 1.25rem 2rem;
          opacity: 0;
          transition: opacity 0.8s ease 1.5s;
        }
        .nx-footer--visible { opacity: 1; }

        .nx-footer-inner {
          display: flex; align-items: center; gap: 1rem;
        }
        .nx-footer-text {
          font-size: 0.8rem;
        }
        .nx-footer-text--dark { color: rgba(255,255,255,0.25); }
        .nx-footer-text--light { color: rgba(0,0,0,0.3); }
        .nx-footer-text--bluelight { color: rgba(251,191,36,0.3); }

        .nx-footer-name {
          font-weight: 600;
        }
        .nx-footer-name--dark { color: rgba(255,255,255,0.5); }
        .nx-footer-name--light { color: rgba(0,0,0,0.55); }
        .nx-footer-name--bluelight { color: rgba(251,191,36,0.55); }

        .nx-footer-divider {
          width: 3px; height: 3px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
        }
        .nx-root--light .nx-footer-divider { background: rgba(0,0,0,0.12); }
        .nx-root--bluelight .nx-footer-divider { background: rgba(251,191,36,0.2); }

        .nx-footer-role {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .nx-footer-role--dark { color: rgba(255,255,255,0.18); }
        .nx-footer-role--light { color: rgba(0,0,0,0.22); }
        .nx-footer-role--bluelight { color: rgba(251,191,36,0.22); }

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
