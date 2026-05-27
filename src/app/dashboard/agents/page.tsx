"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  KeyRound,
  Zap,
  Shield,
  Globe,
  Cpu,
  Rocket,
  Activity,
  Users,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TRISHULHUB WORKSPACE v2.0 — Bento Grid + Glassmorphism
   Inspired by Linear · Raycast · Notion · Vercel
   ═══════════════════════════════════════════════════════════════ */

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

  /* ── Entrance stagger ── */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 50);
    return () => clearTimeout(t);
  }, []);

  /* ── Typewriter ── */
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
    }, 50);
    return () => clearInterval(interval);
  }, [entered]);

  /* ── Mouse-following glow ── */
  const glowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!glowRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    glowRef.current.style.setProperty("--glow-x", `${x}px`);
    glowRef.current.style.setProperty("--glow-y", `${y}px`);
  }, []);

  /* ── Handlers ── */
  const handleStart = useCallback(() => {
    window.open("https://chat.z.ai", "_blank");
  }, []);
  const handleCredentials = useCallback(() => {
    router.push("/dashboard/credentials");
  }, [router]);

  /* ── Time-based greeting ── */
  const [greeting, setGreeting] = useState("Good evening");
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  /* ── Current time ── */
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className={`ws-root ws-root--${mode}`}
        onMouseMove={handleMouseMove}
      >
        {/* ═══ AMBIENT BACKGROUND ═══ */}

        {/* Mouse-following radial glow */}
        <div ref={glowRef} className="ws-glow" aria-hidden />

        {/* Gradient orbs */}
        <div className="ws-orbs" aria-hidden>
          <div className="ws-orb ws-orb--1" />
          <div className="ws-orb ws-orb--2" />
          <div className="ws-orb ws-orb--3" />
        </div>

        {/* Dot pattern */}
        <div className="ws-dots" aria-hidden />

        {/* Subtle noise */}
        <div className="ws-noise" aria-hidden />

        {/* ═══ MAIN GRID LAYOUT ═══ */}
        <div className="ws-layout">
          {/* ── HEADER BAR ── */}
          <header className={`ws-header ${entered ? "ws-in" : ""}`}>
            <div className="ws-header-left">
              <div className={`ws-logo ${entered ? "ws-in" : ""}`}>
                <div className={`ws-logo-icon ws-logo-icon--${mode}`} />
                <span className={`ws-logo-label ws-logo-label--${mode}`}>
                  TrishulHub
                </span>
              </div>
            </div>
            <div className="ws-header-right">
              <span className={`ws-time ws-time--${mode}`}>{time}</span>
              <div className={`ws-header-badge ws-header-badge--${mode}`}>
                <div className={`ws-pulse-dot ws-pulse-dot--${mode}`} />
                <span>Protocol v5.0</span>
              </div>
            </div>
          </header>

          {/* ── BENTO GRID ════════════════════════════════ */}
          <main className="ws-bento">
            {/* ─── ROW 1: Hero + Stats ─── */}

            {/* HERO CARD — spans 3 cols */}
            <div
              className={`ws-card ws-hero-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.1s" }}
            >
              <div className={`ws-hero-glow ws-hero-glow--${mode}`} />
              <div className="ws-hero-content">
                <p className={`ws-greeting ws-greeting--${mode}`}>
                  {greeting}
                </p>
                <h1 className={`ws-hero-title ws-hero-title--${mode}`}>
                  <span className={`ws-name-highlight ws-name-highlight--${mode}`}>
                    {userName}
                  </span>
                </h1>
                <div className={`ws-tagline ws-tagline--${mode}`}>
                  <span className="ws-tagline-bar" />
                  <span>{typedText}</span>
                  <span
                    className={`ws-cursor ${typingDone ? "ws-cursor--blink" : ""}`}
                  />
                </div>
                <div className="ws-hero-actions">
                  <button
                    onClick={handleStart}
                    className={`ws-btn-primary ws-btn-primary--${mode}`}
                    type="button"
                  >
                    <Zap size={16} strokeWidth={2.5} />
                    <span>START</span>
                    <ArrowUpRight size={14} />
                  </button>
                  <button
                    onClick={handleCredentials}
                    className={`ws-btn-ghost ws-btn-ghost--${mode}`}
                    type="button"
                  >
                    <KeyRound size={15} />
                    <span>Claim Credentials</span>
                  </button>
                </div>
              </div>
              {/* Decorative ring cluster */}
              <div className={`ws-hero-rings ws-hero-rings--${mode}`} aria-hidden>
                <svg viewBox="0 0 200 200" fill="none">
                  <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
                  <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="0.5" opacity="0.10" strokeDasharray="4 6" />
                  <circle cx="100" cy="100" r="50" stroke="currentColor" strokeWidth="0.5" opacity="0.08" />
                  <circle cx="100" cy="100" r="6" fill="currentColor" opacity="0.25" />
                </svg>
              </div>
            </div>

            {/* STAT CARD 1 */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.2s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--cyan">
                <Activity size={18} />
              </div>
              <div className="ws-stat-body">
                <span className={`ws-stat-label ws-stat-label--${mode}`}>
                  Workspace
                </span>
                <span className={`ws-stat-value ws-stat-value--${mode}`}>
                  Your Personal Workspace
                </span>
              </div>
            </div>

            {/* STAT CARD 2 */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.25s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--purple">
                <Cpu size={18} />
              </div>
              <div className="ws-stat-body">
                <span className={`ws-stat-label ws-stat-label--${mode}`}>
                  AI Engine
                </span>
                <span className={`ws-stat-value ws-stat-value--${mode}`}>
                  7 Agents Active
                </span>
              </div>
            </div>

            {/* STAT CARD 3 */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.3s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--pink">
                <Rocket size={18} />
              </div>
              <div className="ws-stat-body">
                <span className={`ws-stat-label ws-stat-label--${mode}`}>
                  Role
                </span>
                <span className={`ws-stat-value ws-stat-value--${mode}`}>
                  {userRole}
                </span>
              </div>
            </div>

            {/* ─── ROW 2: Feature cards ─── */}

            {/* CREDENTIALS CARD — spans 2 cols */}
            <div
              className={`ws-card ws-cred-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.35s" }}
            >
              <button
                onClick={handleCredentials}
                className="ws-cred-card-inner"
                type="button"
              >
                <div className="ws-cred-left">
                  <div className={`ws-cred-icon-box ws-cred-icon-box--${mode}`}>
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className={`ws-cred-heading ws-cred-heading--${mode}`}>
                      Claim Credentials
                    </h3>
                    <p className={`ws-cred-sub ws-cred-sub--${mode}`}>
                      Get your workspace ID & password to access all tools and
                      services
                    </p>
                  </div>
                </div>
                <div className={`ws-cred-arrow-wrap ws-cred-arrow-wrap--${mode}`}>
                  <ArrowUpRight size={16} />
                </div>
              </button>
              {/* Decorative gradient line */}
              <div className="ws-cred-gradient-line" />
            </div>

            {/* FEATURE GRID CARD */}
            <div
              className={`ws-card ws-features-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.4s" }}
            >
              <h3 className={`ws-features-heading ws-features-heading--${mode}`}>
                Capabilities
              </h3>
              <div className="ws-features-grid">
                <div className={`ws-feature-item ws-feature-item--${mode}`}>
                  <Shield size={14} />
                  <span>Secured</span>
                </div>
                <div className={`ws-feature-item ws-feature-item--${mode}`}>
                  <Zap size={14} />
                  <span>AI Powered</span>
                </div>
                <div className={`ws-feature-item ws-feature-item--${mode}`}>
                  <Globe size={14} />
                  <span>Cloud Native</span>
                </div>
                <div className={`ws-feature-item ws-feature-item--${mode}`}>
                  <Users size={14} />
                  <span>Team Ready</span>
                </div>
              </div>
            </div>

            {/* START CARD — spans 2 cols */}
            <div
              className={`ws-card ws-start-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.45s" }}
            >
              <button
                onClick={handleStart}
                className="ws-start-card-inner"
                type="button"
              >
                <div className="ws-start-left">
                  <div className={`ws-start-icon-box ws-start-icon-box--${mode}`}>
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className={`ws-start-heading ws-start-heading--${mode}`}>
                      Launch Workspace
                    </h3>
                    <p className={`ws-start-sub ws-start-sub--${mode}`}>
                      Opens workspace in a new tab — full AI agent environment
                    </p>
                  </div>
                </div>
                <div className={`ws-start-badge ws-start-badge--${mode}`}>
                  <span>Open</span>
                  <ArrowUpRight size={14} />
                </div>
              </button>
              {/* Animated accent border */}
              <div className="ws-start-accent" />
            </div>

            {/* STATUS INDICATOR CARD */}
            <div
              className={`ws-card ws-status-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.5s" }}
            >
              <div className="ws-status-row">
                <div className={`ws-status-dot ws-status-dot--${mode}`} />
                <span className={`ws-status-text ws-status-text--${mode}`}>
                  All Systems Operational
                </span>
              </div>
              <div className="ws-status-bars">
                <div className={`ws-status-bar-item`}>
                  <span className={`ws-bar-label ws-bar-label--${mode}`}>AI</span>
                  <div className={`ws-bar-track ws-bar-track--${mode}`}>
                    <div className="ws-bar-fill ws-bar-fill--cyan" style={{ width: "92%" }} />
                  </div>
                </div>
                <div className="ws-status-bar-item">
                  <span className={`ws-bar-label ws-bar-label--${mode}`}>Sync</span>
                  <div className={`ws-bar-track ws-bar-track--${mode}`}>
                    <div className="ws-bar-fill ws-bar-fill--purple" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="ws-status-bar-item">
                  <span className={`ws-bar-label ws-bar-label--${mode}`}>API</span>
                  <div className={`ws-bar-track ws-bar-track--${mode}`}>
                    <div className="ws-bar-fill ws-bar-fill--pink" style={{ width: "88%" }} />
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* ── FOOTER ── */}
          <footer
            className={`ws-footer ${entered ? "ws-in" : ""}`}
            style={{ transitionDelay: "0.6s" }}
          >
            <span className={`ws-footer-brand ws-footer-brand--${mode}`}>
              TrishulHub
            </span>
            <span className={`ws-footer-sep`}>·</span>
            <span className={`ws-footer-text ws-footer-text--${mode}`}>
              Workspace v2.0
            </span>
            <span className={`ws-footer-sep`}>·</span>
            <span className={`ws-footer-text ws-footer-text--${mode}`}>
              {userRole}
            </span>
          </footer>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
         STYLES — BENTO GRID + GLASSMORPHISM DESIGN SYSTEM
         ═══════════════════════════════════════════════════════════════ */}
      <style jsx global>{`
        @media (pointer: coarse) {
          .ws-root, .ws-root * { cursor: auto !important; }
        }

        /* ═══════════════════════════════════════
           DESIGN TOKENS
           ═══════════════════════════════════════ */

        /* ── ROOT ── */
        .ws-root {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          margin: -1.25rem;
          background: var(--ws-bg);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: var(--ws-text);
          --ws-bg: #09090b;
          --ws-text: #fafafa;
          --ws-text-muted: rgba(255,255,255,0.45);
          --ws-text-dim: rgba(255,255,255,0.22);
          --ws-card-bg: rgba(255,255,255,0.03);
          --ws-card-border: rgba(255,255,255,0.06);
          --ws-card-hover: rgba(255,255,255,0.05);
          --ws-card-border-hover: rgba(255,255,255,0.10);
          --ws-accent-cyan: #06b6d4;
          --ws-accent-purple: #8b5cf6;
          --ws-accent-pink: #ec4899;
          --ws-accent-cyan-dim: rgba(6,182,212,0.10);
          --ws-accent-purple-dim: rgba(139,92,246,0.10);
          --ws-accent-pink-dim: rgba(236,72,153,0.10);
        }
        @media (min-width: 768px) {
          .ws-root { margin: -2rem; }
        }

        .ws-root--light {
          --ws-bg: #f8f9fb;
          --ws-text: #0a0a0a;
          --ws-text-muted: rgba(0,0,0,0.45);
          --ws-text-dim: rgba(0,0,0,0.20);
          --ws-card-bg: rgba(255,255,255,0.70);
          --ws-card-border: rgba(0,0,0,0.06);
          --ws-card-hover: rgba(255,255,255,0.90);
          --ws-card-border-hover: rgba(0,0,0,0.10);
        }
        .ws-root--bluelight {
          --ws-bg: #0c0a08;
          --ws-text: #fbbf24;
          --ws-text-muted: rgba(251,191,36,0.45);
          --ws-text-dim: rgba(251,191,36,0.22);
          --ws-card-bg: rgba(251,191,36,0.03);
          --ws-card-border: rgba(251,191,36,0.07);
          --ws-card-hover: rgba(251,191,36,0.05);
          --ws-card-border-hover: rgba(251,191,36,0.12);
          --ws-accent-cyan: #f59e0b;
          --ws-accent-purple: #d97706;
          --ws-accent-pink: #fbbf24;
        }

        /* ═══════════════════════════════════════
           AMBIENT BACKGROUND
           ═══════════════════════════════════════ */

        /* Mouse glow */
        .ws-glow {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(
            600px circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(6,182,212,0.04), transparent 60%
          );
          transition: opacity 0.3s;
          opacity: 0;
        }
        .ws-root:hover .ws-glow { opacity: 1; }
        .ws-root--light .ws-glow {
          background: radial-gradient(
            600px circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(6,182,212,0.05), transparent 60%
          );
        }
        .ws-root--bluelight .ws-glow {
          background: radial-gradient(
            600px circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(251,191,36,0.04), transparent 60%
          );
        }

        /* Orbs */
        .ws-orbs {
          position: fixed; inset: 0; z-index: 0;
          pointer-events: none; overflow: hidden;
        }
        .ws-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          will-change: transform;
        }
        .ws-orb--1 {
          width: 500px; height: 500px;
          top: -15%; right: -5%;
          background: rgba(6,182,212,0.08);
          animation: ws-drift-1 25s ease-in-out infinite;
        }
        .ws-orb--2 {
          width: 400px; height: 400px;
          bottom: -10%; left: -5%;
          background: rgba(139,92,246,0.06);
          animation: ws-drift-2 30s ease-in-out infinite;
        }
        .ws-orb--3 {
          width: 300px; height: 300px;
          top: 40%; left: 40%;
          background: rgba(236,72,153,0.04);
          animation: ws-drift-3 35s ease-in-out infinite;
        }
        .ws-root--light .ws-orb--1 { background: rgba(6,182,212,0.06); }
        .ws-root--light .ws-orb--2 { background: rgba(139,92,246,0.04); }
        .ws-root--light .ws-orb--3 { background: rgba(236,72,153,0.03); }
        .ws-root--bluelight .ws-orb--1 { background: rgba(251,191,36,0.06); }
        .ws-root--bluelight .ws-orb--2 { background: rgba(217,119,6,0.05); }
        .ws-root--bluelight .ws-orb--3 { background: rgba(245,158,11,0.03); }

        @keyframes ws-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-60px, 50px) scale(1.1); }
        }
        @keyframes ws-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, -40px) scale(1.08); }
        }
        @keyframes ws-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 30px) scale(1.15); }
        }

        /* Dot pattern */
        .ws-dots {
          position: fixed; inset: 0; z-index: 0;
          pointer-events: none;
          background-image: radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 0%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 0%, transparent 100%);
        }
        .ws-root--light .ws-dots {
          background-image: radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px);
        }
        .ws-root--bluelight .ws-dots {
          background-image: radial-gradient(circle, rgba(251,191,36,0.02) 1px, transparent 1px);
        }

        /* Noise */
        .ws-noise {
          position: fixed; inset: 0; z-index: 8000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 200px;
          opacity: 0.018;
        }

        /* ═══════════════════════════════════════
           LAYOUT
           ═══════════════════════════════════════ */
        .ws-layout {
          position: relative; z-index: 10;
          display: flex; flex-direction: column;
          min-height: 100vh;
          padding: 1.25rem 1.5rem 1rem;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        @media (min-width: 768px) {
          .ws-layout { padding: 1.5rem 2rem 1.25rem; }
        }
        @media (min-width: 1024px) {
          .ws-layout { padding: 2rem 2.5rem 1.5rem; }
        }

        /* ═══════════════════════════════════════
           ENTRANCE ANIMATION
           ═══════════════════════════════════════ */
        .ws-in {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }

        /* ═══════════════════════════════════════
           HEADER
           ═══════════════════════════════════════ */
        .ws-header {
          display: flex; align-items: center; justify-content: space-between;
          padding-bottom: 1.5rem;
          opacity: 0; transform: translateY(-12px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-header-left { display: flex; align-items: center; gap: 0.5rem; }

        .ws-logo {
          display: flex; align-items: center; gap: 0.5rem;
          opacity: 0; transform: translateX(-8px);
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.05s;
        }
        .ws-logo-icon {
          width: 28px; height: 28px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--ws-accent-cyan), var(--ws-accent-purple));
          box-shadow: 0 0 20px rgba(6,182,212,0.20), 0 0 40px rgba(139,92,246,0.10);
          flex-shrink: 0;
        }
        .ws-logo-icon--bluelight {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 0 20px rgba(245,158,11,0.20);
        }
        .ws-logo-label {
          font-size: 0.95rem; font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--ws-text);
          opacity: 0.7;
        }

        .ws-header-right { display: flex; align-items: center; gap: 0.75rem; }

        .ws-time {
          font-size: 0.78rem; font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--ws-text-dim);
          letter-spacing: 0.02em;
        }

        .ws-header-badge {
          display: flex; align-items: center; gap: 0.4rem;
          font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 0.3rem 0.7rem;
          border-radius: 100px;
          background: var(--ws-card-bg);
          border: 1px solid var(--ws-card-border);
          color: var(--ws-text-muted);
        }
        .ws-pulse-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34,197,94,0.4);
          animation: ws-pulse 2s ease-in-out infinite;
        }
        .ws-pulse-dot--bluelight { background: #fbbf24; box-shadow: 0 0 8px rgba(251,191,36,0.4); }
        @keyframes ws-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        /* ═══════════════════════════════════════
           BENTO GRID
           ═══════════════════════════════════════ */
        .ws-bento {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.875rem;
          flex: 1;
        }
        @media (min-width: 640px) {
          .ws-bento { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .ws-bento {
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
          }
        }

        /* ═══════════════════════════════════════
           CARD BASE
           ═══════════════════════════════════════ */
        .ws-card {
          position: relative;
          border-radius: 16px;
          background: var(--ws-card-bg);
          border: 1px solid var(--ws-card-border);
          overflow: hidden;
          opacity: 0;
          transform: translateY(16px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          /* Subtle glass effect */
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .ws-card:hover {
          background: var(--ws-card-hover);
          border-color: var(--ws-card-border-hover);
        }
        .ws-root--light .ws-card {
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02);
        }

        /* ═══════════════════════════════════════
           HERO CARD
           ═══════════════════════════════════════ */
        .ws-hero-card {
          grid-column: 1 / -1;
          padding: 2rem 2rem 1.75rem;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          min-height: 220px;
        }
        @media (min-width: 640px) {
          .ws-hero-card { padding: 2.5rem; min-height: 240px; }
        }
        @media (min-width: 1024px) {
          .ws-hero-card { grid-column: span 3; min-height: 260px; }
        }

        .ws-hero-glow {
          position: absolute;
          top: -60px; right: -40px;
          width: 300px; height: 300px;
          border-radius: 50%;
          filter: blur(100px);
          pointer-events: none;
          z-index: 0;
        }
        .ws-hero-glow--dark,
        .ws-hero-glow--bluelight {
          background: radial-gradient(circle, rgba(6,182,212,0.08), transparent 70%);
        }
        .ws-hero-glow--light {
          background: radial-gradient(circle, rgba(6,182,212,0.06), transparent 70%);
        }

        .ws-hero-content { position: relative; z-index: 1; }

        .ws-greeting {
          font-size: 0.8rem; font-weight: 500;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
          margin-bottom: 0.4rem;
        }
        .ws-hero-title {
          font-size: clamp(1.8rem, 5vw, 2.8rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.1;
          margin-bottom: 0.75rem;
        }
        .ws-hero-title--dark {
          color: transparent;
          background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #e2e8f0 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .ws-hero-title--light {
          color: transparent;
          background: linear-gradient(135deg, #0f172a 0%, #475569 50%, #0f172a 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .ws-hero-title--bluelight {
          color: transparent;
          background: linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #fbbf24 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .ws-name-highlight {
          /* Same gradient as parent title */
        }

        .ws-tagline {
          display: flex; align-items: center; gap: 0.6rem;
          margin-bottom: 1.5rem;
        }
        .ws-tagline-bar {
          width: 20px; height: 1px;
          background: var(--ws-text-dim);
          flex-shrink: 0;
        }
        .ws-tagline--dark { color: rgba(255,255,255,0.40); font-size: 0.9rem; font-style: italic; letter-spacing: 0.01em; }
        .ws-tagline--light { color: rgba(0,0,0,0.35); font-size: 0.9rem; font-style: italic; letter-spacing: 0.01em; }
        .ws-tagline--bluelight { color: rgba(251,191,36,0.45); font-size: 0.9rem; font-style: italic; letter-spacing: 0.01em; }

        .ws-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          background: currentColor;
          vertical-align: text-bottom;
          margin-left: 1px;
        }
        .ws-cursor--blink { animation: ws-blink 1s step-end infinite; }
        @keyframes ws-blink { 50% { opacity: 0; } }

        .ws-hero-actions {
          display: flex; align-items: center; gap: 0.6rem;
          flex-wrap: wrap;
        }

        /* Primary button */
        .ws-btn-primary {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.65rem 1.4rem;
          border-radius: 10px;
          border: none;
          font-family: inherit;
          font-size: 0.82rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-btn-primary--dark {
          background: linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15));
          color: #06b6d4;
          border: 1px solid rgba(6,182,212,0.20);
        }
        .ws-btn-primary--dark:hover {
          background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.20));
          border-color: rgba(6,182,212,0.40);
          box-shadow: 0 0 24px rgba(6,182,212,0.12);
          transform: translateY(-1px);
        }
        .ws-btn-primary--light {
          background: linear-gradient(135deg, rgba(6,182,212,0.10), rgba(139,92,246,0.08));
          color: #0891b2;
          border: 1px solid rgba(6,182,212,0.20);
        }
        .ws-btn-primary--light:hover {
          background: linear-gradient(135deg, rgba(6,182,212,0.18), rgba(139,92,246,0.14));
          border-color: rgba(6,182,212,0.35);
          transform: translateY(-1px);
        }
        .ws-btn-primary--bluelight {
          background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(217,119,6,0.10));
          color: #f59e0b;
          border: 1px solid rgba(251,191,36,0.20);
        }
        .ws-btn-primary--bluelight:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.22), rgba(217,119,6,0.18));
          border-color: rgba(251,191,36,0.40);
          box-shadow: 0 0 24px rgba(251,191,36,0.12);
          transform: translateY(-1px);
        }

        /* Ghost button */
        .ws-btn-ghost {
          display: inline-flex; align-items: center; gap: 0.45rem;
          padding: 0.65rem 1.2rem;
          border-radius: 10px;
          border: 1px solid var(--ws-card-border);
          background: transparent;
          font-family: inherit;
          font-size: 0.82rem; font-weight: 500;
          cursor: pointer;
          color: var(--ws-text-muted);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-btn-ghost:hover {
          background: var(--ws-card-hover);
          border-color: var(--ws-card-border-hover);
          color: var(--ws-text);
          transform: translateY(-1px);
        }

        /* Hero decorative rings */
        .ws-hero-rings {
          position: absolute;
          right: 1.5rem; top: 50%;
          transform: translateY(-50%);
          width: 180px; height: 180px;
          opacity: 0.5;
          color: var(--ws-accent-cyan);
          animation: ws-ring-rotate 40s linear infinite;
        }
        .ws-hero-rings--bluelight { color: #f59e0b; }
        @media (max-width: 767px) {
          .ws-hero-rings { display: none; }
        }
        @keyframes ws-ring-rotate {
          to { transform: translateY(-50%) rotate(360deg); }
        }

        /* ═══════════════════════════════════════
           STAT CARDS
           ═══════════════════════════════════════ */
        .ws-stat-card {
          padding: 1.25rem;
          display: flex; align-items: center; gap: 0.85rem;
        }
        @media (min-width: 1024px) {
          .ws-stat-card { padding: 1.4rem; }
        }
        .ws-stat-icon-wrap {
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; flex-shrink: 0;
          transition: transform 0.3s;
        }
        .ws-stat-card:hover .ws-stat-icon-wrap { transform: scale(1.08); }
        .ws-stat-icon-wrap--cyan {
          background: var(--ws-accent-cyan-dim);
          color: var(--ws-accent-cyan);
        }
        .ws-stat-icon-wrap--purple {
          background: var(--ws-accent-purple-dim);
          color: var(--ws-accent-purple);
        }
        .ws-stat-icon-wrap--pink {
          background: var(--ws-accent-pink-dim);
          color: var(--ws-accent-pink);
        }

        .ws-stat-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
        .ws-stat-label {
          font-size: 0.68rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
        }
        .ws-stat-value {
          font-size: 0.85rem; font-weight: 600;
          color: var(--ws-text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ═══════════════════════════════════════
           CREDENTIALS CARD
           ═══════════════════════════════════════ */
        .ws-cred-card { position: relative; }
        @media (min-width: 1024px) {
          .ws-cred-card { grid-column: span 2; }
        }
        .ws-cred-card-inner {
          width: 100%; display: flex; align-items: center;
          justify-content: space-between; gap: 1rem;
          padding: 1.5rem; background: none; border: none;
          font-family: inherit; cursor: pointer;
          text-align: left;
        }
        .ws-cred-left { display: flex; align-items: center; gap: 1rem; min-width: 0; }

        .ws-cred-icon-box {
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 12px; flex-shrink: 0;
          transition: all 0.3s;
        }
        .ws-cred-icon-box--dark {
          background: var(--ws-accent-purple-dim);
          border: 1px solid rgba(139,92,246,0.15);
          color: var(--ws-accent-purple);
        }
        .ws-cred-icon-box--light {
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.12);
          color: #7c3aed;
        }
        .ws-cred-icon-box--bluelight {
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.10);
          color: #f59e0b;
        }
        .ws-cred-card:hover .ws-cred-icon-box { transform: scale(1.05); }

        .ws-cred-heading {
          font-size: 0.9rem; font-weight: 600;
          margin-bottom: 0.2rem;
        }
        .ws-cred-heading--dark { color: rgba(255,255,255,0.85); }
        .ws-cred-heading--light { color: rgba(0,0,0,0.80); }
        .ws-cred-heading--bluelight { color: rgba(251,191,36,0.85); }

        .ws-cred-sub {
          font-size: 0.75rem; line-height: 1.4;
        }
        .ws-cred-sub--dark { color: rgba(255,255,255,0.30); }
        .ws-cred-sub--light { color: rgba(0,0,0,0.35); }
        .ws-cred-sub--bluelight { color: rgba(251,191,36,0.35); }

        .ws-cred-arrow-wrap {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px; flex-shrink: 0;
          transition: all 0.3s;
        }
        .ws-cred-arrow-wrap--dark {
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.30);
        }
        .ws-cred-arrow-wrap--light {
          background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.30);
        }
        .ws-cred-arrow-wrap--bluelight {
          background: rgba(251,191,36,0.04); color: rgba(251,191,36,0.30);
        }
        .ws-cred-card:hover .ws-cred-arrow-wrap {
          background: var(--ws-card-hover);
          transform: translate(2px, -2px);
        }

        /* Gradient accent line at bottom */
        .ws-cred-gradient-line {
          height: 2px;
          background: linear-gradient(90deg, var(--ws-accent-cyan), var(--ws-accent-purple), var(--ws-accent-pink));
          opacity: 0; transition: opacity 0.4s;
        }
        .ws-cred-card:hover .ws-cred-gradient-line { opacity: 0.6; }

        /* ═══════════════════════════════════════
           FEATURES CARD
           ═══════════════════════════════════════ */
        .ws-features-card {
          padding: 1.25rem;
        }
        .ws-features-heading {
          font-size: 0.72rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ws-text-dim);
          margin-bottom: 1rem;
        }
        .ws-features-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .ws-feature-item {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.5rem 0.65rem;
          border-radius: 8px;
          font-size: 0.72rem; font-weight: 500;
          color: var(--ws-text-muted);
          border: 1px solid var(--ws-card-border);
          transition: all 0.25s;
        }
        .ws-feature-item:hover {
          background: var(--ws-card-hover);
          border-color: var(--ws-card-border-hover);
          color: var(--ws-text);
        }

        /* ═══════════════════════════════════════
           START CARD
           ═══════════════════════════════════════ */
        .ws-start-card { position: relative; }
        @media (min-width: 1024px) {
          .ws-start-card { grid-column: span 2; }
        }
        .ws-start-card-inner {
          width: 100%; display: flex; align-items: center;
          justify-content: space-between; gap: 1rem;
          padding: 1.5rem; background: none; border: none;
          font-family: inherit; cursor: pointer;
          text-align: left;
        }
        .ws-start-left { display: flex; align-items: center; gap: 1rem; min-width: 0; }

        .ws-start-icon-box {
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 12px; flex-shrink: 0;
          transition: all 0.3s;
        }
        .ws-start-icon-box--dark {
          background: var(--ws-accent-cyan-dim);
          border: 1px solid rgba(6,182,212,0.15);
          color: var(--ws-accent-cyan);
        }
        .ws-start-icon-box--light {
          background: rgba(6,182,212,0.08);
          border: 1px solid rgba(6,182,212,0.12);
          color: #0891b2;
        }
        .ws-start-icon-box--bluelight {
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.10);
          color: #f59e0b;
        }
        .ws-start-card:hover .ws-start-icon-box {
          transform: scale(1.05);
          box-shadow: 0 0 20px rgba(6,182,212,0.15);
        }

        .ws-start-heading {
          font-size: 0.9rem; font-weight: 600;
          margin-bottom: 0.2rem;
        }
        .ws-start-heading--dark { color: rgba(255,255,255,0.85); }
        .ws-start-heading--light { color: rgba(0,0,0,0.80); }
        .ws-start-heading--bluelight { color: rgba(251,191,36,0.85); }

        .ws-start-sub {
          font-size: 0.75rem; line-height: 1.4;
        }
        .ws-start-sub--dark { color: rgba(255,255,255,0.30); }
        .ws-start-sub--light { color: rgba(0,0,0,0.35); }
        .ws-start-sub--bluelight { color: rgba(251,191,36,0.35); }

        .ws-start-badge {
          display: flex; align-items: center; gap: 0.3rem;
          padding: 0.4rem 0.85rem;
          border-radius: 8px; flex-shrink: 0;
          font-size: 0.72rem; font-weight: 600;
          letter-spacing: 0.04em;
          transition: all 0.3s;
        }
        .ws-start-badge--dark {
          background: rgba(6,182,212,0.08);
          border: 1px solid rgba(6,182,212,0.15);
          color: #06b6d4;
        }
        .ws-start-badge--light {
          background: rgba(6,182,212,0.08);
          border: 1px solid rgba(6,182,212,0.15);
          color: #0891b2;
        }
        .ws-start-badge--bluelight {
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.10);
          color: #f59e0b;
        }
        .ws-start-card:hover .ws-start-badge {
          transform: translate(2px, -2px);
        }

        /* Animated accent border at bottom */
        .ws-start-accent {
          position: absolute; bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--ws-accent-cyan), transparent);
          opacity: 0; transition: opacity 0.4s;
        }
        .ws-start-card:hover .ws-start-accent { opacity: 0.7; }

        /* ═══════════════════════════════════════
           STATUS CARD
           ═══════════════════════════════════════ */
        .ws-status-card {
          padding: 1.25rem;
        }
        .ws-status-row {
          display: flex; align-items: center; gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .ws-status-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34,197,94,0.3);
          animation: ws-pulse 2s ease-in-out infinite;
        }
        .ws-status-dot--bluelight {
          background: #fbbf24;
          box-shadow: 0 0 8px rgba(251,191,36,0.3);
        }
        .ws-status-text {
          font-size: 0.78rem; font-weight: 500;
          color: var(--ws-text-muted);
        }
        .ws-status-bars { display: flex; flex-direction: column; gap: 0.5rem; }
        .ws-status-bar-item { display: flex; align-items: center; gap: 0.5rem; }
        .ws-bar-label {
          font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
          width: 28px; flex-shrink: 0;
        }
        .ws-bar-track {
          flex: 1; height: 4px;
          border-radius: 100px;
          background: var(--ws-card-border);
          overflow: hidden;
        }
        .ws-bar-fill {
          height: 100%; border-radius: 100px;
          transition: width 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s;
          width: 0;
        }
        .ws-in .ws-bar-fill { width: inherit; }
        .ws-bar-fill--cyan { background: var(--ws-accent-cyan); box-shadow: 0 0 8px rgba(6,182,212,0.3); }
        .ws-bar-fill--purple { background: var(--ws-accent-purple); box-shadow: 0 0 8px rgba(139,92,246,0.3); }
        .ws-bar-fill--pink { background: var(--ws-accent-pink); box-shadow: 0 0 8px rgba(236,72,153,0.3); }

        /* ═══════════════════════════════════════
           FOOTER
           ═══════════════════════════════════════ */
        .ws-footer {
          display: flex; align-items: center; justify-content: center;
          gap: 0.5rem;
          padding-top: 1.5rem;
          padding-bottom: 0.25rem;
          opacity: 0; transform: translateY(8px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          flex-wrap: wrap;
        }
        .ws-footer-brand {
          font-size: 0.72rem; font-weight: 700;
          color: var(--ws-text-muted);
          letter-spacing: 0.01em;
        }
        .ws-footer-sep {
          font-size: 0.65rem;
          color: var(--ws-text-dim);
        }
        .ws-footer-text {
          font-size: 0.68rem;
          color: var(--ws-text-dim);
        }

        /* ═══════════════════════════════════════
           RESPONSIVE
           ═══════════════════════════════════════ */
        @media (max-width: 639px) {
          .ws-hero-card { min-height: auto; padding: 1.5rem; }
          .ws-hero-actions { flex-direction: column; align-items: flex-start; }
          .ws-btn-primary, .ws-btn-ghost { width: 100%; justify-content: center; }
          .ws-status-card { grid-column: 1 / -1; }
        }
      `}</style>
    </>
  );
}
