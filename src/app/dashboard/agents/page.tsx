"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
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
   ORYZO — TrishulHub Workspace v5.0
   TRUE scroll-linked animation — elements animate IN when scrolling
   down and animate OUT when scrolling back up, exactly like oryzo.ai.
   Uses requestAnimationFrame + data-anim attributes for 60fps.
   ═══════════════════════════════════════════════════════════════ */

const TRISHUL = "TrishulHub";
const TRISHUL_CHARS = TRISHUL.split("");
const FEATURES = [
  { icon: Shield, label: "Secured" },
  { icon: Zap, label: "AI Powered" },
  { icon: Globe, label: "Cloud Native" },
] as const;

const SECTIONS = ["Hero", "Features", "Launch", "Welcome"];

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

  /* ── Section refs ── */
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* ── Rail refs (direct DOM for zero re-renders during scroll) ── */
  const railFillRef = useRef<HTMLDivElement>(null);
  const railDotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railLabelRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* ── Typewriter (time-based, independent of scroll) ── */
  const tagline = "I am ready to cook.";
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    const delay = setTimeout(() => {
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
    }, 600);
    return () => clearTimeout(delay);
  }, []);

  /* ── Mouse-follow glow (desktop only) ── */
  const [glowPos, setGlowPos] = useState({ x: -500, y: -500 });
  const glowRef = useRef({ x: -500, y: -500 });

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
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

    const dots = Array.from({ length: 35 }, () => ({
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

  const scrollToSection = useCallback((index: number) => {
    const el = sectionRefs.current[index];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setSectionRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      sectionRefs.current[index] = el;
    },
    []
  );

  /* ═══════════════════════════════════════════════════════
     SCROLL-LINKED ANIMATION SYSTEM
     Every frame: compute section progress → apply to children.
     Hero: starts at progress 1 (entrance), fades as you scroll past.
     Other sections: starts at 0, reveals as you scroll into view.
     SCROLLING BACK reverses everything — exactly like oryzo.ai.
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    const mountTime = Date.now();
    let raf: number;

    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

    const animate = () => {
      const vh = window.innerHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - vh;
      const elapsed = (Date.now() - mountTime) / 1000;

      /* ── Overall scroll progress for rail ── */
      const sp = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;
      if (railFillRef.current) {
        railFillRef.current.style.height = `${sp * 100}%`;
      }

      let bestSection = 0;

      sectionRefs.current.forEach((section, i) => {
        if (!section) return;
        const rect = section.getBoundingClientRect();

        let sectionProgress: number;

        if (i === 0) {
          /* HERO: entrance ramp (0→1 over 1s) then scroll-based fade (1→0)
             Scrolling back UP: scrollFade goes back to 1, so hero reappears */
          const entrance = Math.min(1, elapsed / 1.0);
          const scrollFade = Math.min(1, Math.max(0, 1 + rect.top / (vh * 0.45)));
          sectionProgress = Math.min(entrance, scrollFade);
        } else {
          /* OTHER SECTIONS: 0 when below viewport, 1 when in view
             Scrolling back UP: rect.top goes positive again, progress drops to 0 */
          sectionProgress = Math.min(1, Math.max(0, 1 - rect.top / (vh * 0.6)));
        }

        if (sectionProgress > 0.5 && rect.top < vh * 0.5) {
          bestSection = i;
        }

        /* ── Apply progress to every [data-anim] child ── */
        const children = section.querySelectorAll("[data-anim]");
        children.forEach((child) => {
          const el = child as HTMLElement;
          const delay = parseFloat(el.dataset.anim || "0");
          const range = parseFloat(el.dataset.range || "0.25");
          const dist = parseFloat(el.dataset.dist || "40");
          const hasScale = el.dataset.scale !== undefined;
          const scaleTarget = hasScale ? parseFloat(el.dataset.scale || "0.95") : 1;

          let ep = (sectionProgress - delay) / Math.max(0.01, range);
          ep = Math.min(1, Math.max(0, ep));
          const eased = easeOutCubic(ep);

          if (eased >= 0.995) {
            /* Fully visible — remove inline transform so CSS hover works */
            el.style.opacity = "1";
            el.style.transform = "";
          } else {
            el.style.opacity = String(eased);
            const y = (1 - eased) * dist;
            const s = hasScale ? scaleTarget + (1 - scaleTarget) * eased : 1;
            el.style.transform = `translateY(${y}px)${hasScale ? ` scale(${s})` : ""}`;
          }
        });
      });

      /* ── Update rail dots/labels (direct DOM) ── */
      railDotRefs.current.forEach((dot, i) => {
        if (!dot) return;
        dot.classList.toggle("oz-rail-dot--passed", i <= bestSection);
      });
      railLabelRefs.current.forEach((label, i) => {
        if (!label) return;
        label.classList.toggle("oz-rail-label--active", i === bestSection);
      });

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

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

        {/* ═══════════════════════════════════════
            SECTION 1 — HERO
            ═══════════════════════════════════════ */}
        <section className="oz-section oz-section--hero" ref={setSectionRef(0)}>
          <div className="oz-section-inner">
            <div className="oz-logo-row" data-anim="0.0" data-range="0.18" data-dist="12">
              <div className={`oz-logo-dot oz-logo-dot--${mode}`} />
              <span className={`oz-logo-txt oz-logo-txt--${mode}`}>TrishulHub</span>
            </div>

            <p className={`oz-tag-upper oz-tag-upper--${mode}`} data-anim="0.08" data-range="0.18" data-dist="18">
              Your Personal
            </p>

            <h1 className={`oz-title oz-title--${mode}`}>
              {TRISHUL_CHARS.map((ch, i) => (
                <span
                  key={i}
                  className="oz-char"
                  data-anim={String(0.08 + i * 0.04)}
                  data-range="0.20"
                  data-dist="100"
                >
                  {ch}
                </span>
              ))}
            </h1>

            <p className={`oz-tag-lower oz-tag-lower--${mode}`} data-anim="0.30" data-range="0.18" data-dist="18">
              Workspace
            </p>

            <div className="oz-typewriter" data-anim="0.40" data-range="0.18" data-dist="12">
              <div className={`oz-type-dot oz-type-dot--${mode}`} />
              <span className={`oz-type-text oz-type-text--${mode}`}>
                {typedText}
                <span className={`oz-type-cursor ${typingDone ? "oz-type-cursor--blink" : ""}`} />
              </span>
            </div>

            <div className="oz-scroll-hint" data-anim="0.55" data-range="0.18" data-dist="15">
              <div className={`oz-scroll-hint-line oz-scroll-hint-line--${mode}`} />
              <span className={`oz-scroll-hint-text oz-scroll-hint-text--${mode}`}>Scroll to explore</span>
              <ChevronDown size={14} className={`oz-scroll-hint-icon oz-scroll-hint-icon--${mode}`} />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
            SECTION 2 — FEATURES
            ═══════════════════════════════════════ */}
        <section className="oz-section oz-section--features" ref={setSectionRef(1)}>
          <div className="oz-section-inner oz-section-inner--features">
            <div className={`oz-section-label oz-section-label--${mode}`} data-anim="0.0" data-range="0.22" data-dist="20">
              <div className="oz-section-label-line" />
              <span>What makes it different</span>
              <div className="oz-section-label-line" />
            </div>

            <div className="oz-features-grid">
              {FEATURES.map((f, i) => (
                <div
                  key={f.label}
                  className={`oz-feature-card oz-feature-card--${mode}`}
                  data-anim={String(0.06 + i * 0.1)}
                  data-range="0.22"
                  data-dist="45"
                  data-scale="0.95"
                >
                  <div className={`oz-feature-icon-wrap oz-feature-icon-wrap--${mode}`}>
                    <f.icon size={22} strokeWidth={1.5} className={`oz-feature-icon oz-feature-icon--${mode}`} />
                  </div>
                  <span className={`oz-feature-name oz-feature-name--${mode}`}>{f.label}</span>
                  <p className={`oz-feature-desc oz-feature-desc--${mode}`}>
                    {f.label === "Secured"
                      ? "Enterprise-grade security with end-to-end encryption and zero-trust architecture protecting every layer of your data."
                      : f.label === "AI Powered"
                      ? "Intelligent automation and machine learning models that adapt to your workflow and amplify productivity at every step."
                      : "Built on cloud-native infrastructure with auto-scaling, global CDN, and 99.99% uptime guaranteed."}
                  </p>
                  <div className={`oz-feature-dash oz-feature-dash--${mode}`} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
            SECTION 3 — LAUNCH
            ═══════════════════════════════════════ */}
        <section className="oz-section oz-section--launch" ref={setSectionRef(2)}>
          <div className="oz-section-inner oz-section-inner--launch">
            <div className={`oz-section-label oz-section-label--${mode}`} data-anim="0.0" data-range="0.22" data-dist="20">
              <div className="oz-section-label-line" />
              <span>Ready to begin</span>
              <div className="oz-section-label-line" />
            </div>

            <div className="oz-launch-btn-wrap" data-anim="0.08" data-range="0.22" data-dist="35" data-scale="0.92">
              <button onClick={handleStart} className={`oz-launch-btn oz-launch-btn--${mode}`} type="button">
                <span className="oz-launch-btn-inner">
                  <Zap size={18} strokeWidth={2.5} />
                  <span>START</span>
                  <ArrowUpRight size={16} />
                </span>
                <span className="oz-launch-btn-glow" aria-hidden />
              </button>
              <p className={`oz-launch-hint oz-launch-hint--${mode}`}>Opens workspace in a new tab</p>
            </div>

            <div className={`oz-launch-sep oz-launch-sep--${mode}`} data-anim="0.18" data-range="0.18" data-dist="10" />

            <button onClick={handleCredentials} className={`oz-cred-card oz-cred-card--${mode}`} data-anim="0.25" data-range="0.22" data-dist="30" type="button">
              <div className="oz-cred-top">
                <div className={`oz-cred-icon oz-cred-icon--${mode}`}><KeyRound size={18} /></div>
                <ArrowUpRight size={14} className={`oz-cred-arrow oz-cred-arrow--${mode}`} />
              </div>
              <div className="oz-cred-body">
                <span className={`oz-cred-title oz-cred-title--${mode}`}>Claim Credentials</span>
                <span className={`oz-cred-desc oz-cred-desc--${mode}`}>Get your ID & Password</span>
              </div>
              <div className={`oz-cred-dash oz-cred-dash--${mode}`} />
            </button>

            <div className="oz-status" data-anim="0.34" data-range="0.18" data-dist="12">
              <div className={`oz-status-dot oz-status-dot--${mode}`} />
              <span className={`oz-status-text oz-status-text--${mode}`}>Protocol v5.0</span>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
            SECTION 4 — WELCOME
            ═══════════════════════════════════════ */}
        <section className="oz-section oz-section--welcome" ref={setSectionRef(3)}>
          <div className="oz-section-inner oz-section-inner--welcome">
            <div className={`oz-welcome-card oz-welcome-card--${mode}`} data-anim="0.0" data-range="0.28" data-dist="50" data-scale="0.94">
              <div className="oz-welcome-glow" aria-hidden />
              <p className={`oz-welcome-label oz-welcome-label--${mode}`}>Welcome back,</p>
              <h2 className={`oz-welcome-name oz-welcome-name--${mode}`}>{userName}</h2>
              <div className="oz-welcome-role-wrap">
                <span className={`oz-welcome-role oz-welcome-role--${mode}`}>{userRole.toUpperCase()}</span>
              </div>
              <div className={`oz-welcome-dash oz-welcome-dash--${mode}`} />
              <p className={`oz-welcome-msg oz-welcome-msg--${mode}`}>Your workspace is ready. Dive in and build something extraordinary today.</p>
            </div>

            <div className="oz-footer-badge" data-anim="0.22" data-range="0.22" data-dist="15">
              <div className={`oz-footer-badge-dot oz-footer-badge-dot--${mode}`} />
              <span className={`oz-footer-badge-text oz-footer-badge-text--${mode}`}>TRISHULHUB WORKSPACE v5.0</span>
            </div>
          </div>
        </section>

        {/* ═══ RIGHT EDGE — Scroll Progress Rail ═══ */}
        <div className="oz-rail">
          <div className="oz-rail-track">
            <div className={`oz-rail-fill oz-rail-fill--${mode}`} ref={railFillRef} />
          </div>
          <div className="oz-rail-labels">
            {SECTIONS.map((label, i) => (
              <button
                key={label}
                className="oz-rail-label"
                type="button"
                ref={(el) => { railLabelRefs.current[i] = el; }}
                onClick={() => scrollToSection(i)}
              >
                <div className={`oz-rail-dot oz-rail-dot--${mode}`} ref={(el) => { railDotRefs.current[i] = el; }} />
                <span className={`oz-rail-label-text oz-rail-label-text--${mode}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         STYLES — ORYZO v5.0
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
           [data-anim] — hidden by default,
           rAF overrides every frame.
           ═════════════════════════ */
        [data-anim] {
          opacity: 0;
          will-change: transform, opacity;
        }

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
           SECTIONS
           ═════════════════════════ */
        .oz-section {
          min-height: 100vh;
          min-height: 100dvh;
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
           SECTION LABEL
           ═════════════════════════ */
        .oz-section-label {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 3rem;
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
        .oz-section-label-line { width: 40px; height: 1px; }
        .oz-section-label--dark .oz-section-label-line { background: rgba(255,237,215,0.1); }
        .oz-section-label--light .oz-section-label-line { background: rgba(30,41,59,0.08); }
        .oz-section-label--bluelight .oz-section-label-line { background: rgba(251,191,36,0.1); }

        /* ═════════════════════════
           HERO
           ═════════════════════════ */
        .oz-section--hero { padding-top: 4rem; padding-bottom: 4rem; }

        .oz-logo-row {
          display: flex; align-items: center; gap: 0.6rem;
          margin-bottom: 3rem;
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
          font-weight: 600; letter-spacing: 0.35em;
          text-transform: uppercase; margin-bottom: 0.5rem;
        }
        .oz-tag-upper--dark { color: rgba(255,237,215,0.25); }
        .oz-tag-upper--light { color: rgba(30,41,59,0.22); }
        .oz-tag-upper--bluelight { color: rgba(251,191,36,0.25); }

        .oz-title {
          font-size: clamp(3rem, 10vw, 8.5rem);
          font-weight: 800; letter-spacing: -0.02em;
          line-height: 0.92; text-transform: uppercase;
          display: flex; overflow: hidden; margin-bottom: 0.3rem;
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
        .oz-char { display: inline-block; }

        .oz-tag-lower {
          font-size: clamp(0.65rem, 1.6vw, 0.85rem);
          font-weight: 600; letter-spacing: 0.35em;
          text-transform: uppercase; margin-bottom: 2.5rem;
        }
        .oz-tag-lower--dark { color: rgba(255,237,215,0.25); }
        .oz-tag-lower--light { color: rgba(30,41,59,0.22); }
        .oz-tag-lower--bluelight { color: rgba(251,191,36,0.25); }

        .oz-typewriter { display: flex; align-items: center; gap: 0.6rem; }
        .oz-type-dot {
          width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
          animation: oz-blink 2s ease-in-out infinite;
        }
        .oz-type-dot--dark { background: #dc5000; }
        .oz-type-dot--light { background: #06b6d4; }
        .oz-type-dot--bluelight { background: #f59e0b; }
        @keyframes oz-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        .oz-type-text {
          font-size: clamp(0.78rem, 1.6vw, 0.95rem);
          font-weight: 300; font-style: italic; letter-spacing: 0.02em;
        }
        .oz-type-text--dark { color: rgba(255,237,215,0.35); }
        .oz-type-text--light { color: rgba(30,41,59,0.3); }
        .oz-type-text--bluelight { color: rgba(251,191,36,0.35); }
        .oz-type-cursor {
          display: inline-block; width: 2px; height: 1em;
          margin-left: 2px; vertical-align: text-bottom; background: currentColor;
        }
        .oz-type-cursor--blink { animation: oz-cblink 1s step-end infinite; }
        @keyframes oz-cblink { 50% { opacity: 0; } }

        .oz-scroll-hint {
          position: absolute; bottom: 2.5rem; left: 50%;
          transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
        }
        .oz-scroll-hint-line { width: 1px; height: 30px; margin-bottom: 0.3rem; }
        .oz-scroll-hint-line--dark { background: linear-gradient(180deg, rgba(255,237,215,0.2), transparent); }
        .oz-scroll-hint-line--light { background: linear-gradient(180deg, rgba(30,41,59,0.15), transparent); }
        .oz-scroll-hint-line--bluelight { background: linear-gradient(180deg, rgba(251,191,36,0.18), transparent); }
        .oz-scroll-hint-text {
          font-size: 0.55rem; font-weight: 500;
          letter-spacing: 0.18em; text-transform: uppercase;
        }
        .oz-scroll-hint-text--dark { color: rgba(255,237,215,0.18); }
        .oz-scroll-hint-text--light { color: rgba(30,41,59,0.18); }
        .oz-scroll-hint-text--bluelight { color: rgba(251,191,36,0.18); }
        .oz-scroll-hint-icon { animation: oz-bounce-down 2s ease-in-out infinite; }
        .oz-scroll-hint-icon--dark { color: rgba(255,237,215,0.15); }
        .oz-scroll-hint-icon--light { color: rgba(30,41,59,0.12); }
        .oz-scroll-hint-icon--bluelight { color: rgba(251,191,36,0.15); }
        @keyframes oz-bounce-down {
          0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); }
        }

        /* ═════════════════════════
           FEATURES
           ═════════════════════════ */
        .oz-features-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem; width: 100%; max-width: 750px;
        }
        .oz-feature-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 0.8rem; padding: 2rem 1.2rem 1.5rem;
          border-radius: 16px; border: 1px dashed transparent;
          transition: border-color 0.3s, background 0.3s;
        }
        .oz-feature-card--dark { border-color: rgba(255,237,215,0.06); background: rgba(255,237,215,0.015); }
        .oz-feature-card--light { border-color: rgba(30,41,59,0.06); background: rgba(30,41,59,0.015); }
        .oz-feature-card--bluelight { border-color: rgba(251,191,36,0.06); background: rgba(251,191,36,0.015); }
        .oz-feature-card--dark:hover { border-color: rgba(220,80,0,0.2); background: rgba(220,80,0,0.03); }
        .oz-feature-card--light:hover { border-color: rgba(6,182,212,0.2); background: rgba(6,182,212,0.03); }
        .oz-feature-card--bluelight:hover { border-color: rgba(251,191,36,0.2); background: rgba(251,191,36,0.03); }
        .oz-feature-icon-wrap {
          width: 50px; height: 50px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px; transition: all 0.4s;
        }
        .oz-feature-icon-wrap--dark { background: rgba(255,237,215,0.04); border: 1px solid rgba(255,237,215,0.08); }
        .oz-feature-icon-wrap--light { background: rgba(30,41,59,0.03); border: 1px solid rgba(30,41,59,0.06); }
        .oz-feature-icon-wrap--bluelight { background: rgba(251,191,36,0.04); border: 1px solid rgba(251,191,36,0.08); }
        .oz-feature-card:hover .oz-feature-icon-wrap--dark { background: rgba(220,80,0,0.08); border-color: rgba(220,80,0,0.15); }
        .oz-feature-card:hover .oz-feature-icon-wrap--light { background: rgba(6,182,212,0.06); border-color: rgba(6,182,212,0.12); }
        .oz-feature-card:hover .oz-feature-icon-wrap--bluelight { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.15); }
        .oz-feature-icon--dark { color: #dc5000; }
        .oz-feature-icon--light { color: #06b6d4; }
        .oz-feature-icon--bluelight { color: #f59e0b; }
        .oz-feature-name { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .oz-feature-name--dark { color: rgba(255,237,215,0.7); }
        .oz-feature-name--light { color: rgba(30,41,59,0.7); }
        .oz-feature-name--bluelight { color: rgba(251,191,36,0.7); }
        .oz-feature-desc { font-size: 0.7rem; line-height: 1.6; text-align: center; max-width: 200px; }
        .oz-feature-desc--dark { color: rgba(255,237,215,0.22); }
        .oz-feature-desc--light { color: rgba(30,41,59,0.28); }
        .oz-feature-desc--bluelight { color: rgba(251,191,36,0.22); }
        .oz-feature-dash { width: 100%; height: 1px; margin-top: 0.5rem; }
        .oz-feature-dash--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.06) 0 4px, transparent 4px 8px); }
        .oz-feature-dash--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.04) 0 4px, transparent 4px 8px); }
        .oz-feature-dash--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.05) 0 4px, transparent 4px 8px); }

        /* ═════════════════════════
           LAUNCH
           ═════════════════════════ */
        .oz-section-inner--launch { gap: 1.2rem; align-items: center; }
        .oz-launch-btn-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; }
        .oz-launch-btn { position: relative; border: none; background: none; padding: 0; font-family: inherit; cursor: pointer; }
        .oz-launch-btn-inner {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 1.1rem 2.5rem; border-radius: 3em;
          font-size: 0.9rem; font-weight: 600;
          letter-spacing: 0.15em; text-transform: uppercase;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative; z-index: 1;
        }
        .oz-launch-btn--dark .oz-launch-btn-inner { background: #ffedd7; color: #100904; }
        .oz-launch-btn--light .oz-launch-btn-inner { background: #0f172a; color: #f8fafc; }
        .oz-launch-btn--bluelight .oz-launch-btn-inner { background: #fbbf24; color: #100904; }
        .oz-launch-btn:hover .oz-launch-btn-inner { transform: scale(1.04); }
        .oz-launch-btn:active .oz-launch-btn-inner { transform: scale(0.97); }
        .oz-launch-btn-glow { position: absolute; inset: -4px; border-radius: 3em; opacity: 0; transition: opacity 0.3s; }
        .oz-launch-btn--dark .oz-launch-btn-glow { box-shadow: 0 0 30px rgba(220,80,0,0.3), 0 0 70px rgba(220,80,0,0.1); }
        .oz-launch-btn--light .oz-launch-btn-glow { box-shadow: 0 0 30px rgba(6,182,212,0.3), 0 0 70px rgba(6,182,212,0.1); }
        .oz-launch-btn--bluelight .oz-launch-btn-glow { box-shadow: 0 0 30px rgba(245,158,11,0.3), 0 0 70px rgba(245,158,11,0.1); }
        .oz-launch-btn:hover .oz-launch-btn-glow { opacity: 1; }
        .oz-launch-hint { font-size: 0.6rem; letter-spacing: 0.05em; }
        .oz-launch-hint--dark { color: rgba(255,237,215,0.18); }
        .oz-launch-hint--light { color: rgba(30,41,59,0.2); }
        .oz-launch-hint--bluelight { color: rgba(251,191,36,0.18); }
        .oz-launch-sep { width: 120px; height: 1px; margin: 0.5rem 0; }
        .oz-launch-sep--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.1) 0 5px, transparent 5px 10px); }
        .oz-launch-sep--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.08) 0 5px, transparent 5px 10px); }
        .oz-launch-sep--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.08) 0 5px, transparent 5px 10px); }
        .oz-cred-card {
          width: 260px; border: none; background: none;
          font-family: inherit; cursor: pointer; text-align: center;
          padding: 1.2rem 0; transition: transform 0.3s ease;
        }
        .oz-cred-card:hover { transform: translateY(-2px) !important; }
        .oz-cred-top { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.6rem; }
        .oz-cred-icon {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; border: 1px dashed; transition: all 0.3s;
        }
        .oz-cred-icon--dark { border-color: rgba(255,237,215,0.12); color: rgba(255,237,215,0.5); background: rgba(255,237,215,0.02); }
        .oz-cred-icon--light { border-color: rgba(30,41,59,0.1); color: rgba(30,41,59,0.5); background: rgba(30,41,59,0.02); }
        .oz-cred-icon--bluelight { border-color: rgba(251,191,36,0.12); color: rgba(251,191,36,0.5); background: rgba(251,191,36,0.02); }
        .oz-cred-card:hover .oz-cred-icon--dark { border-color: rgba(220,80,0,0.3); background: rgba(220,80,0,0.05); }
        .oz-cred-card:hover .oz-cred-icon--light { border-color: rgba(6,182,212,0.3); background: rgba(6,182,212,0.05); }
        .oz-cred-card:hover .oz-cred-icon--bluelight { border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.05); }
        .oz-cred-arrow { opacity: 0.2; transition: all 0.3s; }
        .oz-cred-arrow--dark { color: #ffedd7; }
        .oz-cred-arrow--light { color: #0f172a; }
        .oz-cred-arrow--bluelight { color: #fbbf24; }
        .oz-cred-card:hover .oz-cred-arrow { opacity: 0.6; transform: translate(2px, -2px); }
        .oz-cred-body { display: flex; flex-direction: column; gap: 0.15rem; }
        .oz-cred-title { font-size: 0.82rem; font-weight: 600; letter-spacing: 0.02em; }
        .oz-cred-title--dark { color: rgba(255,237,215,0.65); }
        .oz-cred-title--light { color: rgba(30,41,59,0.65); }
        .oz-cred-title--bluelight { color: rgba(251,191,36,0.65); }
        .oz-cred-desc { font-size: 0.65rem; }
        .oz-cred-desc--dark { color: rgba(255,237,215,0.22); }
        .oz-cred-desc--light { color: rgba(30,41,59,0.28); }
        .oz-cred-desc--bluelight { color: rgba(251,191,36,0.22); }
        .oz-cred-dash { width: 100%; height: 1px; margin-top: 0.8rem; }
        .oz-cred-dash--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.05) 0 3px, transparent 3px 6px); }
        .oz-cred-dash--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.04) 0 3px, transparent 3px 6px); }
        .oz-cred-dash--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.04) 0 3px, transparent 3px 6px); }
        .oz-status { display: flex; align-items: center; gap: 0.5rem; }
        .oz-status-dot { width: 4px; height: 4px; border-radius: 50%; }
        .oz-status-dot--dark { background: rgba(255,237,215,0.15); }
        .oz-status-dot--light { background: rgba(30,41,59,0.12); }
        .oz-status-dot--bluelight { background: rgba(251,191,36,0.15); }
        .oz-status-text { font-size: 0.55rem; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; }
        .oz-status-text--dark { color: rgba(255,237,215,0.12); }
        .oz-status-text--light { color: rgba(30,41,59,0.15); }
        .oz-status-text--bluelight { color: rgba(251,191,36,0.12); }

        /* ═════════════════════════
           WELCOME
           ═════════════════════════ */
        .oz-welcome-card {
          position: relative; display: flex; flex-direction: column;
          align-items: center; gap: 0.4rem;
          padding: 3rem 3rem 2.5rem; border-radius: 20px;
          border: 1px dashed; max-width: 420px; overflow: hidden;
        }
        .oz-welcome-card--dark { border-color: rgba(255,237,215,0.06); background: rgba(255,237,215,0.01); }
        .oz-welcome-card--light { border-color: rgba(30,41,59,0.06); background: rgba(30,41,59,0.01); }
        .oz-welcome-card--bluelight { border-color: rgba(251,191,36,0.06); background: rgba(251,191,36,0.01); }
        .oz-welcome-glow {
          position: absolute; top: -60%; left: 50%; transform: translateX(-50%);
          width: 300px; height: 300px; border-radius: 50%; pointer-events: none;
        }
        .oz-welcome-card--dark .oz-welcome-glow { background: radial-gradient(circle, rgba(220,80,0,0.04) 0%, transparent 70%); }
        .oz-welcome-card--light .oz-welcome-glow { background: radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%); }
        .oz-welcome-card--bluelight .oz-welcome-glow { background: radial-gradient(circle, rgba(251,191,36,0.04) 0%, transparent 70%); }
        .oz-welcome-label { font-size: 0.7rem; font-weight: 400; letter-spacing: 0.04em; }
        .oz-welcome-label--dark { color: rgba(255,237,215,0.25); }
        .oz-welcome-label--light { color: rgba(30,41,59,0.3); }
        .oz-welcome-label--bluelight { color: rgba(251,191,36,0.25); }
        .oz-welcome-name {
          font-size: clamp(1.8rem, 4vw, 2.8rem);
          font-weight: 800; letter-spacing: -0.01em;
        }
        .oz-welcome-name--dark {
          color: transparent; background: linear-gradient(135deg, #ffedd7 30%, #dc5000 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-welcome-name--light {
          color: transparent; background: linear-gradient(135deg, #0f172a 30%, #06b6d4 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-welcome-name--bluelight {
          color: transparent; background: linear-gradient(135deg, #fbbf24 30%, #d97706 100%);
          -webkit-background-clip: text; background-clip: text;
        }
        .oz-welcome-role-wrap { margin: 0.3rem 0 0.8rem; }
        .oz-welcome-role {
          display: inline-block; font-size: 0.55rem; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase;
          padding: 0.3rem 0.8rem; border-radius: 3em; border: 1px dashed;
        }
        .oz-welcome-role--dark { color: rgba(255,237,215,0.4); border-color: rgba(255,237,215,0.1); }
        .oz-welcome-role--light { color: rgba(30,41,59,0.4); border-color: rgba(30,41,59,0.1); }
        .oz-welcome-role--bluelight { color: rgba(251,191,36,0.4); border-color: rgba(251,191,36,0.1); }
        .oz-welcome-dash { width: 60px; height: 1px; margin: 0.2rem 0 0.8rem; }
        .oz-welcome-dash--dark { background: repeating-linear-gradient(90deg, rgba(255,237,215,0.1) 0 3px, transparent 3px 6px); }
        .oz-welcome-dash--light { background: repeating-linear-gradient(90deg, rgba(30,41,59,0.08) 0 3px, transparent 3px 6px); }
        .oz-welcome-dash--bluelight { background: repeating-linear-gradient(90deg, rgba(251,191,36,0.08) 0 3px, transparent 3px 6px); }
        .oz-welcome-msg { font-size: 0.72rem; line-height: 1.7; text-align: center; max-width: 280px; }
        .oz-welcome-msg--dark { color: rgba(255,237,215,0.2); }
        .oz-welcome-msg--light { color: rgba(30,41,59,0.28); }
        .oz-welcome-msg--bluelight { color: rgba(251,191,36,0.2); }
        .oz-footer-badge { display: flex; align-items: center; gap: 0.5rem; margin-top: 2rem; }
        .oz-footer-badge-dot {
          width: 4px; height: 4px; border-radius: 50%;
          animation: oz-pulse 2.5s ease-in-out infinite;
        }
        .oz-footer-badge-dot--dark { background: #dc5000; opacity: 0.4; }
        .oz-footer-badge-dot--light { background: #06b6d4; opacity: 0.4; }
        .oz-footer-badge-dot--bluelight { background: #f59e0b; opacity: 0.4; }
        .oz-footer-badge-text { font-size: 0.5rem; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; }
        .oz-footer-badge-text--dark { color: rgba(255,237,215,0.1); }
        .oz-footer-badge-text--light { color: rgba(30,41,59,0.12); }
        .oz-footer-badge-text--bluelight { color: rgba(251,191,36,0.1); }

        /* ═════════════════════════
           RAIL
           ═════════════════════════ */
        .oz-rail {
          position: fixed; right: 1.5rem; top: 50%;
          transform: translateY(-50%); z-index: 50;
          display: flex; align-items: center; gap: 1rem;
        }
        .oz-rail-track {
          width: 2px; height: 80px; border-radius: 1px;
          overflow: hidden; position: relative;
        }
        .oz-rail-fill {
          position: absolute; bottom: 0; left: 0; right: 0;
          border-radius: 1px; transition: height 0.1s ease-out;
        }
        .oz-rail-fill--dark { background: rgba(255,237,215,0.15); }
        .oz-rail-fill--light { background: rgba(30,41,59,0.12); }
        .oz-rail-fill--bluelight { background: rgba(251,191,36,0.15); }
        .oz-rail-labels { display: flex; flex-direction: column; gap: 0.5rem; }
        .oz-rail-label {
          display: flex; align-items: center; gap: 0.35rem;
          background: none; border: none; padding: 0;
          cursor: pointer; font-family: inherit; opacity: 0.3; transition: opacity 0.3s;
        }
        .oz-rail-label:hover { opacity: 0.6; }
        .oz-rail-label--active { opacity: 1; }
        .oz-rail-dot {
          width: 5px; height: 5px; border-radius: 50%; transition: background 0.3s;
        }
        .oz-rail-dot--dark { background: rgba(255,237,215,0.15); }
        .oz-rail-dot--light { background: rgba(30,41,59,0.12); }
        .oz-rail-dot--bluelight { background: rgba(251,191,36,0.15); }
        .oz-rail-dot--passed.oz-rail-dot--dark { background: #dc5000; }
        .oz-rail-dot--passed.oz-rail-dot--light { background: #06b6d4; }
        .oz-rail-dot--passed.oz-rail-dot--bluelight { background: #f59e0b; }
        .oz-rail-label-text {
          font-size: 0.45rem; font-weight: 500;
          letter-spacing: 0.12em; text-transform: uppercase;
        }
        .oz-rail-label-text--dark { color: rgba(255,237,215,0.25); }
        .oz-rail-label-text--light { color: rgba(30,41,59,0.25); }
        .oz-rail-label-text--bluelight { color: rgba(251,191,36,0.25); }

        /* ═════════════════════════
           RESPONSIVE
           ═════════════════════════ */
        @media (max-width: 900px) {
          .oz-rail { display: none; }
          .oz-features-grid { grid-template-columns: 1fr; max-width: 320px; }
          .oz-feature-card {
            flex-direction: row; text-align: left;
            padding: 1.2rem 1.5rem; gap: 1rem; align-items: center;
          }
          .oz-feature-icon-wrap { width: 42px; height: 42px; min-width: 42px; border-radius: 12px; }
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
