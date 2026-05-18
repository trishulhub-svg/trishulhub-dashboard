"use client";

import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowUpRight, KeyRound, Zap, Shield, Globe, Terminal } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   NOVA — TrishulHub Immersive Workspace v2.0
   Cinematic command-center experience with interactive parallax,
   aurora waves, constellation network, and glassmorphism.
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

  /* ── Entrance animation ── */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  /* ── Typewriter effect ── */
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

  /* ── Interactive mouse parallax ── */
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("mousemove", handleMove, { passive: true });
    const loop = () => {
      setMousePos({ ...mouseRef.current });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const parallaxX = (mousePos.x - 0.5) * 2;
  const parallaxY = (mousePos.y - 0.5) * 2;

  /* ── Constellation particles (canvas-based for performance) ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const constellationRef = useRef<{
    particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[];
  }>({ particles: [] });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = window.innerWidth < 768 ? 40 : 80;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
    }));
    constellationRef.current = { particles };

    const connectionDist = 120;
    let animId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isLight = mode === "light";
      const isBlue = mode === "bluelight";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Draw particle
        const color = isLight
          ? `rgba(30, 41, 59, ${p.opacity})`
          : isBlue
          ? `rgba(251, 191, 36, ${p.opacity * 0.6})`
          : `rgba(148, 163, 184, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.15;
            const lineColor = isLight
              ? `rgba(30, 41, 59, ${alpha})`
              : isBlue
              ? `rgba(251, 191, 36, ${alpha * 0.4})`
              : `rgba(148, 163, 184, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  /* ── Pulse waves data ── */
  const pulseWaves = useMemo(() => [0, 1, 2, 3, 4], []);

  /* ── Handlers ── */
  const handleStart = useCallback(() => {
    window.open("https://chat.z.ai", "_blank");
  }, []);
  const handleCredentials = useCallback(() => {
    router.push("/dashboard/credentials");
  }, [router]);

  return (
    <>
      <div className={`nv-root nv-root--${mode}`}>
        {/* ═══════════════════════════════════════
            LAYER 0: Deep Background
            ═══════════════════════════════════════ */}
        <div className="nv-bg" aria-hidden />

        {/* ═══════════════════════════════════════
            LAYER 1: Aurora Waves
            ═══════════════════════════════════════ */}
        <div className="nv-aurora" aria-hidden>
          <div
            className="nv-aurora-field"
            style={{
              transform: `translate(${parallaxX * -15}px, ${parallaxY * -10}px)`,
            }}
          >
            <div className="nv-aurora-wave nv-aurora-wave--1" />
            <div className="nv-aurora-wave nv-aurora-wave--2" />
            <div className="nv-aurora-wave nv-aurora-wave--3" />
            <div className="nv-aurora-wave nv-aurora-wave--4" />
          </div>
        </div>

        {/* ═══════════════════════════════════════
            LAYER 2: Constellation Canvas
            ═══════════════════════════════════════ */}
        <canvas
          ref={canvasRef}
          className="nv-constellation"
          aria-hidden
        />

        {/* ═══════════════════════════════════════
            LAYER 3: Radial Pulse Waves
            ═══════════════════════════════════════ */}
        <div className="nv-pulses" aria-hidden>
          {pulseWaves.map((i) => (
            <div
              key={i}
              className={`nv-pulse nv-pulse--${mode} ${entered ? "nv-pulse--active" : ""}`}
              style={{ animationDelay: `${i * 2.5}s` }}
            />
          ))}
        </div>

        {/* ═══════════════════════════════════════
            LAYER 4: Vignette + Noise
            ═══════════════════════════════════════ */}
        <div className={`nv-vignette nv-vignette--${mode}`} aria-hidden />
        <div className="nv-noise" aria-hidden />

        {/* ═══════════════════════════════════════
            CONTENT LAYER
            ═══════════════════════════════════════ */}
        <div className="nv-content">

          {/* ── Top Bar ── */}
          <div className={`nv-topbar ${entered ? "nv-topbar--visible" : ""}`}>
            <div className="nv-topbar-left">
              <div className={`nv-logo-glow nv-logo-glow--${mode}`} />
              <Terminal size={14} className={`nv-logo-icon nv-logo-icon--${mode}`} />
              <span className={`nv-logo-text nv-logo-text--${mode}`}>TrishulHub</span>
            </div>
            <div className="nv-topbar-right">
              <span className={`nv-badge nv-badge--${mode}`}>Protocol v5.0</span>
            </div>
          </div>

          {/* ── Hero ── */}
          <section
            className="nv-hero"
            style={{
              transform: `translate(${parallaxX * 8}px, ${parallaxY * 5}px)`,
            }}
          >
            {/* Central pulsing core */}
            <div className="nv-core-wrap" aria-hidden>
              <div className={`nv-core nv-core--${mode} ${entered ? "nv-core--active" : ""}`}>
                <div className="nv-core-inner" />
                <div className={`nv-core-ring nv-core-ring--${mode}`} />
                <div className={`nv-core-ring nv-core-ring--2 nv-core-ring--${mode}`} />
                <div className={`nv-core-ring nv-core-ring--3 nv-core-ring--${mode}`} />
              </div>
            </div>

            {/* Title cluster */}
            <div className="nv-title-cluster">
              <h1 className={`nv-title nv-title--${mode} ${entered ? "nv-title--visible" : ""}`}>
                {"TrishulHub".split("").map((char, i) => (
                  <span
                    key={i}
                    className="nv-char"
                    style={{ animationDelay: `${0.2 + i * 0.045}s` }}
                  >
                    {char}
                  </span>
                ))}
              </h1>

              <p className={`nv-subtitle nv-subtitle--${mode} ${entered ? "nv-subtitle--visible" : ""}`}>
                Your Personal Workspace
              </p>

              {/* Typewriter tagline */}
              <div className={`nv-tagline ${entered ? "nv-tagline--visible" : ""}`}>
                <div className={`nv-tagline-bar nv-tagline-bar--${mode}`} />
                <span className={`nv-tagline-text nv-tagline-text--${mode}`}>
                  {typedText}
                  <span className={`nv-cursor ${typingDone ? "nv-cursor--blink" : ""}`} />
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={`nv-actions ${entered ? "nv-actions--visible" : ""}`}>
              {/* START — Primary CTA with animated gradient border */}
              <button
                onClick={handleStart}
                className={`nv-start-btn nv-start-btn--${mode}`}
                type="button"
              >
                <span className="nv-start-glow" aria-hidden />
                <span className="nv-start-border" aria-hidden />
                <span className="nv-start-icon" aria-hidden>
                  <Zap size={18} strokeWidth={2.5} />
                </span>
                <span className="nv-start-label">START</span>
                <span className="nv-start-arrow" aria-hidden>
                  <ArrowUpRight size={16} />
                </span>
              </button>

              <p className={`nv-start-hint nv-start-hint--${mode}`}>
                Opens workspace in a new tab
              </p>

              {/* Credentials — Glass card */}
              <button
                onClick={handleCredentials}
                className={`nv-cred-btn nv-cred-btn--${mode}`}
                type="button"
              >
                <div className={`nv-cred-icon-wrap nv-cred-icon-wrap--${mode}`}>
                  <KeyRound className="nv-cred-icon" />
                </div>
                <div className="nv-cred-text">
                  <span className={`nv-cred-title nv-cred-title--${mode}`}>Claim Credentials</span>
                  <span className={`nv-cred-desc nv-cred-desc--${mode}`}>Get your ID & Password</span>
                </div>
                <ArrowUpRight size={16} className={`nv-cred-arrow nv-cred-arrow--${mode}`} />
              </button>
            </div>
          </section>

          {/* ── Feature Pills ── */}
          <div className={`nv-pills ${entered ? "nv-pills--visible" : ""}`}>
            <div className={`nv-pill nv-pill--${mode}`}>
              <Shield size={13} strokeWidth={2} />
              <span>Secured</span>
            </div>
            <div className="nv-pill-sep" aria-hidden />
            <div className={`nv-pill nv-pill--${mode}`}>
              <Zap size={13} strokeWidth={2} />
              <span>AI Powered</span>
            </div>
            <div className="nv-pill-sep" aria-hidden />
            <div className={`nv-pill nv-pill--${mode}`}>
              <Globe size={13} strokeWidth={2} />
              <span>Cloud Native</span>
            </div>
          </div>

          {/* ── Footer ── */}
          <footer className={`nv-footer ${entered ? "nv-footer--visible" : ""}`}>
            <div className="nv-footer-inner">
              <div className="nv-footer-glow" aria-hidden />
              <p className={`nv-footer-text nv-footer-text--${mode}`}>
                Welcome back,{" "}
                <span className={`nv-footer-name nv-footer-name--${mode}`}>{userName}</span>
              </p>
              <div className={`nv-footer-dot nv-footer-dot--${mode}`} />
              <span className={`nv-footer-role nv-footer-role--${mode}`}>{userRole}</span>
            </div>
          </footer>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         STYLES — NOVA v2.0
         ═══════════════════════════════════════════════════════ */}
      <style jsx global>{`
        /* ── Touch device: disable cursor effects ── */
        @media (pointer: coarse) {
          .nv-root, .nv-root * { cursor: auto !important; }
        }

        /* ═════════════════════════
           ROOT
           ═════════════════════════ */
        .nv-root {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          margin: -1.25rem;
          margin-top: -1.25rem;
          background: #050508;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
        }
        @media (min-width: 768px) {
          .nv-root { margin: -2rem; margin-top: -2rem; }
        }
        .nv-root--light { background: #f8f9fc; }
        .nv-root--bluelight { background: #080606; }

        /* ═════════════════════════
           DEEP BACKGROUND
           ═════════════════════════ */
        .nv-bg {
          position: fixed; inset: 0; z-index: 0;
          background:
            radial-gradient(ellipse 80% 60% at 20% 20%, rgba(6, 182, 212, 0.04) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 80%, rgba(139, 92, 246, 0.03) 0%, transparent 60%),
            radial-gradient(ellipse 90% 70% at 50% 50%, rgba(6, 182, 212, 0.015) 0%, transparent 70%);
        }
        .nv-root--light .nv-bg {
          background:
            radial-gradient(ellipse 80% 60% at 20% 20%, rgba(6, 182, 212, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 80%, rgba(139, 92, 246, 0.04) 0%, transparent 60%);
        }
        .nv-root--bluelight .nv-bg {
          background:
            radial-gradient(ellipse 80% 60% at 20% 20%, rgba(251, 191, 36, 0.04) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 80%, rgba(217, 119, 6, 0.03) 0%, transparent 60%);
        }

        /* ═════════════════════════
           AURORA WAVES
           ═════════════════════════ */
        .nv-aurora {
          position: fixed; inset: 0; z-index: 1;
          overflow: hidden; pointer-events: none;
        }
        .nv-aurora-field {
          position: absolute; inset: -20%;
          transition: transform 0.3s ease-out;
        }
        .nv-aurora-wave {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          will-change: transform;
          mix-blend-mode: screen;
        }
        /* Wave 1 — top-left cyan */
        .nv-aurora-wave--1 {
          width: 700px; height: 700px;
          top: -25%; left: -15%;
          background: rgba(6, 182, 212, 0.08);
          animation: nv-aurora-1 24s ease-in-out infinite;
        }
        /* Wave 2 — bottom-right violet */
        .nv-aurora-wave--2 {
          width: 600px; height: 600px;
          bottom: -20%; right: -10%;
          background: rgba(139, 92, 246, 0.07);
          animation: nv-aurora-2 28s ease-in-out infinite;
        }
        /* Wave 3 — center-right pink */
        .nv-aurora-wave--3 {
          width: 500px; height: 500px;
          top: 20%; right: 10%;
          background: rgba(236, 72, 153, 0.04);
          animation: nv-aurora-3 32s ease-in-out infinite;
        }
        /* Wave 4 — bottom-left blue */
        .nv-aurora-wave--4 {
          width: 450px; height: 450px;
          bottom: 10%; left: 5%;
          background: rgba(59, 130, 246, 0.05);
          animation: nv-aurora-4 22s ease-in-out infinite;
        }

        /* Light mode aurora */
        .nv-root--light .nv-aurora-wave--1 { background: rgba(6, 182, 212, 0.06); mix-blend-mode: multiply; }
        .nv-root--light .nv-aurora-wave--2 { background: rgba(139, 92, 246, 0.05); mix-blend-mode: multiply; }
        .nv-root--light .nv-aurora-wave--3 { background: rgba(236, 72, 153, 0.03); mix-blend-mode: multiply; }
        .nv-root--light .nv-aurora-wave--4 { background: rgba(59, 130, 246, 0.04); mix-blend-mode: multiply; }

        /* Bluelight aurora */
        .nv-root--bluelight .nv-aurora-wave--1 { background: rgba(251, 191, 36, 0.07); }
        .nv-root--bluelight .nv-aurora-wave--2 { background: rgba(217, 119, 6, 0.06); }
        .nv-root--bluelight .nv-aurora-wave--3 { background: rgba(245, 158, 11, 0.03); }
        .nv-root--bluelight .nv-aurora-wave--4 { background: rgba(180, 83, 9, 0.04); }

        @keyframes nv-aurora-1 {
          0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
          25% { transform: translate(100px, 80px) scale(1.15) rotate(5deg); }
          50% { transform: translate(50px, 150px) scale(1.05) rotate(-3deg); }
          75% { transform: translate(-30px, 60px) scale(0.95) rotate(2deg); }
        }
        @keyframes nv-aurora-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-80px, -60px) scale(1.1); }
          66% { transform: translate(60px, -100px) scale(0.9); }
        }
        @keyframes nv-aurora-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-70px, 50px) scale(1.2); }
        }
        @keyframes nv-aurora-4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(50px, -70px) scale(1.08); }
          66% { transform: translate(-40px, 30px) scale(0.95); }
        }

        /* ═════════════════════════
           CONSTELLATION CANVAS
           ═════════════════════════ */
        .nv-constellation {
          position: fixed; inset: 0; z-index: 2;
          pointer-events: none;
          opacity: 0.7;
        }
        .nv-root--light .nv-constellation { opacity: 0.4; }
        .nv-root--bluelight .nv-constellation { opacity: 0.5; }

        /* ═════════════════════════
           PULSE WAVES
           ═════════════════════════ */
        .nv-pulses {
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -55%);
          z-index: 3; pointer-events: none;
        }
        .nv-pulse {
          position: absolute;
          top: 50%; left: 50%;
          width: 10px; height: 10px;
          margin: -5px;
          border-radius: 50%;
          border: 1px solid rgba(6, 182, 212, 0.2);
          opacity: 0;
          animation: nv-pulse-expand 12s ease-out infinite;
        }
        .nv-pulse--light {
          border-color: rgba(6, 182, 212, 0.12);
        }
        .nv-pulse--bluelight {
          border-color: rgba(251, 191, 36, 0.15);
        }
        .nv-pulse--active {
          opacity: 1;
        }

        @keyframes nv-pulse-expand {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(120);
            opacity: 0;
          }
        }

        /* ═════════════════════════
           VIGNETTE & NOISE
           ═════════════════════════ */
        .nv-noise {
          position: fixed; inset: 0; z-index: 8000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 200px;
          opacity: 0.02;
        }
        .nv-vignette {
          position: fixed; inset: 0; z-index: 7999;
          pointer-events: none;
        }
        .nv-vignette--dark, .nv-vignette--bluelight {
          background: radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(0,0,0,0.7) 100%);
        }
        .nv-vignette--light {
          background: radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(160,175,210,0.2) 100%);
        }

        /* ═════════════════════════
           CONTENT LAYOUT
           ═════════════════════════ */
        .nv-content {
          position: relative; z-index: 10;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          min-height: 100vh;
          padding: 2rem 1.5rem;
        }

        /* ═════════════════════════
           TOP BAR
           ═════════════════════════ */
        .nv-topbar {
          position: fixed; top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.1rem 2rem;
          opacity: 0; transform: translateY(-15px);
          transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .nv-topbar--visible { opacity: 1; transform: translateY(0); }

        .nv-topbar-left {
          display: flex; align-items: center; gap: 0.65rem;
        }
        .nv-logo-glow {
          position: absolute;
          left: 2rem; top: 50%;
          transform: translateY(-50%);
          width: 200px; height: 40px;
          border-radius: 20px;
          filter: blur(30px);
          opacity: 0.4;
        }
        .nv-logo-glow--dark { background: rgba(6, 182, 212, 0.15); }
        .nv-logo-glow--light { background: rgba(6, 182, 212, 0.08); }
        .nv-logo-glow--bluelight { background: rgba(251, 191, 36, 0.12); }

        .nv-logo-icon {
          position: relative;
          opacity: 0.6;
        }
        .nv-logo-icon--dark { color: rgba(6, 182, 212, 0.7); }
        .nv-logo-icon--light { color: rgba(6, 182, 212, 0.6); }
        .nv-logo-icon--bluelight { color: rgba(251, 191, 36, 0.6); }

        .nv-logo-text {
          font-size: 0.88rem; font-weight: 700;
          letter-spacing: 0.6px;
        }
        .nv-logo-text--dark { color: rgba(255,255,255,0.65); }
        .nv-logo-text--light { color: rgba(0,0,0,0.55); }
        .nv-logo-text--bluelight { color: rgba(251,191,36,0.6); }

        .nv-badge {
          font-size: 0.62rem; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase;
          padding: 0.28rem 0.7rem;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: rgba(255,255,255,0.3);
        }
        .nv-badge--light {
          border-color: rgba(0,0,0,0.06);
          background: rgba(0,0,0,0.02);
          color: rgba(0,0,0,0.3);
        }
        .nv-badge--bluelight {
          border-color: rgba(251,191,36,0.1);
          background: rgba(251,191,36,0.02);
          color: rgba(251,191,36,0.35);
        }

        /* ═════════════════════════
           HERO SECTION
           ═════════════════════════ */
        .nv-hero {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 0;
          text-align: center;
          position: relative;
          transition: transform 0.15s ease-out;
        }

        /* ── Core Orb ── */
        .nv-core-wrap {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 0;
          pointer-events: none;
        }
        .nv-core {
          position: relative;
          width: 280px; height: 280px;
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity 1.5s ease;
        }
        .nv-core--active { opacity: 1; }

        .nv-core-inner {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(6, 182, 212, 0.8);
          box-shadow:
            0 0 20px rgba(6, 182, 212, 0.6),
            0 0 60px rgba(6, 182, 212, 0.3),
            0 0 120px rgba(139, 92, 246, 0.15);
          animation: nv-core-breathe 4s ease-in-out infinite;
        }
        .nv-root--light .nv-core-inner {
          background: rgba(6, 182, 212, 0.5);
          box-shadow:
            0 0 20px rgba(6, 182, 212, 0.3),
            0 0 60px rgba(6, 182, 212, 0.15);
        }
        .nv-root--bluelight .nv-core-inner {
          background: rgba(251, 191, 36, 0.7);
          box-shadow:
            0 0 20px rgba(251, 191, 36, 0.5),
            0 0 60px rgba(251, 191, 36, 0.25),
            0 0 120px rgba(217, 119, 6, 0.1);
        }

        @keyframes nv-core-breathe {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.8); opacity: 1; }
        }

        .nv-core-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(6, 182, 212, 0.1);
          animation: nv-ring-rotate 25s linear infinite;
        }
        .nv-core-ring--2 {
          inset: 25px;
          border-color: rgba(139, 92, 246, 0.08);
          animation-duration: 35s;
          animation-direction: reverse;
        }
        .nv-core-ring--3 {
          inset: 55px;
          border-color: rgba(236, 72, 153, 0.06);
          animation-duration: 45s;
        }
        .nv-core-ring--bluelight {
          border-color: rgba(251, 191, 36, 0.08);
        }
        .nv-core-ring--2.nv-core-ring--bluelight {
          border-color: rgba(217, 119, 6, 0.06);
        }
        .nv-core-ring--3.nv-core-ring--bluelight {
          border-color: rgba(245, 158, 11, 0.04);
        }
        .nv-root--light .nv-core-ring { border-color: rgba(6, 182, 212, 0.08); }
        .nv-root--light .nv-core-ring--2 { border-color: rgba(139, 92, 246, 0.06); }

        @keyframes nv-ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ── Title ── */
        .nv-title-cluster {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center;
        }

        .nv-title {
          font-size: clamp(3.2rem, 10vw, 7.5rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1;
          display: flex;
          justify-content: center;
          opacity: 0;
          transform: translateY(35px);
          transition: all 1.2s cubic-bezier(0.16, 1, 0.3, 1);
          filter: drop-shadow(0 0 40px rgba(6, 182, 212, 0.08));
        }
        .nv-title--visible { opacity: 1; transform: translateY(0); }

        .nv-title--dark {
          color: transparent;
          background: linear-gradient(135deg, #f1f5f9 0%, #94a3b8 35%, #e2e8f0 65%, #cbd5e1 100%);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .nv-title--light {
          color: transparent;
          background: linear-gradient(135deg, #0f172a 0%, #334155 35%, #1e293b 65%, #475569 100%);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .nv-title--bluelight {
          color: transparent;
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 35%, #fcd34d 65%, #d97706 100%);
          -webkit-background-clip: text;
          background-clip: text;
          filter: drop-shadow(0 0 40px rgba(251, 191, 36, 0.1));
        }

        .nv-char {
          display: inline-block;
          opacity: 0;
          transform: translateY(30px) scale(0.85) rotateX(20deg);
          animation: nv-char-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes nv-char-enter {
          to { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); }
        }

        .nv-subtitle {
          font-size: clamp(0.85rem, 2.5vw, 1.1rem);
          font-weight: 400;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-top: 0.8rem;
          opacity: 0; transform: translateY(18px);
          transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.5s;
        }
        .nv-subtitle--visible { opacity: 1; transform: translateY(0); }

        .nv-subtitle--dark { color: rgba(255,255,255,0.3); }
        .nv-subtitle--light { color: rgba(0,0,0,0.25); }
        .nv-subtitle--bluelight { color: rgba(251,191,36,0.35); }

        /* ── Typewriter Tagline ── */
        .nv-tagline {
          display: flex; align-items: center; gap: 0.8rem;
          margin-top: 1.3rem;
          opacity: 0; transform: translateY(12px);
          transition: all 0.9s ease 1s;
        }
        .nv-tagline--visible { opacity: 1; transform: translateY(0); }

        .nv-tagline-bar {
          width: 28px; height: 2px;
          border-radius: 1px;
          background: linear-gradient(90deg, rgba(6, 182, 212, 0.5), transparent);
          flex-shrink: 0;
        }
        .nv-root--light .nv-tagline-bar {
          background: linear-gradient(90deg, rgba(6, 182, 212, 0.4), transparent);
        }
        .nv-root--bluelight .nv-tagline-bar {
          background: linear-gradient(90deg, rgba(251, 191, 36, 0.5), transparent);
        }

        .nv-tagline-text {
          font-size: clamp(0.85rem, 2vw, 1rem);
          font-weight: 300;
          letter-spacing: 0.02em;
          font-style: italic;
          display: inline;
        }
        .nv-tagline-text--dark { color: rgba(255,255,255,0.45); }
        .nv-tagline-text--light { color: rgba(0,0,0,0.35); }
        .nv-tagline-text--bluelight { color: rgba(251,191,36,0.5); }

        .nv-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: currentColor;
        }
        .nv-cursor--blink {
          animation: nv-cursor-blink 1s step-end infinite;
        }
        @keyframes nv-cursor-blink {
          50% { opacity: 0; }
        }

        /* ═════════════════════════
           ACTION BUTTONS
           ═════════════════════════ */
        .nv-actions {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center; gap: 0.9rem;
          margin-top: 3rem;
          opacity: 0; transform: translateY(25px);
          transition: all 1s cubic-bezier(0.16, 1, 0.3, 1) 1.2s;
        }
        .nv-actions--visible { opacity: 1; transform: translateY(0); }

        /* ── START Button ── */
        .nv-start-btn {
          position: relative;
          display: flex; align-items: center; gap: 0.7rem;
          padding: 0.95rem 2.5rem;
          border-radius: 60px;
          border: 1px solid rgba(6, 182, 212, 0.25);
          background: rgba(6, 182, 212, 0.04);
          color: #06b6d4;
          font-size: 0.95rem; font-weight: 700;
          letter-spacing: 0.18em;
          font-family: inherit;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .nv-start-btn:hover {
          border-color: rgba(6, 182, 212, 0.5);
          background: rgba(6, 182, 212, 0.1);
          box-shadow:
            0 0 40px rgba(6, 182, 212, 0.12),
            0 0 80px rgba(6, 182, 212, 0.06),
            inset 0 0 40px rgba(6, 182, 212, 0.04);
          transform: scale(1.04) translateY(-1px);
        }
        .nv-start-btn:active { transform: scale(0.98); }

        .nv-start-btn--light {
          border-color: rgba(6, 182, 212, 0.35);
          background: rgba(6, 182, 212, 0.06);
          color: #0891b2;
        }
        .nv-start-btn--light:hover {
          border-color: rgba(6, 182, 212, 0.6);
          background: rgba(6, 182, 212, 0.12);
          box-shadow: 0 0 40px rgba(6, 182, 212, 0.08);
        }

        .nv-start-btn--bluelight {
          border-color: rgba(251, 191, 36, 0.25);
          background: rgba(251, 191, 36, 0.04);
          color: #f59e0b;
        }
        .nv-start-btn--bluelight:hover {
          border-color: rgba(251, 191, 36, 0.5);
          background: rgba(251, 191, 36, 0.1);
          box-shadow:
            0 0 40px rgba(251, 191, 36, 0.12),
            0 0 80px rgba(251, 191, 36, 0.06),
            inset 0 0 40px rgba(251, 191, 36, 0.04);
        }

        /* Animated gradient border glow */
        .nv-start-glow {
          position: absolute; inset: -2px;
          border-radius: 62px;
          background: conic-gradient(
            from var(--nv-angle, 0deg),
            transparent 0%,
            rgba(6, 182, 212, 0.3) 10%,
            transparent 20%,
            transparent 100%
          );
          z-index: -1;
          animation: nv-glow-spin 4s linear infinite;
          opacity: 0;
          transition: opacity 0.4s;
        }
        .nv-start-btn:hover .nv-start-glow { opacity: 1; }
        .nv-start-btn--bluelight .nv-start-glow {
          background: conic-gradient(
            from var(--nv-angle, 0deg),
            transparent 0%,
            rgba(251, 191, 36, 0.3) 10%,
            transparent 20%,
            transparent 100%
          );
        }

        @keyframes nv-glow-spin {
          to { --nv-angle: 360deg; }
        }
        @property --nv-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        /* Static border ring */
        .nv-start-border {
          position: absolute; inset: -1px;
          border-radius: 61px;
          border: 1.5px solid transparent;
          border-top-color: rgba(6, 182, 212, 0.35);
          animation: nv-border-spin 3s linear infinite;
          pointer-events: none;
        }
        .nv-start-btn--bluelight .nv-start-border {
          border-top-color: rgba(251, 191, 36, 0.35);
        }
        @keyframes nv-border-spin {
          to { transform: rotate(360deg); }
        }

        .nv-start-icon {
          display: flex; align-items: center;
        }
        .nv-start-arrow {
          display: flex; align-items: center;
          opacity: 0.4;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nv-start-btn:hover .nv-start-arrow {
          opacity: 1; transform: translate(3px, -3px);
        }

        .nv-start-hint {
          font-size: 0.7rem;
          letter-spacing: 0.06em;
          margin-top: -0.2rem;
        }
        .nv-start-hint--dark { color: rgba(255,255,255,0.18); }
        .nv-start-hint--light { color: rgba(0,0,0,0.22); }
        .nv-start-hint--bluelight { color: rgba(251,191,36,0.22); }

        /* ── Credentials Button (Glassmorphism) ── */
        .nv-cred-btn {
          display: flex; align-items: center; gap: 0.9rem;
          padding: 0.9rem 1.6rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          font-family: inherit;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          margin-top: 0.3rem;
          text-align: left;
        }
        .nv-cred-btn:hover {
          border-color: rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          transform: translateX(6px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        }
        .nv-root--light .nv-cred-btn {
          border-color: rgba(0,0,0,0.05);
          background: rgba(255,255,255,0.7);
          backdrop-filter: blur(16px);
        }
        .nv-root--light .nv-cred-btn:hover {
          border-color: rgba(0,0,0,0.1);
          background: rgba(255,255,255,0.9);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
        }
        .nv-root--bluelight .nv-cred-btn {
          border-color: rgba(251,191,36,0.06);
          background: rgba(251,191,36,0.02);
        }
        .nv-root--bluelight .nv-cred-btn:hover {
          border-color: rgba(251,191,36,0.12);
          background: rgba(251,191,36,0.04);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .nv-cred-icon-wrap {
          width: 42px; height: 42px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px;
          background: rgba(139, 92, 246, 0.06);
          border: 1px solid rgba(139, 92, 246, 0.1);
          flex-shrink: 0;
          transition: all 0.4s;
        }
        .nv-cred-btn:hover .nv-cred-icon-wrap {
          background: rgba(139, 92, 246, 0.1);
          border-color: rgba(139, 92, 246, 0.18);
          transform: scale(1.05);
        }
        .nv-cred-icon-wrap--bluelight {
          background: rgba(251,191,36,0.05);
          border-color: rgba(251,191,36,0.08);
        }
        .nv-root--bluelight .nv-cred-btn:hover .nv-cred-icon-wrap {
          background: rgba(251,191,36,0.08);
          border-color: rgba(251,191,36,0.15);
        }

        .nv-cred-icon {
          width: 18px; height: 18px;
          color: #8b5cf6;
        }
        .nv-root--bluelight .nv-cred-icon { color: #f59e0b; }

        .nv-cred-text {
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        .nv-cred-title {
          font-size: 0.85rem; font-weight: 600;
        }
        .nv-cred-title--dark { color: rgba(255,255,255,0.8); }
        .nv-cred-title--light { color: rgba(0,0,0,0.75); }
        .nv-cred-title--bluelight { color: rgba(251,191,36,0.8); }

        .nv-cred-desc {
          font-size: 0.7rem;
        }
        .nv-cred-desc--dark { color: rgba(255,255,255,0.28); }
        .nv-cred-desc--light { color: rgba(0,0,0,0.35); }
        .nv-cred-desc--bluelight { color: rgba(251,191,36,0.32); }

        .nv-cred-arrow {
          opacity: 0.25;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }
        .nv-cred-arrow--dark { color: #fff; }
        .nv-cred-arrow--light { color: #000; }
        .nv-cred-arrow--bluelight { color: #f59e0b; }
        .nv-cred-btn:hover .nv-cred-arrow {
          opacity: 0.6; transform: translate(3px, -3px);
        }

        /* ═════════════════════════
           FEATURE PILLS
           ═════════════════════════ */
        .nv-pills {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 0;
          margin-top: 2.8rem;
          opacity: 0; transform: translateY(18px);
          transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1) 1.5s;
          flex-wrap: wrap; justify-content: center;
        }
        .nv-pills--visible { opacity: 1; transform: translateY(0); }

        .nv-pill {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.38rem 1rem;
          font-size: 0.68rem; font-weight: 500;
          letter-spacing: 0.06em;
          border: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: rgba(255,255,255,0.35);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nv-pill:hover {
          border-color: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.65);
          background: rgba(255,255,255,0.04);
          transform: translateY(-1px);
        }
        .nv-pill--light {
          border-color: rgba(0,0,0,0.05);
          background: rgba(255,255,255,0.5);
          color: rgba(0,0,0,0.4);
        }
        .nv-pill--light:hover {
          border-color: rgba(0,0,0,0.1);
          color: rgba(0,0,0,0.65);
          background: rgba(255,255,255,0.8);
        }
        .nv-pill--bluelight {
          border-color: rgba(251,191,36,0.06);
          background: rgba(251,191,36,0.02);
          color: rgba(251,191,36,0.35);
        }
        .nv-pill--bluelight:hover {
          border-color: rgba(251,191,36,0.15);
          color: rgba(251,191,36,0.65);
          background: rgba(251,191,36,0.04);
        }

        .nv-pill-sep {
          width: 1px; height: 14px;
          background: rgba(255,255,255,0.08);
          margin: 0 0.5rem;
        }
        .nv-root--light .nv-pill-sep { background: rgba(0,0,0,0.08); }
        .nv-root--bluelight .nv-pill-sep { background: rgba(251,191,36,0.1); }

        /* ═════════════════════════
           FOOTER
           ═════════════════════════ */
        .nv-footer {
          position: fixed; bottom: 0; left: 0; right: 0;
          z-index: 100;
          display: flex; justify-content: center;
          padding: 1.3rem 2rem;
          opacity: 0;
          transition: opacity 1s ease 1.8s;
          pointer-events: none;
        }
        .nv-footer--visible { opacity: 1; }

        .nv-footer-inner {
          display: flex; align-items: center; gap: 0.9rem;
          position: relative;
          padding: 0.5rem 1.2rem;
          border-radius: 100px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .nv-root--light .nv-footer-inner {
          background: rgba(255,255,255,0.6);
          border-color: rgba(0,0,0,0.05);
        }
        .nv-root--bluelight .nv-footer-inner {
          background: rgba(251,191,36,0.02);
          border-color: rgba(251,191,36,0.06);
        }

        .nv-footer-glow {
          position: absolute;
          inset: -1px;
          border-radius: 101px;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .nv-footer--visible .nv-footer-glow {
          opacity: 1;
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.05), transparent 50%, rgba(139, 92, 246, 0.03));
        }

        .nv-footer-text {
          font-size: 0.78rem;
        }
        .nv-footer-text--dark { color: rgba(255,255,255,0.22); }
        .nv-footer-text--light { color: rgba(0,0,0,0.3); }
        .nv-footer-text--bluelight { color: rgba(251,191,36,0.28); }

        .nv-footer-name {
          font-weight: 600;
        }
        .nv-footer-name--dark { color: rgba(255,255,255,0.5); }
        .nv-footer-name--light { color: rgba(0,0,0,0.55); }
        .nv-footer-name--bluelight { color: rgba(251,191,36,0.55); }

        .nv-footer-dot {
          width: 3px; height: 3px;
          border-radius: 50%;
          background: rgba(255,255,255,0.12);
        }
        .nv-root--light .nv-footer-dot { background: rgba(0,0,0,0.1); }
        .nv-root--bluelight .nv-footer-dot { background: rgba(251,191,36,0.15); }

        .nv-footer-role {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .nv-footer-role--dark { color: rgba(255,255,255,0.16); }
        .nv-footer-role--light { color: rgba(0,0,0,0.2); }
        .nv-footer-role--bluelight { color: rgba(251,191,36,0.2); }

        /* ═════════════════════════
           RESPONSIVE
           ═════════════════════════ */
        @media (max-width: 640px) {
          .nv-topbar { padding: 0.8rem 1rem; }
          .nv-logo-glow { left: 1rem; width: 120px; }
          .nv-core { width: 200px; height: 200px; }
          .nv-actions { gap: 0.7rem; }
          .nv-start-btn { padding: 0.8rem 2rem; font-size: 0.85rem; }
          .nv-cred-btn { padding: 0.75rem 1.1rem; }
          .nv-cred-icon-wrap { width: 38px; height: 38px; }
          .nv-footer { padding: 1rem; }
          .nv-pills { gap: 0; }
          .nv-pill { padding: 0.3rem 0.75rem; font-size: 0.64rem; }
          .nv-pill-sep { margin: 0 0.35rem; }
        }
        @media (max-width: 380px) {
          .nv-core { width: 150px; height: 150px; }
          .nv-core-ring--2 { inset: 15px; }
          .nv-core-ring--3 { inset: 30px; }
        }
      `}</style>
    </>
  );
}
