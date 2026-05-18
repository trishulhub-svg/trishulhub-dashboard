"use client";

import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowUpRight, KeyRound, Zap, Shield, Globe } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   ORYX — TrishulHub Workspace v3.0
   Inspired by Oryzo/Lusion's cinematic design language.
   Warm earth tones, dashed-line motif, character-level reveal,
   asymmetric split-layout, scroll-position indicator, and
   magazine-style typography with dramatic entrance choreography.
   ═══════════════════════════════════════════════════════════════ */

/* ── Pre-computed static data ── */
const DASHLINE_LABELS = ["TrishulHub", "Workspace", "v3.0"];
const TRISHUL = "TrishulHub";
const TRISHUL_CHARS = TRISHUL.split("");
const FEATURES = [
  { icon: Shield, label: "Secured" },
  { icon: Zap, label: "AI Powered" },
  { icon: Globe, label: "Cloud Native" },
] as const;

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

  /* ── Entrance choreography ── */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(t);
  }, []);

  /* ── Typewriter ── */
  const tagline = "I am ready to cook.";
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => {
    if (!entered) return;
    let idx = 0;
    const iv = setInterval(() => {
      idx++;
      setTypedText(tagline.slice(0, idx));
      if (idx >= tagline.length) { clearInterval(iv); setTypingDone(true); }
    }, 55);
    return () => clearInterval(iv);
  }, [entered]);

  /* ── Subtle mouse-follow glow ── */
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 });
  const glowRef = useRef({ x: 50, y: 50 });
  const rafRef = useRef(0);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      glowRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    const loop = () => {
      setGlowPos({ ...glowRef.current });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(rafRef.current); };
  }, []);

  /* ── Canvas: subtle grid + floating dots ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const dots = Array.from({ length: 50 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.3 + 0.05,
    }));
    let id: number;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const isL = mode === "light", isB = mode === "bluelight";
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > c.width) d.vx *= -1;
        if (d.y < 0 || d.y > c.height) d.vy *= -1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = isL ? `rgba(30,41,59,${d.a})` : isB ? `rgba(251,191,36,${d.a * 0.5})` : `rgba(255,237,215,${d.a * 0.4})`;
        ctx.fill();
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, [mode]);

  /* ── Handlers ── */
  const handleStart = useCallback(() => window.open("https://chat.z.ai", "_blank"), []);
  const handleCredentials = useCallback(() => router.push("/dashboard/credentials"), [router]);

  return (
    <>
      <div className={`ox-root ox-root--${mode}`}>
        {/* ═══ CURSOR GLOW ═══ */}
        <div className="ox-cursor-glow" aria-hidden style={{ left: glowPos.x, top: glowPos.y }} />

        {/* ═══ CANVAS BG ═══ */}
        <canvas ref={canvasRef} className="ox-canvas" aria-hidden />

        {/* ═══ DASHED GRID OVERLAY ═══ */}
        <div className="ox-dash-grid" aria-hidden />

        {/* ═══ NOISE ═══ */}
        <div className="ox-noise" aria-hidden />

        {/* ═══════════════════════════════════════════
            MAIN LAYOUT — Asymmetric Split
            ═══════════════════════════════════════════ */}
        <div className="ox-layout">

          {/* ── LEFT COLUMN: Brand statement ── */}
          <div className={`ox-left ${entered ? "ox-left--visible" : ""}`}>
            <div className="ox-left-inner">
              {/* Logo */}
              <div className="ox-logo-row">
                <div className={`ox-logo-mark ox-logo-mark--${mode}`} />
                <span className={`ox-logo-text ox-logo-text--${mode}`}>TrishulHub</span>
              </div>

              {/* Dashed line separator */}
              <div className={`ox-dashline ox-dashline--${mode}`} />

              {/* Main headline */}
              <div className="ox-headline-block">
                <p className={`ox-tagline-upper ox-tagline-upper--${mode}`}>
                  YOUR PERSONAL
                </p>
                <h1 className={`ox-title ox-title--${mode}`}>
                  {TRISHUL_CHARS.map((ch, i) => (
                    <span
                      key={i}
                      className="ox-char"
                      style={{ animationDelay: `${0.3 + i * 0.06}s` }}
                    >
                      {ch}
                    </span>
                  ))}
                </h1>
                <p className={`ox-tagline-lower ox-tagline-lower--${mode}`}>
                  WORKSPACE
                </p>
              </div>

              {/* Typewriter line */}
              <div className={`ox-typewriter ${entered ? "ox-typewriter--visible" : ""}`}>
                <div className={`ox-typewriter-dot ox-typewriter-dot--${mode}`} />
                <span className={`ox-typewriter-text ox-typewriter-text--${mode}`}>
                  {typedText}
                  <span className={`ox-cursor ${typingDone ? "ox-cursor--blink" : ""}`} />
                </span>
              </div>

              {/* Feature badges with dashed dividers */}
              <div className={`ox-features ${entered ? "ox-features--visible" : ""}`}>
                {FEATURES.map((f, i) => (
                  <div key={f.label} className="ox-feature-item">
                    {i > 0 && <div className={`ox-feature-sep ox-feature-sep--${mode}`} />}
                    <f.icon size={13} strokeWidth={2} className={`ox-feature-icon ox-feature-icon--${mode}`} />
                    <span className={`ox-feature-label ox-feature-label--${mode}`}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Actions ── */}
          <div className={`ox-right ${entered ? "ox-right--visible" : ""}`}>
            <div className="ox-right-inner">
              {/* START Button — Oryzo-inspired pill */}
              <button
                onClick={handleStart}
                className={`ox-start-btn ox-start-btn--${mode}`}
                type="button"
              >
                <span className="ox-start-inner">
                  <Zap size={16} strokeWidth={2.5} />
                  <span>START</span>
                  <ArrowUpRight size={15} />
                </span>
                <span className="ox-start-glow-ring" aria-hidden />
              </button>
              <p className={`ox-start-hint ox-start-hint--${mode}`}>
                Opens workspace in a new tab
              </p>

              {/* Dashed separator */}
              <div className={`ox-dashline-h ox-dashline-h--${mode}`} />

              {/* Credentials card */}
              <button
                onClick={handleCredentials}
                className={`ox-cred-card ox-cred-card--${mode}`}
                type="button"
              >
                <div className="ox-cred-top">
                  <div className={`ox-cred-icon-wrap ox-cred-icon-wrap--${mode}`}>
                    <KeyRound size={18} />
                  </div>
                  <ArrowUpRight size={14} className={`ox-cred-arrow ox-cred-arrow--${mode}`} />
                </div>
                <div className="ox-cred-body">
                  <span className={`ox-cred-title ox-cred-title--${mode}`}>Claim Credentials</span>
                  <span className={`ox-cred-desc ox-cred-desc--${mode}`}>Get your ID & Password</span>
                </div>
                <div className={`ox-cred-dashline ox-cred-dashline--${mode}`} />
              </button>

              {/* Status badge */}
              <div className={`ox-status-row ${entered ? "ox-status-row--visible" : ""}`}>
                <div className={`ox-status-dot ox-status-dot--${mode}`} />
                <span className={`ox-status-text ox-status-text--${mode}`}>Protocol v5.0</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT EDGE SCROLL INDICATOR (Oryzo-inspired) ═══ */}
        <div className={`ox-scroll-indicator ${entered ? "ox-scroll-indicator--visible" : ""}`}>
          <div className={`ox-scroll-bar ox-scroll-bar--${mode}`} />
          <div className="ox-scroll-labels">
            {DASHLINE_LABELS.map((label, i) => (
              <span
                key={label}
                className={`ox-scroll-label ox-scroll-label--${mode} ${i === 0 ? "ox-scroll-label--active" : ""}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ═══ FOOTER — Bottom bar (Oryzo-inspired) ═══ */}
        <footer className={`ox-footer ${entered ? "ox-footer--visible" : ""}`}>
          <div className={`ox-footer-inner ox-footer-inner--${mode}`}>
            <div className="ox-footer-left">
              <span className={`ox-footer-welcome ox-footer-welcome--${mode}`}>
                Welcome back,
              </span>
              <span className={`ox-footer-name ox-footer-name--${mode}`}>{userName}</span>
            </div>
            <div className={`ox-footer-sep ox-footer-sep--${mode}`} />
            <span className={`ox-footer-role ox-footer-role--${mode}`}>
              {userRole.toUpperCase()}
            </span>
            <div className={`ox-footer-sep ox-footer-sep--${mode}`} />
            <div className={`ox-footer-dot ox-footer-dot--${mode}`} />
          </div>
        </footer>
      </div>

      {/* ═══════════════════════════════════════════════════════
         STYLES — ORYX v3.0
         ═══════════════════════════════════════════════════════ */}
      <style jsx global>{`
        @media (pointer: coarse) {
          .ox-root, .ox-root * { cursor: auto !important; }
        }

        /* ═════════════════════════
           ROOT — Warm Dark (Oryzo-inspired)
           ═════════════════════════ */
        .ox-root {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          margin: -1.25rem;
          margin-top: -1.25rem;
          /* Warm near-black like Oryzo's #100904 */
          background: #0c0906;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
        }
        @media (min-width: 768px) {
          .ox-root { margin: -2rem; margin-top: -2rem; }
        }
        .ox-root--light { background: #faf8f4; }
        .ox-root--bluelight { background: #080606; }

        /* ═════════════════════════
           CURSOR-FOLLOW GLOW
           ═════════════════════════ */
        .ox-cursor-glow {
          position: fixed;
          width: 600px; height: 600px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(220, 80, 0, 0.04) 0%, transparent 70%);
          transition: left 0.4s ease-out, top 0.4s ease-out;
        }
        .ox-root--light .ox-cursor-glow {
          background: radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%);
        }
        .ox-root--bluelight .ox-cursor-glow {
          background: radial-gradient(circle, rgba(251, 191, 36, 0.05) 0%, transparent 70%);
        }

        /* ═════════════════════════
           CANVAS BG
           ═════════════════════════ */
        .ox-canvas {
          position: fixed; inset: 0; z-index: 2;
          pointer-events: none; opacity: 0.6;
        }
        .ox-root--light .ox-canvas { opacity: 0.3; }

        /* ═════════════════════════
           DASHED GRID OVERLAY (Oryzo's signature motif)
           ═════════════════════════ */
        .ox-dash-grid {
          position: fixed; inset: 0; z-index: 3;
          pointer-events: none;
          background-image:
            repeating-linear-gradient(90deg, rgba(255,237,215,0.015) 0 1px, transparent 1px 80px),
            repeating-linear-gradient(0deg, rgba(255,237,215,0.015) 0 1px, transparent 1px 80px);
          mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 0%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 0%, transparent 100%);
        }
        .ox-root--light .ox-dash-grid {
          background-image:
            repeating-linear-gradient(90deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 80px),
            repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 80px);
        }

        /* ═════════════════════════
           NOISE TEXTURE
           ═════════════════════════ */
        .ox-noise {
          position: fixed; inset: 0; z-index: 8000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 200px;
          opacity: 0.018;
        }

        /* ═════════════════════════
           MAIN LAYOUT — Asymmetric Split
           ═════════════════════════ */
        .ox-layout {
          position: relative; z-index: 10;
          display: flex;
          min-height: 100vh;
          align-items: center;
        }

        /* ── LEFT COLUMN ── */
        .ox-left {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 4rem 3rem 4rem 4rem;
          opacity: 0;
          transform: translateX(-30px);
          transition: all 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ox-left--visible { opacity: 1; transform: translateX(0); }

        .ox-left-inner {
          max-width: 560px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* Logo row */
        .ox-logo-row {
          display: flex; align-items: center; gap: 0.7rem;
          margin-bottom: 2.5rem;
        }
        .ox-logo-mark {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #dc5000;
          box-shadow: 0 0 12px rgba(220, 80, 0, 0.4);
          animation: ox-logo-pulse 3s ease-in-out infinite;
        }
        .ox-logo-mark--light {
          background: #06b6d4;
          box-shadow: 0 0 12px rgba(6, 182, 212, 0.3);
        }
        .ox-logo-mark--bluelight {
          background: #f59e0b;
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
        }
        @keyframes ox-logo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.4); opacity: 1; }
        }
        .ox-logo-text {
          font-size: 0.82rem; font-weight: 700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .ox-logo-text--dark { color: rgba(255,237,215,0.5); }
        .ox-logo-text--light { color: rgba(30,41,59,0.4); }
        .ox-logo-text--bluelight { color: rgba(251,191,36,0.45); }

        /* Dashed vertical line — Oryzo motif */
        .ox-dashline {
          width: 1px; height: 60px;
          background: repeating-linear-gradient(180deg, rgba(220,80,0,0.25) 0 6px, transparent 6px 12px);
          margin-bottom: 2.5rem;
        }
        .ox-dashline--light {
          background: repeating-linear-gradient(180deg, rgba(6,182,212,0.3) 0 6px, transparent 6px 12px);
        }
        .ox-dashline--bluelight {
          background: repeating-linear-gradient(180deg, rgba(251,191,36,0.25) 0 6px, transparent 6px 12px);
        }

        /* Headline block */
        .ox-headline-block {
          margin-bottom: 2rem;
        }
        .ox-tagline-upper {
          font-size: clamp(0.7rem, 1.8vw, 0.9rem);
          font-weight: 600;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          margin-bottom: 0.6rem;
          opacity: 0;
          transform: translateY(15px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        }
        .ox-left--visible .ox-tagline-upper { opacity: 1; transform: translateY(0); }
        .ox-tagline-upper--dark { color: rgba(255,237,215,0.3); }
        .ox-tagline-upper--light { color: rgba(30,41,59,0.25); }
        .ox-tagline-upper--bluelight { color: rgba(251,191,36,0.3); }

        /* Title — large, uppercase, Oryzo-style */
        .ox-title {
          font-size: clamp(3.5rem, 9vw, 8rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 0.9;
          text-transform: uppercase;
          display: flex;
          overflow: hidden;
        }
        .ox-title--dark {
          color: transparent;
          background: linear-gradient(135deg, #ffedd7 0%, #dc5000 50%, #ffedd7 100%);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .ox-title--light {
          color: transparent;
          background: linear-gradient(135deg, #0f172a 0%, #06b6d4 50%, #0f172a 100%);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .ox-title--bluelight {
          color: transparent;
          background: linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #fbbf24 100%);
          -webkit-background-clip: text;
          background-clip: text;
        }

        /* Character animation — Oryzo-style clip reveal */
        .ox-char {
          display: inline-block;
          opacity: 0;
          transform: translateY(100%);
          animation: ox-char-reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes ox-char-reveal {
          to { opacity: 1; transform: translateY(0); }
        }

        .ox-tagline-lower {
          font-size: clamp(0.7rem, 1.8vw, 0.9rem);
          font-weight: 600;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          margin-top: 0.6rem;
          opacity: 0;
          transform: translateY(15px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.8s;
        }
        .ox-left--visible .ox-tagline-lower { opacity: 1; transform: translateY(0); }
        .ox-tagline-lower--dark { color: rgba(255,237,215,0.3); }
        .ox-tagline-lower--light { color: rgba(30,41,59,0.25); }
        .ox-tagline-lower--bluelight { color: rgba(251,191,36,0.3); }

        /* Typewriter */
        .ox-typewriter {
          display: flex; align-items: center; gap: 0.7rem;
          margin-bottom: 2.5rem;
          opacity: 0; transform: translateX(-10px);
          transition: all 0.8s ease 1s;
        }
        .ox-typewriter--visible { opacity: 1; transform: translateX(0); }

        .ox-typewriter-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: ox-dot-blink 2s ease-in-out infinite;
        }
        .ox-typewriter-dot--dark { background: #dc5000; }
        .ox-typewriter-dot--light { background: #06b6d4; }
        .ox-typewriter-dot--bluelight { background: #f59e0b; }
        @keyframes ox-dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        .ox-typewriter-text {
          font-size: clamp(0.8rem, 1.8vw, 0.95rem);
          font-weight: 300;
          font-style: italic;
          letter-spacing: 0.02em;
        }
        .ox-typewriter-text--dark { color: rgba(255,237,215,0.4); }
        .ox-typewriter-text--light { color: rgba(30,41,59,0.35); }
        .ox-typewriter-text--bluelight { color: rgba(251,191,36,0.45); }

        .ox-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: currentColor;
        }
        .ox-cursor--blink { animation: ox-cursor-blink 1s step-end infinite; }
        @keyframes ox-cursor-blink { 50% { opacity: 0; } }

        /* Feature badges — Oryzo-style horizontal list */
        .ox-features {
          display: flex; align-items: center; gap: 0;
          opacity: 0; transform: translateY(15px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.3s;
        }
        .ox-features--visible { opacity: 1; transform: translateY(0); }

        .ox-feature-item {
          display: flex; align-items: center; gap: 0.4rem;
        }
        .ox-feature-sep {
          width: 1px; height: 14px;
          margin: 0 0.8rem;
          background: repeating-linear-gradient(180deg, rgba(255,237,215,0.15) 0 3px, transparent 3px 6px);
        }
        .ox-feature-sep--light {
          background: repeating-linear-gradient(180deg, rgba(30,41,59,0.12) 0 3px, transparent 3px 6px);
        }
        .ox-feature-sep--bluelight {
          background: repeating-linear-gradient(180deg, rgba(251,191,36,0.12) 0 3px, transparent 3px 6px);
        }
        .ox-feature-icon {
          opacity: 0.5;
        }
        .ox-feature-icon--dark { color: #dc5000; }
        .ox-feature-icon--light { color: #06b6d4; }
        .ox-feature-icon--bluelight { color: #f59e0b; }
        .ox-feature-label {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .ox-feature-label--dark { color: rgba(255,237,215,0.35); }
        .ox-feature-label--light { color: rgba(30,41,59,0.35); }
        .ox-feature-label--bluelight { color: rgba(251,191,36,0.35); }

        /* ── RIGHT COLUMN ── */
        .ox-right {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4rem;
          opacity: 0;
          transform: translateX(30px);
          transition: all 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.15s;
        }
        .ox-right--visible { opacity: 1; transform: translateX(0); }

        .ox-right-inner {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1.2rem;
          width: 300px;
        }

        /* START Button — Oryzo pill style */
        .ox-start-btn {
          position: relative;
          border: none;
          background: none;
          padding: 0;
          font-family: inherit;
          cursor: pointer;
        }
        .ox-start-inner {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 1rem 2rem;
          border-radius: 3em;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          z-index: 1;
        }
        .ox-start-btn--dark .ox-start-inner {
          background: #ffedd7;
          color: #100904;
        }
        .ox-start-btn--light .ox-start-inner {
          background: #0f172a;
          color: #f8fafc;
        }
        .ox-start-btn--bluelight .ox-start-inner {
          background: #fbbf24;
          color: #100904;
        }

        .ox-start-btn:hover .ox-start-inner {
          transform: scale(1.03);
        }
        .ox-start-btn:active .ox-start-inner {
          transform: scale(0.98);
        }

        /* Glow ring on hover */
        .ox-start-glow-ring {
          position: absolute;
          inset: -3px;
          border-radius: 3em;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .ox-start-btn--dark .ox-start-glow-ring {
          box-shadow: 0 0 25px rgba(220, 80, 0, 0.3), 0 0 60px rgba(220, 80, 0, 0.1);
        }
        .ox-start-btn--light .ox-start-glow-ring {
          box-shadow: 0 0 25px rgba(6, 182, 212, 0.3), 0 0 60px rgba(6, 182, 212, 0.1);
        }
        .ox-start-btn--bluelight .ox-start-glow-ring {
          box-shadow: 0 0 25px rgba(245, 158, 11, 0.3), 0 0 60px rgba(245, 158, 11, 0.1);
        }
        .ox-start-btn:hover .ox-start-glow-ring { opacity: 1; }

        .ox-start-hint {
          font-size: 0.65rem;
          letter-spacing: 0.05em;
          padding-left: 0.5rem;
        }
        .ox-start-hint--dark { color: rgba(255,237,215,0.2); }
        .ox-start-hint--light { color: rgba(30,41,59,0.25); }
        .ox-start-hint--bluelight { color: rgba(251,191,36,0.22); }

        /* Horizontal dashed line */
        .ox-dashline-h {
          width: 100%; height: 1px;
          background: repeating-linear-gradient(90deg, rgba(255,237,215,0.12) 0 6px, transparent 6px 12px);
        }
        .ox-dashline-h--light {
          background: repeating-linear-gradient(90deg, rgba(30,41,59,0.08) 0 6px, transparent 6px 12px);
        }
        .ox-dashline-h--bluelight {
          background: repeating-linear-gradient(90deg, rgba(251,191,36,0.1) 0 6px, transparent 6px 12px);
        }

        /* Credentials card — dashed border style */
        .ox-cred-card {
          width: 100%;
          border: none;
          background: none;
          font-family: inherit;
          cursor: pointer;
          text-align: left;
          padding: 1.2rem 0;
          transition: all 0.3s ease;
          position: relative;
        }
        .ox-cred-card:hover { transform: translateX(4px); }

        .ox-cred-top {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .ox-cred-icon-wrap {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          border: 1px dashed;
          transition: all 0.3s;
        }
        .ox-cred-icon-wrap--dark {
          border-color: rgba(255,237,215,0.15);
          color: rgba(255,237,215,0.6);
          background: rgba(255,237,215,0.03);
        }
        .ox-cred-icon-wrap--light {
          border-color: rgba(30,41,59,0.12);
          color: rgba(30,41,59,0.5);
          background: rgba(30,41,59,0.03);
        }
        .ox-cred-icon-wrap--bluelight {
          border-color: rgba(251,191,36,0.15);
          color: rgba(251,191,36,0.6);
          background: rgba(251,191,36,0.03);
        }
        .ox-cred-card:hover .ox-cred-icon-wrap--dark {
          border-color: rgba(220,80,0,0.3);
          background: rgba(220,80,0,0.06);
        }
        .ox-cred-card:hover .ox-cred-icon-wrap--light {
          border-color: rgba(6,182,212,0.3);
          background: rgba(6,182,212,0.06);
        }
        .ox-cred-card:hover .ox-cred-icon-wrap--bluelight {
          border-color: rgba(251,191,36,0.3);
          background: rgba(251,191,36,0.06);
        }
        .ox-cred-arrow {
          opacity: 0.25;
          transition: all 0.3s;
        }
        .ox-cred-arrow--dark { color: #ffedd7; }
        .ox-cred-arrow--light { color: #0f172a; }
        .ox-cred-arrow--bluelight { color: #fbbf24; }
        .ox-cred-card:hover .ox-cred-arrow {
          opacity: 0.7; transform: translate(2px, -2px);
        }

        .ox-cred-body {
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        .ox-cred-title {
          font-size: 0.82rem; font-weight: 600;
          letter-spacing: 0.02em;
        }
        .ox-cred-title--dark { color: rgba(255,237,215,0.7); }
        .ox-cred-title--light { color: rgba(30,41,59,0.7); }
        .ox-cred-title--bluelight { color: rgba(251,191,36,0.7); }
        .ox-cred-desc {
          font-size: 0.68rem;
        }
        .ox-cred-desc--dark { color: rgba(255,237,215,0.25); }
        .ox-cred-desc--light { color: rgba(30,41,59,0.3); }
        .ox-cred-desc--bluelight { color: rgba(251,191,36,0.28); }

        .ox-cred-dashline {
          width: 100%; height: 1px;
          margin-top: 1rem;
          background: repeating-linear-gradient(90deg, rgba(255,237,215,0.06) 0 4px, transparent 4px 8px);
        }
        .ox-cred-dashline--light {
          background: repeating-linear-gradient(90deg, rgba(30,41,59,0.04) 0 4px, transparent 4px 8px);
        }

        /* Status row */
        .ox-status-row {
          display: flex; align-items: center; gap: 0.5rem;
          opacity: 0; transform: translateY(10px);
          transition: all 0.8s ease 1.5s;
        }
        .ox-status-row--visible { opacity: 1; transform: translateY(0); }

        .ox-status-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
        }
        .ox-status-dot--dark { background: rgba(255,237,215,0.2); }
        .ox-status-dot--light { background: rgba(30,41,59,0.15); }
        .ox-status-dot--bluelight { background: rgba(251,191,36,0.2); }
        .ox-status-text {
          font-size: 0.58rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }
        .ox-status-text--dark { color: rgba(255,237,215,0.15); }
        .ox-status-text--light { color: rgba(30,41,59,0.2); }
        .ox-status-text--bluelight { color: rgba(251,191,36,0.18); }

        /* ═════════════════════════
           RIGHT EDGE SCROLL INDICATOR
           ═════════════════════════ */
        .ox-scroll-indicator {
          position: fixed;
          right: 1.5rem;
          top: 50%;
          transform: translateY(-50%);
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.8rem;
          opacity: 0;
          transition: opacity 1s ease 2s;
        }
        .ox-scroll-indicator--visible { opacity: 1; }

        .ox-scroll-bar {
          width: 2px; height: 80px;
          border-radius: 1px;
          position: relative;
          overflow: hidden;
        }
        .ox-scroll-bar--dark { background: rgba(255,237,215,0.06); }
        .ox-scroll-bar--light { background: rgba(30,41,59,0.06); }
        .ox-scroll-bar--bluelight { background: rgba(251,191,36,0.06); }

        .ox-scroll-labels {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
        }
        .ox-scroll-label {
          font-size: 0.5rem;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          opacity: 0.15;
          transition: opacity 0.3s;
        }
        .ox-scroll-label--active { opacity: 0.5; }
        .ox-scroll-label--dark { color: #ffedd7; }
        .ox-scroll-label--light { color: #0f172a; }
        .ox-scroll-label--bluelight { color: #fbbf24; }

        /* ═════════════════════════
           FOOTER
           ═════════════════════════ */
        .ox-footer {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 50;
          padding: 1rem 4rem;
          opacity: 0;
          transition: opacity 1s ease 2s;
        }
        .ox-footer--visible { opacity: 1; }

        .ox-footer-inner {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.6rem 1.2rem;
          border-radius: 3em;
          border: 1px dashed;
          width: fit-content;
        }
        .ox-footer-inner--dark {
          border-color: rgba(255,237,215,0.06);
          background: rgba(255,237,215,0.01);
        }
        .ox-footer-inner--light {
          border-color: rgba(30,41,59,0.06);
          background: rgba(30,41,59,0.01);
        }
        .ox-footer-inner--bluelight {
          border-color: rgba(251,191,36,0.06);
          background: rgba(251,191,36,0.01);
        }

        .ox-footer-left {
          display: flex; align-items: center; gap: 0.4rem;
        }
        .ox-footer-welcome {
          font-size: 0.7rem; font-weight: 400;
          letter-spacing: 0.04em;
        }
        .ox-footer-welcome--dark { color: rgba(255,237,215,0.2); }
        .ox-footer-welcome--light { color: rgba(30,41,59,0.3); }
        .ox-footer-welcome--bluelight { color: rgba(251,191,36,0.25); }

        .ox-footer-name {
          font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.04em;
        }
        .ox-footer-name--dark { color: rgba(255,237,215,0.45); }
        .ox-footer-name--light { color: rgba(30,41,59,0.55); }
        .ox-footer-name--bluelight { color: rgba(251,191,36,0.5); }

        .ox-footer-sep {
          width: 1px; height: 12px;
        }
        .ox-footer-sep--dark { background: rgba(255,237,215,0.08); }
        .ox-footer-sep--light { background: rgba(30,41,59,0.08); }
        .ox-footer-sep--bluelight { background: rgba(251,191,36,0.08); }

        .ox-footer-role {
          font-size: 0.55rem; font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .ox-footer-role--dark { color: rgba(255,237,215,0.15); }
        .ox-footer-role--light { color: rgba(30,41,59,0.2); }
        .ox-footer-role--bluelight { color: rgba(251,191,36,0.18); }

        .ox-footer-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          animation: ox-dot-blink 2.5s ease-in-out infinite;
        }
        .ox-footer-dot--dark { background: #dc5000; opacity: 0.5; }
        .ox-footer-dot--light { background: #06b6d4; opacity: 0.5; }
        .ox-footer-dot--bluelight { background: #f59e0b; opacity: 0.5; }

        /* ═════════════════════════
           RESPONSIVE
           ═════════════════════════ */
        @media (max-width: 900px) {
          .ox-layout {
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
          }
          .ox-left {
            padding: 3rem 2rem 2rem;
            transform: translateY(-20px);
          }
          .ox-left--visible { transform: translateY(0); }
          .ox-left-inner { max-width: 100%; align-items: center; }
          .ox-headline-block { display: flex; flex-direction: column; align-items: center; }
          .ox-features { justify-content: center; }
          .ox-right {
            padding: 2rem;
            transform: translateY(20px);
          }
          .ox-right--visible { transform: translateY(0); }
          .ox-right-inner {
            align-items: center;
            width: 100%;
            max-width: 300px;
          }
          .ox-scroll-indicator { display: none; }
          .ox-footer { padding: 0.8rem 1.5rem; justify-content: center; }
          .ox-footer-inner { margin: 0 auto; }
          .ox-dashline { margin: 0 auto 2rem; }
          .ox-typewriter { justify-content: center; }
        }
        @media (max-width: 400px) {
          .ox-title { font-size: clamp(2.8rem, 12vw, 4rem); }
          .ox-start-inner { padding: 0.85rem 1.5rem; font-size: 0.78rem; }
        }
      `}</style>
    </>
  );
}
