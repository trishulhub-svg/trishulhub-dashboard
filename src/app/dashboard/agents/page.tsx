"use client";

import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { KeyRound, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import dynamic from "next/dynamic";

/* ─── Three.js Canvas (dynamic import — no SSR) ─── */
const ParticleCanvas = dynamic(() => import("./ParticleCanvas"), { ssr: false });

/* ─── Shape Data ─── */
const SHAPES = [
  { key: "Trishulhub", title: "TRISHULHUB", desc: "Your Personal Workspace." },
  { key: "AI", title: "AI POWERED", desc: "Intelligent automation at your fingertips." },
  { key: "Secure", title: "SECURE", desc: "Enterprise-grade security protocols." },
  { key: "Protocol", title: "LIVE PROTOCOL", desc: "Real-time collaboration & deployment." },
  { key: "Workspace", title: "WORKSPACE", desc: "Everything you need, in one place." },
  { key: "Ready", title: "READY?", desc: "I am ready to cook." },
];

/* ─── Component ─── */
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

  /* ── Loading Screen ── */
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setLoading(false), 400);
          return 100;
        }
        return prev + Math.random() * 18 + 5;
      });
    }, 150);
    return () => clearInterval(interval);
  }, []);

  /* ── Shape Navigation ── */
  const [shapeIndex, setShapeIndex] = useState(0);
  const [displayTitle, setDisplayTitle] = useState(SHAPES[0].title);
  const [displayDesc, setDisplayDesc] = useState(SHAPES[0].desc);
  const [titleFading, setTitleFading] = useState(false);

  const changeShape = useCallback((dir: number) => {
    setTitleFading(true);
    setTimeout(() => {
      setShapeIndex((prev) => {
        const next = (prev + dir + SHAPES.length) % SHAPES.length;
        setDisplayTitle(SHAPES[next].title);
        setDisplayDesc(SHAPES[next].desc);
        return next;
      });
      setTitleFading(false);
    }, 300);
  }, []);

  /* ── Custom cursor ── */
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const cursorPos = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const animateCursor = () => {
      const lerp = 0.12;
      cursorPos.current.x += (mousePos.current.x - cursorPos.current.x) * lerp;
      cursorPos.current.y += (mousePos.current.y - cursorPos.current.y) * lerp;
      if (cursorRef.current)
        cursorRef.current.style.transform = `translate3d(${cursorPos.current.x - 20}px, ${cursorPos.current.y - 20}px, 0)`;
      if (cursorDotRef.current)
        cursorDotRef.current.style.transform = `translate3d(${mousePos.current.x - 4}px, ${mousePos.current.y - 4}px, 0)`;
      rafRef.current = requestAnimationFrame(animateCursor);
    };
    window.addEventListener("mousemove", handleMouseMove);
    rafRef.current = requestAnimationFrame(animateCursor);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  /* ── Handlers ── */
  const handleStart = useCallback(() => {
    window.open("https://chat.z.ai", "_blank");
  }, []);
  const handleCredentials = useCallback(() => {
    router.push("/dashboard/credentials");
  }, [router]);
  const handleSignOut = useCallback(() => {
    window.location.href = "/api/auth/signout";
  }, []);

  return (
    <>
      {/* ── Loading Screen ── */}
      <div className={`brainit-loader ${!loading ? "brainit-loader--hidden" : ""}`}>
        <div className="brainit-loader-text">One moment please...</div>
        <div className="brainit-loader-bar-track">
          <div
            className="brainit-loader-bar-fill"
            style={{ width: `${Math.min(loadProgress, 100)}%` }}
          />
        </div>
      </div>

      {/* ── Custom Cursor ── */}
      <div ref={cursorRef} className="brainit-cursor" aria-hidden />
      <div ref={cursorDotRef} className="brainit-cursor-dot" aria-hidden />

      {/* ── Full-bleed wrapper ── */}
      <div className={`brainit-root brainit-root--${mode}`}>
        {/* Three.js Particle Canvas */}
        <div className="brainit-canvas-wrap">
          <ParticleCanvas shapeIndex={shapeIndex} mode={mode} />
        </div>

        {/* Noise overlay */}
        <div className="brainit-noise" aria-hidden />

        {/* Vignette */}
        <div className="brainit-vignette" aria-hidden />

        {/* ──────── TOP CONTROLS BAR (Shape Slider) ──────── */}
        <div className="brainit-shape-slider">
          <button
            onClick={() => changeShape(-1)}
            className="brainit-shape-arrow"
            type="button"
            aria-label="Previous shape"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="brainit-shape-label">
            <span
              className={`brainit-shape-title ${titleFading ? "brainit-fade-out" : "brainit-fade-in"}`}
            >
              {displayTitle}
            </span>
            <span
              className={`brainit-shape-desc ${titleFading ? "brainit-fade-out" : "brainit-fade-in"}`}
            >
              {displayDesc}
            </span>
          </div>
          <button
            onClick={() => changeShape(1)}
            className="brainit-shape-arrow"
            type="button"
            aria-label="Next shape"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* ──────── ZOOM PROGRESS BAR (Right Side) ──────── */}
        <div className="brainit-progress">
          <div className="brainit-progress-dot brainit-progress-dot--top" />
          <div className="brainit-progress-track">
            <div
              className="brainit-progress-fill"
              style={{ height: `${((shapeIndex + 1) / SHAPES.length) * 100}%` }}
            />
          </div>
          <div className="brainit-progress-dot brainit-progress-dot--bottom" />
        </div>

        {/* ──────── HERO CENTER TEXT ──────── */}
        <div className="brainit-hero-text">
          <h1 className="brainit-hero-heading">TRISHULHUB</h1>
          <p className="brainit-hero-sub">Your Personal Workspace</p>
        </div>

        {/* ──────── BOTTOM NAV BAR ──────── */}
        <div className="brainit-bottom-bar">
          {/* Animated glow dome */}
          <div className="brainit-glow-dome" aria-hidden />

          {/* Logo left */}
          <div className="brainit-bar-logo">
            <span className="brainit-logo-text">TrishulHub</span>
          </div>

          {/* Nav center */}
          <nav className="brainit-nav">
            <button onClick={handleStart} className="brainit-nav-link brainit-nav-link--active" type="button">
              <span className="brainit-nav-icon">🚀</span>
              Start
            </button>
            <button onClick={handleCredentials} className="brainit-nav-link" type="button">
              <span className="brainit-nav-icon">🔑</span>
              Credentials
            </button>
            <button onClick={handleSignOut} className="brainit-nav-link" type="button">
              <span className="brainit-nav-icon">
                <LogOut size={16} />
              </span>
              Sign Out
            </button>
          </nav>

          {/* Welcome right */}
          <div className="brainit-bar-user">
            <span className="brainit-user-name">{userName}</span>
            <span className="brainit-user-role">{userRole}</span>
          </div>
        </div>
      </div>

      {/* ═══ STYLES ═══ */}
      <style jsx global>{`
        /* ═══════════════════════════════════
           BRAINIT-INSPIRED TRISHULHUB WORKSPACE
           ═══════════════════════════════════ */

        /* ── Hide cursor on touch ── */
        @media (pointer: coarse) {
          .brainit-cursor, .brainit-cursor-dot { display: none !important; }
          .brainit-root, .brainit-root * { cursor: auto !important; }
        }

        /* ── Cursor hide for desktop ── */
        .brainit-root, .brainit-root * { cursor: none !important; }
        @media (pointer: coarse) {
          .brainit-root, .brainit-root * { cursor: auto !important; }
        }

        .brainit-cursor {
          position: fixed; top: 0; left: 0;
          width: 40px; height: 40px; border-radius: 50%;
          pointer-events: none; z-index: 99999; will-change: transform;
          mix-blend-mode: difference;
          border: 1.5px solid rgba(255,255,255,0.35);
          transition: width 0.3s, height 0.3s;
        }
        .brainit-cursor-dot {
          position: fixed; top: 0; left: 0;
          width: 8px; height: 8px; border-radius: 50%;
          pointer-events: none; z-index: 99999; will-change: transform;
          background: #fff;
        }

        /* ═══ LOADING SCREEN ═══ */
        .brainit-loader {
          position: fixed; inset: 0; z-index: 100000;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: #000; gap: 1.5rem;
          transition: opacity 0.6s ease-out;
        }
        .brainit-loader--hidden { opacity: 0; pointer-events: none; }
        .brainit-loader-text {
          font-family: 'Arial', sans-serif;
          font-size: 1.2rem; color: #fff;
          letter-spacing: 2px; opacity: 0.7;
        }
        .brainit-loader-bar-track {
          width: 60%; max-width: 300px; height: 6px;
          border-radius: 3px; background: rgba(255,255,255,0.1);
          overflow: hidden;
        }
        .brainit-loader-bar-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #00A2FF, #00FFEA);
          transition: width 0.15s ease-out;
          box-shadow: 0 0 15px rgba(0,255,234,0.4);
        }

        /* ═══ ROOT ═══ */
        .brainit-root {
          position: relative; min-height: 100vh; overflow: hidden;
          margin: -1.25rem; margin-top: -1.25rem;
          background: #000000;
          font-family: 'Arial', sans-serif;
        }
        @media (min-width: 768px) {
          .brainit-root { margin: -2rem; margin-top: -2rem; }
        }
        .brainit-root--light { background: #f8f9fc; }
        .brainit-root--bluelight { background: #0c0a09; }

        /* ── Canvas ── */
        .brainit-canvas-wrap {
          position: fixed; inset: 0; z-index: 0;
        }
        .brainit-canvas-wrap canvas {
          width: 100% !important; height: 100% !important;
        }

        /* ── Noise ── */
        .brainit-noise {
          position: fixed; inset: 0; z-index: 9000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 180px;
          opacity: 0.03;
        }

        /* ── Vignette ── */
        .brainit-vignette {
          position: fixed; inset: 0; z-index: 8999;
          pointer-events: none;
          background: radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(0,0,0,0.5) 100%);
        }
        .brainit-root--light .brainit-vignette {
          background: radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(200,210,230,0.2) 100%);
        }

        /* ═══ TOP SHAPE SLIDER ═══ */
        .brainit-shape-slider {
          position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
          z-index: 100;
          display: flex; align-items: center; gap: 1.5rem;
          padding: 0.8rem 2rem;
          border-radius: 50px;
          background: rgba(0,0,0,0.3);
          backdrop-filter: blur(5px);
          border: 1px solid rgba(255,255,255,0.1);
          mix-blend-mode: hard-light;
          animation: brainit-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s both;
        }
        .brainit-root--light .brainit-shape-slider {
          background: rgba(255,255,255,0.3);
          border-color: rgba(0,0,0,0.1);
        }

        .brainit-shape-arrow {
          background: none; border: none; padding: 0.2rem;
          color: rgba(255,255,255,0.7); font-size: 1.5rem;
          transition: transform 0.2s, color 0.2s, text-shadow 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .brainit-shape-arrow:hover {
          color: #fff; transform: scale(1.2);
          text-shadow: 0 0 10px rgba(255,255,255,0.5);
        }
        .brainit-root--light .brainit-shape-arrow {
          color: rgba(0,0,0,0.6);
        }
        .brainit-root--light .brainit-shape-arrow:hover {
          color: #000;
        }

        .brainit-shape-label {
          display: flex; flex-direction: column; align-items: center;
          min-width: 180px;
        }
        .brainit-shape-title {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 1.4rem; font-weight: 400;
          letter-spacing: 2px; text-transform: uppercase;
          color: #fff;
          text-shadow: 0 0 10px rgba(255,255,255,0.3);
          transition: opacity 0.3s, transform 0.3s;
        }
        .brainit-shape-desc {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 0.85rem; font-weight: 300;
          color: rgba(255,255,255,0.7);
          margin-top: 4px;
          transition: opacity 0.3s, transform 0.3s;
        }
        .brainit-root--light .brainit-shape-title {
          color: #1a1a2e;
          text-shadow: none;
        }
        .brainit-root--light .brainit-shape-desc {
          color: rgba(0,0,0,0.5);
        }
        .brainit-root--bluelight .brainit-shape-title {
          color: #fbbf24;
          text-shadow: 0 0 10px rgba(251,191,36,0.3);
        }
        .brainit-root--bluelight .brainit-shape-desc {
          color: rgba(251,191,36,0.6);
        }

        .brainit-fade-out { opacity: 0; transform: translateY(-8px); }
        .brainit-fade-in { opacity: 1; transform: translateY(0); }

        /* ═══ ZOOM PROGRESS BAR (Right) ═══ */
        .brainit-progress {
          position: fixed; right: 30px; top: 50%; transform: translateY(-50%);
          z-index: 100; display: flex; flex-direction: column;
          align-items: center; gap: 0;
          animation: brainit-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.8s both;
        }
        .brainit-progress-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00FFEA;
          box-shadow: 0 0 10px #00FFEA;
        }
        .brainit-progress-track {
          width: 4px; height: 280px; border-radius: 4px;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(2px);
          overflow: hidden; position: relative;
        }
        .brainit-progress-fill {
          position: absolute; bottom: 0; width: 100%;
          background: linear-gradient(to top, #00A2FF, #00FFEA);
          border-radius: 4px;
          box-shadow: 0 0 15px rgba(0,255,234,0.6);
          transition: height 0.6s cubic-bezier(0.16,1,0.3,1);
        }

        /* ═══ HERO CENTER TEXT ═══ */
        .brainit-hero-text {
          position: fixed; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 50; text-align: center;
          pointer-events: none;
          animation: brainit-fade-up 1s cubic-bezier(0.16,1,0.3,1) 0.3s both;
        }
        .brainit-hero-heading {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: clamp(2.5rem, 8vw, 5.5rem);
          font-weight: 700;
          letter-spacing: 8px;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 0 40px rgba(0,255,234,0.15), 0 0 80px rgba(0,162,255,0.08);
          margin: 0;
          line-height: 1.1;
        }
        .brainit-hero-sub {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: clamp(0.85rem, 2vw, 1.1rem);
          font-weight: 300;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          margin-top: 0.75rem;
        }
        .brainit-root--light .brainit-hero-heading {
          color: #1a1a2e;
          text-shadow: 0 0 40px rgba(0,162,255,0.08);
        }
        .brainit-root--light .brainit-hero-sub {
          color: rgba(0,0,0,0.4);
        }
        .brainit-root--bluelight .brainit-hero-heading {
          color: #fbbf24;
          text-shadow: 0 0 40px rgba(251,191,36,0.15);
        }
        .brainit-root--bluelight .brainit-hero-sub {
          color: rgba(251,191,36,0.5);
        }

        /* ═══ BOTTOM NAV BAR ═══ */
        .brainit-bottom-bar {
          position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
          z-index: 100;
          width: calc(100% - 60px); max-width: 1100px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.8rem 1.5rem;
          border-radius: 12px;
          background: rgba(25,30,50,0.35);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: inset 0 0 10px rgba(255,255,255,0.05);
          mix-blend-mode: plus-lighter;
          animation: brainit-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 1s both;
        }
        .brainit-root--light .brainit-bottom-bar {
          background: rgba(255,255,255,0.35);
          border-color: rgba(0,0,0,0.1);
          box-shadow: 0 4px 30px rgba(0,0,0,0.08);
          mix-blend-mode: normal;
        }
        .brainit-root--bluelight .brainit-bottom-bar {
          background: rgba(40,30,10,0.35);
          border-color: rgba(251,191,36,0.15);
        }

        /* ── Glow Dome ── */
        .brainit-glow-dome {
          position: absolute; bottom: 0; left: 50%;
          transform: translateX(-50%);
          width: 120%; height: 200%;
          border-radius: 50% 50% 0% 0%;
          background: radial-gradient(ellipse farthest-side at bottom, rgba(0,0,0,0.9) 70%, transparent 100%);
          z-index: -1;
          animation: brainit-glow-pulse 12s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes brainit-glow-pulse {
          0%, 100% {
            filter: drop-shadow(0 20px 60px hsl(300, 30%, 85%));
          }
          25% {
            filter: drop-shadow(0 20px 80px hsl(300, 100%, 65%));
          }
          50% {
            filter: drop-shadow(0 20px 100px hsl(240, 100%, 65%));
          }
          75% {
            filter: drop-shadow(0 20px 70px hsl(180, 80%, 52%));
          }
        }

        /* ── Logo ── */
        .brainit-bar-logo {
          display: flex; align-items: center;
          mix-blend-mode: overlay;
          filter: drop-shadow(0 0 10px rgba(0,0,0,0.5));
          flex-shrink: 0;
        }
        .brainit-logo-text {
          font-size: 1.1rem; font-weight: 700;
          letter-spacing: 1px;
          color: #fff;
        }
        .brainit-root--light .brainit-logo-text { color: #1a1a2e; }
        .brainit-root--bluelight .brainit-logo-text { color: #fbbf24; }

        /* ── Nav Links ── */
        .brainit-nav {
          display: flex; align-items: center; gap: 0.5rem;
        }
        .brainit-nav-link {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.6rem 1.2rem; border-radius: 8px;
          background: none; border: 1px solid transparent;
          color: rgba(255,255,255,0.6);
          font-size: 0.85rem; font-weight: 700;
          font-family: 'Arial', sans-serif;
          transition: all 0.3s ease;
          text-shadow: 0 0 5px rgba(0,128,255,0.3);
        }
        .brainit-nav-link:hover {
          background: rgba(255,255,255,0.05);
          color: #A5C1E9;
          border-color: rgba(106,117,130,0.5);
          text-shadow: 0 0 10px rgba(0,195,255,0.6);
        }
        .brainit-nav-link--active {
          color: #A5C1E9;
          border-color: rgba(106,117,130,0.5);
          background: rgba(0,255,234,0.05);
          text-shadow: 0 0 10px rgba(0,195,255,0.6);
        }
        .brainit-nav-link--active:hover {
          background: rgba(0,255,234,0.1);
        }
        .brainit-root--light .brainit-nav-link {
          color: rgba(0,0,0,0.5);
          text-shadow: none;
        }
        .brainit-root--light .brainit-nav-link:hover,
        .brainit-root--light .brainit-nav-link--active {
          color: #2563eb;
          border-color: rgba(37,99,235,0.3);
          background: rgba(37,99,235,0.05);
          text-shadow: none;
        }
        .brainit-root--bluelight .brainit-nav-link {
          color: rgba(251,191,36,0.6);
          text-shadow: 0 0 5px rgba(251,191,36,0.2);
        }
        .brainit-root--bluelight .brainit-nav-link:hover,
        .brainit-root--bluelight .brainit-nav-link--active {
          color: #fbbf24;
          border-color: rgba(251,191,36,0.4);
          background: rgba(251,191,36,0.08);
          text-shadow: 0 0 10px rgba(251,191,36,0.4);
        }

        .brainit-nav-icon {
          display: flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; font-size: 14px;
        }

        /* ── User Info ── */
        .brainit-bar-user {
          display: flex; flex-direction: column; align-items: flex-end;
          flex-shrink: 0;
        }
        .brainit-user-name {
          font-size: 0.85rem; font-weight: 600;
          color: rgba(255,255,255,0.8);
        }
        .brainit-user-role {
          font-size: 0.65rem; color: rgba(255,255,255,0.35);
          text-transform: uppercase; letter-spacing: 1px;
        }
        .brainit-root--light .brainit-user-name { color: rgba(0,0,0,0.8); }
        .brainit-root--light .brainit-user-role { color: rgba(0,0,0,0.35); }
        .brainit-root--bluelight .brainit-user-name { color: rgba(251,191,36,0.8); }
        .brainit-root--bluelight .brainit-user-role { color: rgba(251,191,36,0.35); }

        /* ═══ ANIMATIONS ═══ */
        @keyframes brainit-fade-up {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        /* Override for elements that don't use translateX */
        .brainit-shape-slider {
          animation-name: brainit-fade-up-simple;
        }
        .brainit-progress {
          animation-name: brainit-fade-up-progress;
        }
        .brainit-hero-text {
          animation-name: brainit-fade-up-hero;
        }
        @keyframes brainit-fade-up-simple {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes brainit-fade-up-progress {
          from { opacity: 0; transform: translateY(-50%) translateX(20px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes brainit-fade-up-hero {
          from { opacity: 0; transform: translate(-50%, -40%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }

        /* ═══ CUSTOM SCROLLBAR ═══ */
        .brainit-root::-webkit-scrollbar { width: 6px; }
        .brainit-root::-webkit-scrollbar-track { background: #0B0B0B; }
        .brainit-root::-webkit-scrollbar-thumb { background: #00FFEA; border-radius: 3px; }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 768px) {
          .brainit-shape-slider {
            top: 15px; padding: 0.6rem 1rem; gap: 0.8rem;
          }
          .brainit-shape-title { font-size: 1rem; }
          .brainit-shape-desc { font-size: 0.7rem; }
          .brainit-progress { right: 15px; }
          .brainit-progress-track { height: 150px; }
          .brainit-bottom-bar {
            bottom: 15px; width: calc(100% - 30px);
            padding: 0.6rem 1rem;
            flex-wrap: wrap; gap: 0.5rem;
                justify-content: center;
          }
          .brainit-bar-logo { display: none; }
          .brainit-bar-user { display: none; }
          .brainit-nav { width: 100%; justify-content: center; }
          .brainit-nav-link { padding: 0.5rem 0.8rem; font-size: 0.75rem; }
          .brainit-hero-heading { letter-spacing: 4px; }
          .brainit-hero-sub { letter-spacing: 2px; }
        }

        @media (max-width: 480px) {
          .brainit-shape-label { min-width: 120px; }
          .brainit-shape-title { font-size: 0.85rem; letter-spacing: 1px; }
          .brainit-shape-desc { display: none; }
          .brainit-hero-heading { letter-spacing: 2px; }
        }
      `}</style>
    </>
  );
}
