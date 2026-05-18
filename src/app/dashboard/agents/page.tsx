"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  useMemo,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  KeyRound,
  Zap,
  Shield,
  Globe,
  ChevronDown,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   ORYZO — TrishulHub Workspace v4.0
   Scroll-driven cinematic reveal. Each section fills the viewport
   and animates in as the user scrolls, inspired by oryzo.ai.
   ═══════════════════════════════════════════════════════════════ */

const TRISHUL = "TrishulHub";
const TRISHUL_CHARS = TRISHUL.split("");
const FEATURES = [
  { icon: Shield, label: "Secured" },
  { icon: Zap, label: "AI Powered" },
  { icon: Globe, label: "Cloud Native" },
] as const;

const SECTIONS = ["Hero", "Features", "Launch", "Welcome"];

/* ── Intersection Observer Hook ── */
function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.25
) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ── Scroll Progress Hook ── */
function useScrollProgress(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [progress, setProgress] = useState(0);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const p = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
      setProgress(Math.min(1, Math.max(0, p)));

      const sectionH = clientHeight;
      const idx = Math.min(SECTIONS.length - 1, Math.floor(scrollTop / sectionH));
      setActiveSection(idx);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  return { progress, activeSection };
}

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

  /* ── Scroll container ref ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const { progress, activeSection } = useScrollProgress(scrollRef);

  /* ── Section observers ── */
  const hero = useScrollReveal<HTMLDivElement>(0.15);
  const features = useScrollReveal<HTMLDivElement>(0.2);
  const launch = useScrollReveal<HTMLDivElement>(0.2);
  const welcome = useScrollReveal<HTMLDivElement>(0.2);

  /* ── Typewriter (triggers when hero is visible) ── */
  const tagline = "I am ready to cook.";
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const typingStarted = useRef(false);

  useEffect(() => {
    if (!hero.visible || typingStarted.current) return;
    typingStarted.current = true;
    let idx = 0;
    const iv = setInterval(() => {
      idx++;
      setTypedText(tagline.slice(0, idx));
      if (idx >= tagline.length) {
        clearInterval(iv);
        setTypingDone(true);
      }
    }, 55);
    return () => clearInterval(iv);
  }, [hero.visible]);

  /* ── Mouse-follow glow ── */
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 });
  const glowRef = useRef({ x: 50, y: 50 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      glowRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    const loop = () => {
      setGlowPos({ ...glowRef.current });
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(id);
    };
  }, []);

  /* ── Canvas: subtle floating particles ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const dots = Array.from({ length: 40 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: Math.random() * 1.2 + 0.4,
      a: Math.random() * 0.25 + 0.05,
    }));
    let id: number;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const isL = mode === "light",
        isB = mode === "bluelight";
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > c.width) d.vx *= -1;
        if (d.y < 0 || d.y > c.height) d.vy *= -1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = isL
          ? `rgba(30,41,59,${d.a})`
          : isB
          ? `rgba(251,191,36,${d.a * 0.5})`
          : `rgba(255,237,215,${d.a * 0.35})`;
        ctx.fill();
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  /* ── Handlers ── */
  const handleStart = useCallback(
    () => window.open("https://chat.z.ai", "_blank"),
    []
  );
  const handleCredentials = useCallback(
    () => router.push("/dashboard/credentials"),
    [router]
  );

  return (
    <>
      <div className={`oz-root oz-root--${mode}`}>
        {/* ═══ CURSOR GLOW ═══ */}
        <div
          className="oz-cursor-glow"
          aria-hidden
          style={{ left: glowPos.x, top: glowPos.y }}
        />

        {/* ═══ CANVAS BG ═══ */}
        <canvas ref={canvasRef} className="oz-canvas" aria-hidden />

        {/* ═══ NOISE ═══ */}
        <div className="oz-noise" aria-hidden />

        {/* ═══ SCROLL CONTAINER ═══ */}
        <div className="oz-scroll-container" ref={scrollRef}>
          {/* ═══════════════════════════════════════
              SECTION 1 — HERO
              ═══════════════════════════════════════ */}
          <section
            className="oz-section oz-section--hero"
            ref={hero.ref}
          >
            <div className="oz-section-inner">
              {/* Logo mark */}
              <div
                className={`oz-logo-row ${hero.visible ? "oz-logo-row--vis" : ""}`}
              >
                <div className={`oz-logo-dot oz-logo-dot--${mode}`} />
                <span className={`oz-logo-txt oz-logo-txt--${mode}`}>
                  TrishulHub
                </span>
              </div>

              {/* Tagline upper */}
              <p
                className={`oz-tag-upper oz-tag-upper--${mode} ${hero.visible ? "oz-reveal" : ""}`}
              >
                Your Personal
              </p>

              {/* Main Title — character reveal */}
              <h1 className={`oz-title oz-title--${mode}`}>
                {TRISHUL_CHARS.map((ch, i) => (
                  <span
                    key={i}
                    className={`oz-char ${hero.visible ? "oz-char--in" : ""}`}
                    style={{ transitionDelay: `${0.15 + i * 0.045}s` }}
                  >
                    {ch}
                  </span>
                ))}
              </h1>

              {/* Tagline lower */}
              <p
                className={`oz-tag-lower oz-tag-lower--${mode} ${hero.visible ? "oz-reveal" : ""}`}
              >
                Workspace
              </p>

              {/* Typewriter */}
              <div
                className={`oz-typewriter ${hero.visible ? "oz-typewriter--on" : ""}`}
              >
                <div className={`oz-type-dot oz-type-dot--${mode}`} />
                <span className={`oz-type-text oz-type-text--${mode}`}>
                  {typedText}
                  <span
                    className={`oz-type-cursor ${typingDone ? "oz-type-cursor--blink" : ""}`}
                  />
                </span>
              </div>

              {/* Scroll hint */}
              <div
                className={`oz-scroll-hint ${hero.visible ? "oz-scroll-hint--vis" : ""}`}
              >
                <div className={`oz-scroll-hint-line oz-scroll-hint-line--${mode}`} />
                <span className={`oz-scroll-hint-text oz-scroll-hint-text--${mode}`}>
                  Scroll to explore
                </span>
                <ChevronDown
                  size={14}
                  className={`oz-scroll-hint-icon oz-scroll-hint-icon--${mode}`}
                />
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════
              SECTION 2 — FEATURES
              ═══════════════════════════════════════ */}
          <section
            className="oz-section oz-section--features"
            ref={features.ref}
          >
            <div className="oz-section-inner oz-section-inner--features">
              {/* Section label */}
              <div
                className={`oz-section-label oz-section-label--${mode} ${features.visible ? "oz-reveal" : ""}`}
              >
                <div className="oz-section-label-line" />
                <span>What makes it different</span>
                <div className="oz-section-label-line" />
              </div>

              {/* Feature cards */}
              <div className="oz-features-grid">
                {FEATURES.map((f, i) => (
                  <div
                    key={f.label}
                    className={`oz-feature-card oz-feature-card--${mode} ${features.visible ? "oz-feature-card--in" : ""}`}
                    style={{ transitionDelay: `${0.2 + i * 0.18}s` }}
                  >
                    <div
                      className={`oz-feature-icon-wrap oz-feature-icon-wrap--${mode}`}
                    >
                      <f.icon
                        size={22}
                        strokeWidth={1.5}
                        className={`oz-feature-icon oz-feature-icon--${mode}`}
                      />
                    </div>
                    <span
                      className={`oz-feature-name oz-feature-name--${mode}`}
                    >
                      {f.label}
                    </span>
                    <p className={`oz-feature-desc oz-feature-desc--${mode}`}>
                      {f.label === "Secured"
                        ? "Enterprise-grade security with end-to-end encryption and zero-trust architecture protecting every layer of your data."
                        : f.label === "AI Powered"
                        ? "Intelligent automation and machine learning models that adapt to your workflow and amplify productivity at every step."
                        : "Built on cloud-native infrastructure with auto-scaling, global CDN, and 99.99% uptime guaranteed."}
                    </p>
                    <div
                      className={`oz-feature-dash oz-feature-dash--${mode}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════
              SECTION 3 — LAUNCH / ACTIONS
              ═══════════════════════════════════════ */}
          <section
            className="oz-section oz-section--launch"
            ref={launch.ref}
          >
            <div className="oz-section-inner oz-section-inner--launch">
              {/* Section label */}
              <div
                className={`oz-section-label oz-section-label--${mode} ${launch.visible ? "oz-reveal" : ""}`}
              >
                <div className="oz-section-label-line" />
                <span>Ready to begin</span>
                <div className="oz-section-label-line" />
              </div>

              {/* START Button */}
              <div
                className={`oz-launch-btn-wrap ${launch.visible ? "oz-launch-btn-wrap--in" : ""}`}
              >
                <button
                  onClick={handleStart}
                  className={`oz-launch-btn oz-launch-btn--${mode}`}
                  type="button"
                >
                  <span className="oz-launch-btn-inner">
                    <Zap size={18} strokeWidth={2.5} />
                    <span>START</span>
                    <ArrowUpRight size={16} />
                  </span>
                  <span className="oz-launch-btn-glow" aria-hidden />
                </button>
                <p className={`oz-launch-hint oz-launch-hint--${mode}`}>
                  Opens workspace in a new tab
                </p>
              </div>

              {/* Dashed separator */}
              <div
                className={`oz-launch-sep oz-launch-sep--${mode} ${launch.visible ? "oz-reveal" : ""}`}
              />

              {/* Credentials Card */}
              <button
                onClick={handleCredentials}
                className={`oz-cred-card oz-cred-card--${mode} ${launch.visible ? "oz-cred-card--in" : ""}`}
                type="button"
              >
                <div className="oz-cred-top">
                  <div
                    className={`oz-cred-icon oz-cred-icon--${mode}`}
                  >
                    <KeyRound size={18} />
                  </div>
                  <ArrowUpRight
                    size={14}
                    className={`oz-cred-arrow oz-cred-arrow--${mode}`}
                  />
                </div>
                <div className="oz-cred-body">
                  <span className={`oz-cred-title oz-cred-title--${mode}`}>
                    Claim Credentials
                  </span>
                  <span className={`oz-cred-desc oz-cred-desc--${mode}`}>
                    Get your ID & Password
                  </span>
                </div>
                <div className={`oz-cred-dash oz-cred-dash--${mode}`} />
              </button>

              {/* Status */}
              <div
                className={`oz-status ${launch.visible ? "oz-reveal" : ""}`}
              >
                <div className={`oz-status-dot oz-status-dot--${mode}`} />
                <span className={`oz-status-text oz-status-text--${mode}`}>
                  Protocol v5.0
                </span>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════
              SECTION 4 — WELCOME
              ═══════════════════════════════════════ */}
          <section
            className="oz-section oz-section--welcome"
            ref={welcome.ref}
          >
            <div className="oz-section-inner oz-section-inner--welcome">
              <div
                className={`oz-welcome-card oz-welcome-card--${mode} ${welcome.visible ? "oz-welcome-card--in" : ""}`}
              >
                <div className="oz-welcome-glow" aria-hidden />
                <p className={`oz-welcome-label oz-welcome-label--${mode}`}>
                  Welcome back,
                </p>
                <h2 className={`oz-welcome-name oz-welcome-name--${mode}`}>
                  {userName}
                </h2>
                <div className={`oz-welcome-role-wrap`}>
                  <span className={`oz-welcome-role oz-welcome-role--${mode}`}>
                    {userRole.toUpperCase()}
                  </span>
                </div>
                <div className={`oz-welcome-dash oz-welcome-dash--${mode}`} />
                <p className={`oz-welcome-msg oz-welcome-msg--${mode}`}>
                  Your workspace is ready. Dive in and build something extraordinary today.
                </p>
              </div>

              {/* Footer dot */}
              <div
                className={`oz-footer-badge ${welcome.visible ? "oz-reveal" : ""}`}
              >
                <div className={`oz-footer-badge-dot oz-footer-badge-dot--${mode}`} />
                <span className={`oz-footer-badge-text oz-footer-badge-text--${mode}`}>
                  TRISHULHUB WORKSPACE v4.0
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* ═══ RIGHT EDGE — Scroll Progress + Section Labels ═══ */}
        <div className="oz-rail">
          {/* Progress bar */}
          <div className="oz-rail-track">
            <div
              className={`oz-rail-fill oz-rail-fill--${mode}`}
              style={{ height: `${progress * 100}%` }}
            />
          </div>

          {/* Section labels */}
          <div className="oz-rail-labels">
            {SECTIONS.map((label, i) => (
              <button
                key={label}
                className={`oz-rail-label ${activeSection === i ? "oz-rail-label--active" : ""}`}
                type="button"
                onClick={() => {
                  const container = scrollRef.current;
                  if (container) {
                    container.scrollTo({
                      top: i * container.clientHeight,
                      behavior: "smooth",
                    });
                  }
                }}
              >
                <div
                  className={`oz-rail-dot oz-rail-dot--${mode} ${activeSection >= i ? "oz-rail-dot--passed" : ""}`}
                />
                <span className={`oz-rail-label-text oz-rail-label-text--${mode}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         STYLES — ORYZO v4.0
         ═══════════════════════════════════════════════════════ */}
      <style jsx global>{`
        @media (pointer: coarse) {
          .oz-root, .oz-root * { cursor: auto !important; }
        }

        /* ═════════════════════════
           ROOT
           ═════════════════════════ */
        .oz-root {
          position: relative;
          height: 100%;
          overflow: hidden;
          margin: -1.25rem;
          margin-top: -1.25rem;
          background: #0c0906;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
        }
        @media (min-width: 768px) {
          .oz-root { margin: -2rem; margin-top: -2rem; }
        }
        .oz-root--light { background: #faf8f4; }
        .oz-root--bluelight { background: #080606; }

        /* ═════════════════════════
           CURSOR GLOW
           ═════════════════════════ */
        .oz-cursor-glow {
          position: fixed;
          width: 500px; height: 500px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(220,80,0,0.035) 0%, transparent 70%);
          transition: left 0.5s ease-out, top 0.5s ease-out;
          will-change: left, top;
        }
        .oz-root--light .oz-cursor-glow {
          background: radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%);
        }
        .oz-root--bluelight .oz-cursor-glow {
          background: radial-gradient(circle, rgba(251,191,36,0.04) 0%, transparent 70%);
        }

        /* ═════════════════════════
           CANVAS
           ═════════════════════════ */
        .oz-canvas {
          position: fixed; inset: 0; z-index: 2;
          pointer-events: none; opacity: 0.5;
        }
        .oz-root--light .oz-canvas { opacity: 0.25; }

        /* ═════════════════════════
           NOISE
           ═════════════════════════ */
        .oz-noise {
          position: fixed; inset: 0; z-index: 8000;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 200px;
          opacity: 0.016;
        }

        /* ═════════════════════════
           SCROLL CONTAINER
           ═════════════════════════ */
        .oz-scroll-container {
          position: relative; z-index: 10;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: auto;
          -webkit-overflow-scrolling: touch;
        }
        .oz-scroll-container::-webkit-scrollbar { width: 0; display: none; }

        /* ═════════════════════════
           SECTIONS — Base
           ═════════════════════════ */
        .oz-section {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 2rem;
        }

        .oz-section-inner {
          max-width: 900px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        /* ═════════════════════════
           SECTION LABEL (shared)
           ═════════════════════════ */
        .oz-section-label {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 3rem;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .oz-reveal {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        .oz-section-label span {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .oz-section-label--dark span { color: rgba(255,237,215,0.3); }
        .oz-section-label--light span { color: rgba(30,41,59,0.25); }
        .oz-section-label--bluelight span { color: rgba(251,191,36,0.3); }

        .oz-section-label-line {
          width: 40px; height: 1px;
        }
        .oz-section-label--dark .oz-section-label-line { background: rgba(255,237,215,0.1); }
        .oz-section-label--light .oz-section-label-line { background: rgba(30,41,59,0.08); }
        .oz-section-label--bluelight .oz-section-label-line { background: rgba(251,191,36,0.1); }

        /* ═════════════════════════
           HERO SECTION
           ═════════════════════════ */
        .oz-section--hero {
          padding-top: 4rem;
          padding-bottom: 4rem;
        }

        .oz-logo-row {
          display: flex; align-items: center; gap: 0.6rem;
          margin-bottom: 3rem;
          opacity: 0;
          transform: translateY(-10px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
        }
        .oz-logo-row--vis {
          opacity: 1;
          transform: translateY(0);
        }

        .oz-logo-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          animation: oz-pulse 3s ease-in-out infinite;
        }
        .oz-logo-dot--dark { background: #dc5000; box-shadow: 0 0 12px rgba(220,80,0,0.4); }
        .oz-logo-dot--light { background: #06b6d4; box-shadow: 0 0 12px rgba(6,182,212,0.3); }
        .oz-logo-dot--bluelight { background: #f59e0b; box-shadow: 0 0 12px rgba(245,158,11,0.3); }
        @keyframes oz-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.5); opacity: 1; }
        }

        .oz-logo-txt {
          font-size: 0.75rem; font-weight: 700;
          letter-spacing: 0.8px; text-transform: uppercase;
        }
        .oz-logo-txt--dark { color: rgba(255,237,215,0.4); }
        .oz-logo-txt--light { color: rgba(30,41,59,0.35); }
        .oz-logo-txt--bluelight { color: rgba(251,191,36,0.4); }

        .oz-tag-upper {
          font-size: clamp(0.65rem, 1.6vw, 0.85rem);
          font-weight: 600;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
          opacity: 0;
          transform: translateY(18px);
          transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.25s;
        }
        .oz-tag-upper--dark { color: rgba(255,237,215,0.25); }
        .oz-tag-upper--light { color: rgba(30,41,59,0.22); }
        .oz-tag-upper--bluelight { color: rgba(251,191,36,0.25); }

        /* Title — large character reveal */
        .oz-title {
          font-size: clamp(3rem, 10vw, 8.5rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 0.92;
          text-transform: uppercase;
          display: flex;
          overflow: hidden;
          margin-bottom: 0.3rem;
        }
        .oz-title--dark {
          color: transparent;
          background: linear-gradient(135deg, #ffedd7 0%, #dc5000 50%, #ffedd7 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-title--light {
          color: transparent;
          background: linear-gradient(135deg, #0f172a 0%, #06b6d4 50%, #0f172a 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-title--bluelight {
          color: transparent;
          background: linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #fbbf24 100%);
          -webkit-background-clip: text; background-clip: text;
        }

        .oz-char {
          display: inline-block;
          opacity: 0;
          transform: translateY(110%);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .oz-char--in {
          opacity: 1;
          transform: translateY(0);
        }

        .oz-tag-lower {
          font-size: clamp(0.65rem, 1.6vw, 0.85rem);
          font-weight: 600;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          margin-bottom: 2.5rem;
          opacity: 0;
          transform: translateY(18px);
          transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.9s;
        }
        .oz-tag-lower--dark { color: rgba(255,237,215,0.25); }
        .oz-tag-lower--light { color: rgba(30,41,59,0.22); }
        .oz-tag-lower--bluelight { color: rgba(251,191,36,0.25); }

        /* Typewriter */
        .oz-typewriter {
          display: flex; align-items: center; gap: 0.6rem;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.8s ease 1.1s;
        }
        .oz-typewriter--on {
          opacity: 1;
          transform: translateY(0);
        }

        .oz-type-dot {
          width: 5px; height: 5px;
          border-radius: 50%; flex-shrink: 0;
          animation: oz-blink 2s ease-in-out infinite;
        }
        .oz-type-dot--dark { background: #dc5000; }
        .oz-type-dot--light { background: #06b6d4; }
        .oz-type-dot--bluelight { background: #f59e0b; }
        @keyframes oz-blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.15; }
        }

        .oz-type-text {
          font-size: clamp(0.78rem, 1.6vw, 0.95rem);
          font-weight: 300; font-style: italic;
          letter-spacing: 0.02em;
        }
        .oz-type-text--dark { color: rgba(255,237,215,0.35); }
        .oz-type-text--light { color: rgba(30,41,59,0.3); }
        .oz-type-text--bluelight { color: rgba(251,191,36,0.35); }

        .oz-type-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: currentColor;
        }
        .oz-type-cursor--blink { animation: oz-cblink 1s step-end infinite; }
        @keyframes oz-cblink { 50% { opacity: 0; } }

        /* Scroll hint */
        .oz-scroll-hint {
          position: absolute;
          bottom: 2.5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          opacity: 0;
          transition: opacity 1s ease 1.8s;
        }
        .oz-scroll-hint--vis { opacity: 1; }

        .oz-scroll-hint-line {
          width: 1px; height: 30px;
          margin-bottom: 0.3rem;
        }
        .oz-scroll-hint-line--dark { background: linear-gradient(180deg, rgba(255,237,215,0.2), transparent); }
        .oz-scroll-hint-line--light { background: linear-gradient(180deg, rgba(30,41,59,0.15), transparent); }
        .oz-scroll-hint-line--bluelight { background: linear-gradient(180deg, rgba(251,191,36,0.18), transparent); }

        .oz-scroll-hint-text {
          font-size: 0.55rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .oz-scroll-hint-text--dark { color: rgba(255,237,215,0.18); }
        .oz-scroll-hint-text--light { color: rgba(30,41,59,0.18); }
        .oz-scroll-hint-text--bluelight { color: rgba(251,191,36,0.18); }

        .oz-scroll-hint-icon {
          animation: oz-bounce-down 2s ease-in-out infinite;
        }
        .oz-scroll-hint-icon--dark { color: rgba(255,237,215,0.15); }
        .oz-scroll-hint-icon--light { color: rgba(30,41,59,0.12); }
        .oz-scroll-hint-icon--bluelight { color: rgba(251,191,36,0.15); }
        @keyframes oz-bounce-down {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }

        /* ═════════════════════════
           FEATURES SECTION
           ═════════════════════════ */
        .oz-features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          width: 100%;
          max-width: 750px;
        }

        .oz-feature-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.8rem;
          padding: 2rem 1.2rem 1.5rem;
          border-radius: 16px;
          border: 1px dashed transparent;
          opacity: 0;
          transform: translateY(40px) scale(0.95);
          transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .oz-feature-card--in {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .oz-feature-card--dark {
          border-color: rgba(255,237,215,0.06);
          background: rgba(255,237,215,0.015);
        }
        .oz-feature-card--light {
          border-color: rgba(30,41,59,0.06);
          background: rgba(30,41,59,0.015);
        }
        .oz-feature-card--bluelight {
          border-color: rgba(251,191,36,0.06);
          background: rgba(251,191,36,0.015);
        }

        .oz-feature-card--dark:hover {
          border-color: rgba(220,80,0,0.2);
          background: rgba(220,80,0,0.03);
        }
        .oz-feature-card--light:hover {
          border-color: rgba(6,182,212,0.2);
          background: rgba(6,182,212,0.03);
        }
        .oz-feature-card--bluelight:hover {
          border-color: rgba(251,191,36,0.2);
          background: rgba(251,191,36,0.03);
        }

        .oz-feature-icon-wrap {
          width: 50px; height: 50px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px;
          transition: all 0.4s;
        }
        .oz-feature-icon-wrap--dark {
          background: rgba(255,237,215,0.04);
          border: 1px solid rgba(255,237,215,0.08);
        }
        .oz-feature-icon-wrap--light {
          background: rgba(30,41,59,0.03);
          border: 1px solid rgba(30,41,59,0.06);
        }
        .oz-feature-icon-wrap--bluelight {
          background: rgba(251,191,36,0.04);
          border: 1px solid rgba(251,191,36,0.08);
        }
        .oz-feature-card:hover .oz-feature-icon-wrap--dark {
          background: rgba(220,80,0,0.08);
          border-color: rgba(220,80,0,0.15);
        }
        .oz-feature-card:hover .oz-feature-icon-wrap--light {
          background: rgba(6,182,212,0.06);
          border-color: rgba(6,182,212,0.12);
        }
        .oz-feature-card:hover .oz-feature-icon-wrap--bluelight {
          background: rgba(251,191,36,0.08);
          border-color: rgba(251,191,36,0.15);
        }

        .oz-feature-icon--dark { color: #dc5000; }
        .oz-feature-icon--light { color: #06b6d4; }
        .oz-feature-icon--bluelight { color: #f59e0b; }

        .oz-feature-name {
          font-size: 0.8rem; font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .oz-feature-name--dark { color: rgba(255,237,215,0.7); }
        .oz-feature-name--light { color: rgba(30,41,59,0.7); }
        .oz-feature-name--bluelight { color: rgba(251,191,36,0.7); }

        .oz-feature-desc {
          font-size: 0.7rem;
          line-height: 1.6;
          text-align: center;
          max-width: 200px;
        }
        .oz-feature-desc--dark { color: rgba(255,237,215,0.22); }
        .oz-feature-desc--light { color: rgba(30,41,59,0.28); }
        .oz-feature-desc--bluelight { color: rgba(251,191,36,0.22); }

        .oz-feature-dash {
          width: 100%; height: 1px;
          margin-top: 0.5rem;
        }
        .oz-feature-dash--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.06) 0 4px, transparent 4px 8px); }
        .oz-feature-dash--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.04) 0 4px, transparent 4px 8px); }
        .oz-feature-dash--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.05) 0 4px, transparent 4px 8px); }

        /* ═════════════════════════
           LAUNCH SECTION
           ═════════════════════════ */
        .oz-section-inner--launch {
          gap: 1.2rem;
          align-items: center;
        }

        .oz-launch-btn-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          opacity: 0;
          transform: translateY(30px) scale(0.9);
          transition: all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.15s;
        }
        .oz-launch-btn-wrap--in {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .oz-launch-btn {
          position: relative;
          border: none; background: none;
          padding: 0; font-family: inherit;
          cursor: pointer;
        }
        .oz-launch-btn-inner {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 1.1rem 2.5rem;
          border-radius: 3em;
          font-size: 0.9rem; font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative; z-index: 1;
        }
        .oz-launch-btn--dark .oz-launch-btn-inner {
          background: #ffedd7; color: #100904;
        }
        .oz-launch-btn--light .oz-launch-btn-inner {
          background: #0f172a; color: #f8fafc;
        }
        .oz-launch-btn--bluelight .oz-launch-btn-inner {
          background: #fbbf24; color: #100904;
        }
        .oz-launch-btn:hover .oz-launch-btn-inner {
          transform: scale(1.04);
        }
        .oz-launch-btn:active .oz-launch-btn-inner {
          transform: scale(0.97);
        }

        .oz-launch-btn-glow {
          position: absolute;
          inset: -4px;
          border-radius: 3em;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .oz-launch-btn--dark .oz-launch-btn-glow {
          box-shadow: 0 0 30px rgba(220,80,0,0.3), 0 0 70px rgba(220,80,0,0.1);
        }
        .oz-launch-btn--light .oz-launch-btn-glow {
          box-shadow: 0 0 30px rgba(6,182,212,0.3), 0 0 70px rgba(6,182,212,0.1);
        }
        .oz-launch-btn--bluelight .oz-launch-btn-glow {
          box-shadow: 0 0 30px rgba(245,158,11,0.3), 0 0 70px rgba(245,158,11,0.1);
        }
        .oz-launch-btn:hover .oz-launch-btn-glow { opacity: 1; }

        .oz-launch-hint {
          font-size: 0.6rem;
          letter-spacing: 0.05em;
        }
        .oz-launch-hint--dark { color: rgba(255,237,215,0.18); }
        .oz-launch-hint--light { color: rgba(30,41,59,0.2); }
        .oz-launch-hint--bluelight { color: rgba(251,191,36,0.18); }

        .oz-launch-sep {
          width: 120px; height: 1px;
          margin: 0.5rem 0;
          opacity: 0;
          transform: scaleX(0);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s;
        }
        .oz-launch-sep.oz-reveal {
          opacity: 1;
          transform: scaleX(1);
        }
        .oz-launch-sep--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.1) 0 5px, transparent 5px 10px); }
        .oz-launch-sep--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.08) 0 5px, transparent 5px 10px); }
        .oz-launch-sep--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.08) 0 5px, transparent 5px 10px); }

        /* Credentials card */
        .oz-cred-card {
          width: 260px;
          border: none; background: none;
          font-family: inherit; cursor: pointer;
          text-align: center;
          padding: 1.2rem 0;
          opacity: 0;
          transform: translateY(25px);
          transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.55s;
        }
        .oz-cred-card--in {
          opacity: 1;
          transform: translateY(0);
        }
        .oz-cred-card:hover {
          transform: translateY(-2px) !important;
        }

        .oz-cred-top {
          display: flex; align-items: center; justify-content: center;
          gap: 0.5rem;
          margin-bottom: 0.6rem;
        }
        .oz-cred-icon {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          border: 1px dashed;
          transition: all 0.3s;
        }
        .oz-cred-icon--dark {
          border-color: rgba(255,237,215,0.12);
          color: rgba(255,237,215,0.5);
          background: rgba(255,237,215,0.02);
        }
        .oz-cred-icon--light {
          border-color: rgba(30,41,59,0.1);
          color: rgba(30,41,59,0.5);
          background: rgba(30,41,59,0.02);
        }
        .oz-cred-icon--bluelight {
          border-color: rgba(251,191,36,0.12);
          color: rgba(251,191,36,0.5);
          background: rgba(251,191,36,0.02);
        }
        .oz-cred-card:hover .oz-cred-icon--dark {
          border-color: rgba(220,80,0,0.3);
          background: rgba(220,80,0,0.05);
        }
        .oz-cred-card:hover .oz-cred-icon--light {
          border-color: rgba(6,182,212,0.3);
          background: rgba(6,182,212,0.05);
        }
        .oz-cred-card:hover .oz-cred-icon--bluelight {
          border-color: rgba(251,191,36,0.3);
          background: rgba(251,191,36,0.05);
        }

        .oz-cred-arrow {
          opacity: 0.2;
          transition: all 0.3s;
        }
        .oz-cred-arrow--dark { color: #ffedd7; }
        .oz-cred-arrow--light { color: #0f172a; }
        .oz-cred-arrow--bluelight { color: #fbbf24; }
        .oz-cred-card:hover .oz-cred-arrow {
          opacity: 0.6; transform: translate(2px, -2px);
        }

        .oz-cred-body {
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        .oz-cred-title {
          font-size: 0.82rem; font-weight: 600;
          letter-spacing: 0.02em;
        }
        .oz-cred-title--dark { color: rgba(255,237,215,0.65); }
        .oz-cred-title--light { color: rgba(30,41,59,0.65); }
        .oz-cred-title--bluelight { color: rgba(251,191,36,0.65); }
        .oz-cred-desc {
          font-size: 0.65rem;
        }
        .oz-cred-desc--dark { color: rgba(255,237,215,0.22); }
        .oz-cred-desc--light { color: rgba(30,41,59,0.28); }
        .oz-cred-desc--bluelight { color: rgba(251,191,36,0.22); }

        .oz-cred-dash {
          width: 100%; height: 1px;
          margin-top: 0.8rem;
        }
        .oz-cred-dash--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.05) 0 3px, transparent 3px 6px); }
        .oz-cred-dash--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.04) 0 3px, transparent 3px 6px); }
        .oz-cred-dash--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.04) 0 3px, transparent 3px 6px); }

        /* Status */
        .oz-status {
          display: flex; align-items: center; gap: 0.5rem;
          opacity: 0; transform: translateY(12px);
          transition: all 0.8s ease 0.7s;
        }
        .oz-status.oz-reveal { opacity: 1; transform: translateY(0); }
        .oz-status-dot {
          width: 4px; height: 4px; border-radius: 50%;
        }
        .oz-status-dot--dark { background: rgba(255,237,215,0.15); }
        .oz-status-dot--light { background: rgba(30,41,59,0.12); }
        .oz-status-dot--bluelight { background: rgba(251,191,36,0.15); }
        .oz-status-text {
          font-size: 0.55rem; font-weight: 600;
          letter-spacing: 0.15em; text-transform: uppercase;
        }
        .oz-status-text--dark { color: rgba(255,237,215,0.12); }
        .oz-status-text--light { color: rgba(30,41,59,0.15); }
        .oz-status-text--bluelight { color: rgba(251,191,36,0.12); }

        /* ═════════════════════════
           WELCOME SECTION
           ═════════════════════════ */
        .oz-welcome-card {
          position: relative;
          display: flex; flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          padding: 3rem 3rem 2.5rem;
          border-radius: 20px;
          border: 1px dashed;
          max-width: 420px;
          overflow: hidden;
          opacity: 0;
          transform: translateY(40px) scale(0.95);
          transition: all 1.1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .oz-welcome-card--in {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .oz-welcome-card--dark {
          border-color: rgba(255,237,215,0.06);
          background: rgba(255,237,215,0.01);
        }
        .oz-welcome-card--light {
          border-color: rgba(30,41,59,0.06);
          background: rgba(30,41,59,0.01);
        }
        .oz-welcome-card--bluelight {
          border-color: rgba(251,191,36,0.06);
          background: rgba(251,191,36,0.01);
        }

        .oz-welcome-glow {
          position: absolute;
          top: -60%; left: 50%;
          transform: translateX(-50%);
          width: 300px; height: 300px;
          border-radius: 50%;
          pointer-events: none;
        }
        .oz-welcome-card--dark .oz-welcome-glow {
          background: radial-gradient(circle, rgba(220,80,0,0.04) 0%, transparent 70%);
        }
        .oz-welcome-card--light .oz-welcome-glow {
          background: radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%);
        }
        .oz-welcome-card--bluelight .oz-welcome-glow {
          background: radial-gradient(circle, rgba(251,191,36,0.04) 0%, transparent 70%);
        }

        .oz-welcome-label {
          font-size: 0.7rem; font-weight: 400;
          letter-spacing: 0.04em;
        }
        .oz-welcome-label--dark { color: rgba(255,237,215,0.25); }
        .oz-welcome-label--light { color: rgba(30,41,59,0.3); }
        .oz-welcome-label--bluelight { color: rgba(251,191,36,0.25); }

        .oz-welcome-name {
          font-size: clamp(1.8rem, 4vw, 2.8rem);
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .oz-welcome-name--dark {
          color: transparent;
          background: linear-gradient(135deg, #ffedd7 30%, #dc5000 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-welcome-name--light {
          color: transparent;
          background: linear-gradient(135deg, #0f172a 30%, #06b6d4 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-welcome-name--bluelight {
          color: transparent;
          background: linear-gradient(135deg, #fbbf24 30%, #d97706 100%);
          -webkit-background-clip: text; background-clip: text;
        }

        .oz-welcome-role-wrap {
          margin: 0.3rem 0 0.8rem;
        }
        .oz-welcome-role {
          display: inline-block;
          font-size: 0.55rem; font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 0.3rem 0.8rem;
          border-radius: 3em;
          border: 1px dashed;
        }
        .oz-welcome-role--dark {
          color: rgba(255,237,215,0.4);
          border-color: rgba(255,237,215,0.1);
        }
        .oz-welcome-role--light {
          color: rgba(30,41,59,0.4);
          border-color: rgba(30,41,59,0.1);
        }
        .oz-welcome-role--bluelight {
          color: rgba(251,191,36,0.4);
          border-color: rgba(251,191,36,0.1);
        }

        .oz-welcome-dash {
          width: 60px; height: 1px;
          margin: 0.2rem 0 0.8rem;
        }
        .oz-welcome-dash--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.1) 0 3px, transparent 3px 6px); }
        .oz-welcome-dash--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.08) 0 3px, transparent 3px 6px); }
        .oz-welcome-dash--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.08) 0 3px, transparent 3px 6px); }

        .oz-welcome-msg {
          font-size: 0.72rem;
          line-height: 1.7;
          text-align: center;
          max-width: 280px;
        }
        .oz-welcome-msg--dark { color: rgba(255,237,215,0.2); }
        .oz-welcome-msg--light { color: rgba(30,41,59,0.28); }
        .oz-welcome-msg--bluelight { color: rgba(251,191,36,0.2); }

        /* Footer badge */
        .oz-footer-badge {
          display: flex; align-items: center; gap: 0.5rem;
          margin-top: 2rem;
          opacity: 0; transform: translateY(15px);
          transition: all 0.8s ease 0.4s;
        }
        .oz-footer-badge.oz-reveal { opacity: 1; transform: translateY(0); }

        .oz-footer-badge-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          animation: oz-pulse 2.5s ease-in-out infinite;
        }
        .oz-footer-badge-dot--dark { background: #dc5000; opacity: 0.4; }
        .oz-footer-badge-dot--light { background: #06b6d4; opacity: 0.4; }
        .oz-footer-badge-dot--bluelight { background: #f59e0b; opacity: 0.4; }

        .oz-footer-badge-text {
          font-size: 0.5rem; font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .oz-footer-badge-text--dark { color: rgba(255,237,215,0.1); }
        .oz-footer-badge-text--light { color: rgba(30,41,59,0.12); }
        .oz-footer-badge-text--bluelight { color: rgba(251,191,36,0.1); }

        /* ═════════════════════════
           RIGHT RAIL — Scroll Progress
           ═════════════════════════ */
        .oz-rail {
          position: fixed;
          right: 1.5rem;
          top: 50%;
          transform: translateY(-50%);
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .oz-rail-track {
          width: 2px; height: 80px;
          border-radius: 1px;
          overflow: hidden;
          position: relative;
        }
        .oz-rail-fill {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          border-radius: 1px;
          transition: height 0.15s ease-out;
        }
        .oz-rail-fill--dark { background: rgba(255,237,215,0.15); }
        .oz-rail-fill--light { background: rgba(30,41,59,0.12); }
        .oz-rail-fill--bluelight { background: rgba(251,191,36,0.15); }

        .oz-rail-labels {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .oz-rail-label {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          font-family: inherit;
          opacity: 0.3;
          transition: opacity 0.3s;
        }
        .oz-rail-label:hover { opacity: 0.6; }
        .oz-rail-label--active { opacity: 1; }

        .oz-rail-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          transition: all 0.3s;
        }
        .oz-rail-dot--dark { background: rgba(255,237,215,0.15); }
        .oz-rail-dot--light { background: rgba(30,41,59,0.12); }
        .oz-rail-dot--bluelight { background: rgba(251,191,36,0.15); }

        .oz-rail-dot--passed.oz-rail-dot--dark { background: #dc5000; }
        .oz-rail-dot--passed.oz-rail-dot--light { background: #06b6d4; }
        .oz-rail-dot--passed.oz-rail-dot--bluelight { background: #f59e0b; }

        .oz-rail-label-text {
          font-size: 0.45rem; font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .oz-rail-label-text--dark { color: rgba(255,237,215,0.25); }
        .oz-rail-label-text--light { color: rgba(30,41,59,0.25); }
        .oz-rail-label-text--bluelight { color: rgba(251,191,36,0.25); }

        /* ═════════════════════════
           RESPONSIVE
           ═════════════════════════ */
        @media (max-width: 900px) {
          .oz-rail { display: none; }
          .oz-features-grid {
            grid-template-columns: 1fr;
            max-width: 320px;
          }
          .oz-feature-card {
            flex-direction: row;
            text-align: left;
            padding: 1.2rem 1.5rem;
            gap: 1rem;
            align-items: center;
          }
          .oz-feature-icon-wrap {
            width: 42px; height: 42px;
            min-width: 42px;
            border-radius: 12px;
          }
          .oz-feature-name { margin-top: 0.15rem; }
          .oz-feature-desc { display: none; }
          .oz-feature-dash { display: none; }
        }

        @media (max-width: 640px) {
          .oz-section { padding: 1.5rem; }
          .oz-section-label { margin-bottom: 2rem; }
          .oz-welcome-card { padding: 2.5rem 2rem 2rem; }
          .oz-cred-card { width: 100%; max-width: 280px; }
          .oz-launch-btn-inner { padding: 1rem 2rem; font-size: 0.82rem; }
        }

        @media (max-width: 400px) {
          .oz-title { font-size: clamp(2.5rem, 13vw, 3.5rem); }
          .oz-launch-btn-inner { padding: 0.9rem 1.5rem; font-size: 0.78rem; }
        }
      `}</style>
    </>
  );
}
