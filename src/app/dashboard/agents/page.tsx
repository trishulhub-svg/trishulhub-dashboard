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
  Terminal,
  Rocket,
  Activity,
  Clock,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TRISHULHUB WORKSPACE v2.1 — Live AI + Dynamic Protocol
   ═══════════════════════════════════════════════════════════════ */

/* ── Simulated AI operational lines ── */
const AI_LINES = [
  { prefix: "DEV", msg: "Compiling project assets...", type: "info" },
  { prefix: "SYNC", msg: "Protocol v10.4.0 synced to remote", type: "success" },
  { prefix: "FINANCE", msg: "Invoice INV-2026-003 generated", type: "info" },
  { prefix: "CLIENT_HUNTER", msg: "Scanning London area for leads...", type: "info" },
  { prefix: "DEV", msg: "Deployed staging build — 0 errors", type: "success" },
  { prefix: "PM", msg: "Sprint velocity: 94% — on track", type: "info" },
  { prefix: "HR", msg: "Leave request approved for Kiran", type: "info" },
  { prefix: "SUPPORT", msg: "Ticket #1042 resolved — DNS updated", type: "success" },
  { prefix: "CONTENT", msg: "Blog draft published for review", type: "info" },
  { prefix: "DEV", msg: "PR #47 merged into main branch", type: "success" },
  { prefix: "SYNC", msg: "Workspace state checkpoint saved", type: "info" },
  { prefix: "FINANCE", msg: "Payment reminder sent to Sharma Corp", type: "info" },
  { prefix: "CLIENT_HUNTER", msg: "3 new prospects scored above 75", type: "success" },
  { prefix: "DEV", msg: "Security audit passed — 0 vulnerabilities", type: "success" },
  { prefix: "PM", msg: "Deadline check: all tasks within SLA", type: "info" },
  { prefix: "SUPPORT", msg: "SSL certificate auto-renewed", type: "success" },
  { prefix: "CONTENT", msg: "SEO analysis: +12% organic traffic", type: "success" },
  { prefix: "SYNC", msg: "Git repository health check passed", type: "info" },
  { prefix: "DEV", msg: "Database backup completed (2.4 GB)", type: "info" },
  { prefix: "FINANCE", msg: "Monthly report generated", type: "success" },
  { prefix: "PM", msg: "Resource allocation optimized for Q3", type: "info" },
  { prefix: "CLIENT_HUNTER", msg: "Email campaign sent — 42 opens", type: "info" },
  { prefix: "SUPPORT", msg: "Uptime monitoring: 99.97% this month", type: "success" },
  { prefix: "DEV", msg: "Cache purged — CDN refreshed globally", type: "info" },
  { prefix: "HR", msg: "Attendance synced for all team members", type: "info" },
  { prefix: "SYNC", msg: "Encryption key rotation verified", type: "success" },
  { prefix: "CONTENT", msg: "Social media queue updated (7 posts)", type: "info" },
  { prefix: "DEV", msg: "API rate limit optimized — 15% faster", type: "success" },
  { prefix: "PM", msg: "Client feedback score: 4.8/5.0", type: "success" },
  { prefix: "SUPPORT", msg: "New knowledge base article published", type: "info" },
];

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

  /* ── Fetch protocol title from API ── */
  const [protocolTitle, setProtocolTitle] = useState("Protocol");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/protocol/init");
        if (!res.ok) return;
        const data = await res.json();
        if (data.protocol?.fileName) {
          // Extract clean name: "trishul-protocol-v10.4.0.pdf" → "v10.4.0"
          const name = data.protocol.fileName.replace(/\.pdf$/i, "");
          setProtocolTitle(name);
        }
      } catch { /* silent */ }
    })();
  }, []);

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

  /* ── Mouse-following glow (desktop only) ── */
  const glowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!glowRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    glowRef.current.style.setProperty("--glow-x", `${e.clientX - rect.left}px`);
    glowRef.current.style.setProperty("--glow-y", `${e.clientY - rect.top}px`);
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
          second: "2-digit",
          hour12: true,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Live AI Terminal Feed ── */
  const [aiLogs, setAiLogs] = useState<typeof AI_LINES>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const lineIdx = useRef(0);

  useEffect(() => {
    if (!entered) return;
    // Start with 3 lines
    const initial = AI_LINES.slice(0, 3);
    setAiLogs(initial);
    lineIdx.current = 3;

    // Add new line every 2.5-4s
    const addLine = () => {
      const line = AI_LINES[lineIdx.current % AI_LINES.length];
      lineIdx.current++;
      setAiLogs((prev) => {
        const next = [...prev, line];
        // Keep max 12 lines visible
        return next.length > 12 ? next.slice(-12) : next;
      });
    };

    const first = setTimeout(() => addLine(), 1500);
    const interval = setInterval(() => {
      addLine();
    }, 2500 + Math.random() * 1500);

    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [entered]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [aiLogs]);

  /* ── Uptime counter ── */
  const [uptime, setUptime] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`ws-root ws-root--${mode}`}
        onMouseMove={handleMouseMove}
      >
        {/* ═══ AMBIENT BACKGROUND ═══ */}
        <div ref={glowRef} className="ws-glow" aria-hidden />
        <div className="ws-orbs" aria-hidden>
          <div className="ws-orb ws-orb--1" />
          <div className="ws-orb ws-orb--2" />
          <div className="ws-orb ws-orb--3" />
        </div>
        <div className="ws-dots" aria-hidden />
        <div className="ws-noise" aria-hidden />

        {/* ═══ MAIN GRID LAYOUT ═══ */}
        <div className="ws-layout">
          {/* ── HEADER BAR ── */}
          <header className={`ws-header ${entered ? "ws-in" : ""}`}>
            <div className="ws-header-left">
              <div className={`ws-header-badge ws-header-badge--${mode}`}>
                <div className={`ws-pulse-dot ws-pulse-dot--${mode}`} />
                <span>{protocolTitle}</span>
              </div>
            </div>
            <div className="ws-header-right">
              <span className={`ws-uptime ws-uptime--${mode}`}>
                <Clock size={11} />
                {formatUptime(uptime)}
              </span>
              <span className={`ws-time ws-time--${mode}`}>{time}</span>
            </div>
          </header>

          {/* ── BENTO GRID ════════════════════════════════ */}
          <main className="ws-bento">
            {/* ─── ROW 1: Hero ─── */}

            {/* HERO CARD — spans full width */}
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

            {/* ─── ROW 2: Stats ─── */}

            {/* STAT CARD — Agentic Mode */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.2s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--cyan">
                <Clock size={18} />
              </div>
              <div className="ws-stat-body">
                <span className={`ws-stat-label ws-stat-label--${mode}`}>
                  Agentic Mode
                </span>
                <span className={`ws-stat-value ws-stat-value--${mode}`}>
                  8hr Horizon
                </span>
              </div>
            </div>

            {/* STAT CARD — Role */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.25s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--purple">
                <Activity size={18} />
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

            {/* STAT CARD — Status */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.3s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--pink">
                <Rocket size={18} />
              </div>
              <div className="ws-stat-body">
                <span className={`ws-stat-label ws-stat-label--${mode}`}>
                  Status
                </span>
                <span className={`ws-stat-value ws-stat-value--${mode}`}>
                  All Systems Go
                </span>
              </div>
            </div>

            {/* ─── ROW 3: AI Live Feed ─── */}

            {/* LIVE AI FEED CARD — spans full width on mobile, 3 cols on desktop */}
            <div
              className={`ws-card ws-feed-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.35s" }}
            >
              <div className="ws-feed-header">
                <div className="ws-feed-title-row">
                  <Terminal size={14} className={`ws-feed-icon ws-feed-icon--${mode}`} />
                  <h3 className={`ws-feed-heading ws-feed-heading--${mode}`}>
                    Live Operations
                  </h3>
                </div>
                <div className="ws-feed-live-badge">
                  <span className="ws-feed-live-dot" />
                  <span>LIVE</span>
                </div>
              </div>
              <div ref={feedRef} className="ws-feed-scroll">
                {aiLogs.map((line, i) => (
                  <div key={i} className={`ws-feed-line ws-feed-line--enter`}>
                    <span className={`ws-feed-time ws-feed-time--${mode}`}>
                      {new Date(Date.now() - (aiLogs.length - 1 - i) * 3000)
                        .toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                    </span>
                    <span className={`ws-feed-prefix ws-feed-prefix--${line.type}`}>
                      [{line.prefix}]
                    </span>
                    <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                      {line.msg}
                    </span>
                    {line.type === "success" && (
                      <span className="ws-feed-check">&#10003;</span>
                    )}
                  </div>
                ))}
                {aiLogs.length > 0 && (
                  <div className="ws-feed-line ws-feed-line--cursor">
                    <span className="ws-feed-blink">&#9608;</span>
                  </div>
                )}
              </div>
            </div>

            {/* ─── ROW 4: Actions + Features ─── */}

            {/* START CARD */}
            <div
              className={`ws-card ws-start-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.4s" }}
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
                      Full AI agent environment
                    </p>
                  </div>
                </div>
                <div className={`ws-start-badge ws-start-badge--${mode}`}>
                  <span>Open</span>
                  <ArrowUpRight size={14} />
                </div>
              </button>
              <div className="ws-start-accent" />
            </div>

            {/* CREDENTIALS CARD */}
            <div
              className={`ws-card ws-cred-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.45s" }}
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
                      Get your workspace ID & password
                    </p>
                  </div>
                </div>
                <div className={`ws-cred-arrow-wrap ws-cred-arrow-wrap--${mode}`}>
                  <ArrowUpRight size={16} />
                </div>
              </button>
              <div className="ws-cred-gradient-line" />
            </div>

            {/* FEATURES CARD */}
            <div
              className={`ws-card ws-features-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.5s" }}
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
                  <Terminal size={14} />
                  <span>Agentic</span>
                </div>
              </div>
            </div>

            {/* ─── ROW 5: Status bars ─── */}

            {/* STATUS INDICATOR CARD */}
            <div
              className={`ws-card ws-status-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.55s" }}
            >
              <div className="ws-status-row">
                <div className={`ws-status-dot ws-status-dot--${mode}`} />
                <span className={`ws-status-text ws-status-text--${mode}`}>
                  All Systems Operational
                </span>
              </div>
              <div className="ws-status-bars">
                <div className="ws-status-bar-item">
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
            <span className={`ws-footer-text ws-footer-text--${mode}`}>
              Workspace
            </span>
            <span className={`ws-footer-sep`}>·</span>
            <span className={`ws-footer-text ws-footer-text--${mode}`}>
              {protocolTitle}
            </span>
            <span className={`ws-footer-sep`}>·</span>
            <span className={`ws-footer-text ws-footer-text--${mode}`}>
              {userRole}
            </span>
          </footer>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
         STYLES — v2.1
         ═══════════════════════════════════════════════════════════════ */}
      <style jsx global>{`
        @media (pointer: coarse) {
          .ws-root, .ws-root * { cursor: auto !important; }
        }

        /* ═══════════════════════════════════════
           DESIGN TOKENS
           ═══════════════════════════════════════ */
        .ws-root {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
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
          --ws-accent-green: #22c55e;
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
          --ws-accent-green: #16a34a;
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
          --ws-accent-green: #84cc16;
        }

        /* ═══════════════════════════════════════
           AMBIENT BACKGROUND
           ═══════════════════════════════════════ */
        .ws-glow {
          position: fixed;
          inset: 0; z-index: 0;
          pointer-events: none;
          background: radial-gradient(
            600px circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(6,182,212,0.04), transparent 60%
          );
          opacity: 0;
          transition: opacity 0.3s;
        }
        .ws-root:hover .ws-glow { opacity: 1; }
        .ws-root--light .ws-glow {
          background: radial-gradient(600px circle at var(--glow-x,50%) var(--glow-y,50%), rgba(6,182,212,0.05), transparent 60%);
        }
        .ws-root--bluelight .ws-glow {
          background: radial-gradient(600px circle at var(--glow-x,50%) var(--glow-y,50%), rgba(251,191,36,0.04), transparent 60%);
        }

        .ws-orbs {
          position: fixed; inset: 0; z-index: 0;
          pointer-events: none; overflow: hidden;
        }
        .ws-orb {
          position: absolute; border-radius: 50%;
          filter: blur(120px); will-change: transform;
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
          min-height: 100dvh;
          padding: 1rem 1rem 0.75rem;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        @media (min-width: 640px) {
          .ws-layout { padding: 1.25rem 1.5rem 1rem; }
        }
        @media (min-width: 1024px) {
          .ws-layout { padding: 1.5rem 2rem 1.25rem; }
        }

        /* ═══ ENTRANCE ═══ */
        .ws-in {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }

        /* ═══════════════════════════════════════
           HEADER
           ═══════════════════════════════════════ */
        .ws-header {
          display: flex; align-items: center; justify-content: space-between;
          padding-bottom: 1rem;
          opacity: 0; transform: translateY(-12px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        @media (min-width: 640px) {
          .ws-header { padding-bottom: 1.25rem; }
        }

        .ws-header-left { display: flex; align-items: center; gap: 0.5rem; }
        .ws-header-right { display: flex; align-items: center; gap: 0.6rem; }

        .ws-header-badge {
          display: flex; align-items: center; gap: 0.4rem;
          font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 0.3rem 0.7rem;
          border-radius: 100px;
          background: var(--ws-card-bg);
          border: 1px solid var(--ws-card-border);
          color: var(--ws-text-muted);
          max-width: 220px;
          overflow: hidden;
        }
        .ws-header-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ws-pulse-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34,197,94,0.4);
          animation: ws-pulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .ws-pulse-dot--bluelight {
          background: #fbbf24;
          box-shadow: 0 0 8px rgba(251,191,36,0.4);
        }
        @keyframes ws-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .ws-uptime {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.7rem; font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--ws-text-dim);
          letter-spacing: 0.02em;
        }
        .ws-time {
          font-size: 0.75rem; font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--ws-text-dim);
          letter-spacing: 0.02em;
        }

        /* ═══════════════════════════════════════
           BENTO GRID
           ═══════════════════════════════════════ */
        .ws-bento {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
          flex: 1;
        }
        @media (min-width: 480px) {
          .ws-bento { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
        }
        @media (min-width: 1024px) {
          .ws-bento {
            grid-template-columns: repeat(3, 1fr);
            gap: 0.875rem;
          }
        }

        /* ═══════════════════════════════════════
           CARD BASE
           ═══════════════════════════════════════ */
        .ws-card {
          position: relative;
          border-radius: 14px;
          background: var(--ws-card-bg);
          border: 1px solid var(--ws-card-border);
          overflow: hidden;
          opacity: 0;
          transform: translateY(16px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
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
          padding: 1.5rem 1.25rem 1.25rem;
          display: flex; align-items: flex-start; justify-content: space-between;
          min-height: 180px;
        }
        @media (min-width: 480px) {
          .ws-hero-card { padding: 2rem 1.75rem 1.5rem; min-height: 200px; }
        }
        @media (min-width: 768px) {
          .ws-hero-card { padding: 2.25rem 2.5rem 1.75rem; min-height: 230px; }
        }

        .ws-hero-glow {
          position: absolute;
          top: -60px; right: -40px;
          width: 280px; height: 280px;
          border-radius: 50%;
          filter: blur(100px);
          pointer-events: none; z-index: 0;
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
          font-size: 0.75rem; font-weight: 500;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
          margin-bottom: 0.3rem;
        }
        .ws-hero-title {
          font-size: clamp(1.6rem, 5vw, 2.6rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.1;
          margin-bottom: 0.6rem;
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

        .ws-tagline {
          display: flex; align-items: center; gap: 0.5rem;
          margin-bottom: 1.25rem;
        }
        .ws-tagline-bar {
          width: 18px; height: 1px;
          background: var(--ws-text-dim); flex-shrink: 0;
        }
        .ws-tagline--dark { color: rgba(255,255,255,0.40); font-size: 0.85rem; font-style: italic; letter-spacing: 0.01em; }
        .ws-tagline--light { color: rgba(0,0,0,0.35); font-size: 0.85rem; font-style: italic; letter-spacing: 0.01em; }
        .ws-tagline--bluelight { color: rgba(251,191,36,0.45); font-size: 0.85rem; font-style: italic; letter-spacing: 0.01em; }

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
          display: flex; align-items: center; gap: 0.5rem;
          flex-wrap: wrap;
        }

        .ws-btn-primary {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          border-radius: 10px; border: none;
          font-family: inherit;
          font-size: 0.8rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-btn-primary--dark {
          background: linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15));
          color: #06b6d4; border: 1px solid rgba(6,182,212,0.20);
        }
        .ws-btn-primary--dark:hover {
          background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.20));
          border-color: rgba(6,182,212,0.40);
          box-shadow: 0 0 24px rgba(6,182,212,0.12);
          transform: translateY(-1px);
        }
        .ws-btn-primary--light {
          background: linear-gradient(135deg, rgba(6,182,212,0.10), rgba(139,92,246,0.08));
          color: #0891b2; border: 1px solid rgba(6,182,212,0.20);
        }
        .ws-btn-primary--light:hover {
          background: linear-gradient(135deg, rgba(6,182,212,0.18), rgba(139,92,246,0.14));
          border-color: rgba(6,182,212,0.35);
          transform: translateY(-1px);
        }
        .ws-btn-primary--bluelight {
          background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(217,119,6,0.10));
          color: #f59e0b; border: 1px solid rgba(251,191,36,0.20);
        }
        .ws-btn-primary--bluelight:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.22), rgba(217,119,6,0.18));
          border-color: rgba(251,191,36,0.40);
          box-shadow: 0 0 24px rgba(251,191,36,0.12);
          transform: translateY(-1px);
        }

        .ws-btn-ghost {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.6rem 1rem;
          border-radius: 10px;
          border: 1px solid var(--ws-card-border);
          background: transparent;
          font-family: inherit;
          font-size: 0.8rem; font-weight: 500;
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

        .ws-hero-rings {
          position: absolute;
          right: 1rem; top: 50%;
          transform: translateY(-50%);
          width: 150px; height: 150px;
          opacity: 0.5;
          color: var(--ws-accent-cyan);
          animation: ws-ring-rotate 40s linear infinite;
        }
        .ws-hero-rings--bluelight { color: #f59e0b; }
        @media (max-width: 639px) {
          .ws-hero-rings { display: none; }
        }
        @keyframes ws-ring-rotate {
          to { transform: translateY(-50%) rotate(360deg); }
        }

        /* ═══════════════════════════════════════
           STAT CARDS
           ═══════════════════════════════════════ */
        .ws-stat-card {
          padding: 1rem 1.1rem;
          display: flex; align-items: center; gap: 0.75rem;
        }
        .ws-stat-icon-wrap {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; flex-shrink: 0;
          transition: transform 0.3s;
        }
        .ws-stat-card:hover .ws-stat-icon-wrap { transform: scale(1.08); }
        .ws-stat-icon-wrap--cyan { background: var(--ws-accent-cyan-dim); color: var(--ws-accent-cyan); }
        .ws-stat-icon-wrap--purple { background: var(--ws-accent-purple-dim); color: var(--ws-accent-purple); }
        .ws-stat-icon-wrap--pink { background: var(--ws-accent-pink-dim); color: var(--ws-accent-pink); }

        .ws-stat-body { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
        .ws-stat-label {
          font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
        }
        .ws-stat-value {
          font-size: 0.82rem; font-weight: 600;
          color: var(--ws-text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ═══════════════════════════════════════
           LIVE AI FEED CARD
           ═══════════════════════════════════════ */
        .ws-feed-card {
          grid-column: 1 / -1;
          padding: 0;
          display: flex; flex-direction: column;
        }
        @media (min-width: 1024px) {
          .ws-feed-card { grid-column: span 3; }
        }

        .ws-feed-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.85rem 1rem 0.65rem;
          border-bottom: 1px solid var(--ws-card-border);
        }
        .ws-feed-title-row {
          display: flex; align-items: center; gap: 0.45rem;
        }
        .ws-feed-icon {
          color: var(--ws-accent-cyan);
        }
        .ws-feed-heading {
          font-size: 0.72rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ws-text-dim);
        }

        .ws-feed-live-badge {
          display: flex; align-items: center; gap: 0.35rem;
          font-size: 0.6rem; font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--ws-accent-green);
        }
        .ws-feed-live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--ws-accent-green);
          box-shadow: 0 0 6px var(--ws-accent-green);
          animation: ws-pulse 1.5s ease-in-out infinite;
        }

        .ws-feed-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 0;
          max-height: 220px;
          min-height: 140px;
          scrollbar-width: thin;
          scrollbar-color: var(--ws-card-border) transparent;
        }
        .ws-feed-scroll::-webkit-scrollbar { width: 4px; }
        .ws-feed-scroll::-webkit-scrollbar-track { background: transparent; }
        .ws-feed-scroll::-webkit-scrollbar-thumb {
          background: var(--ws-card-border); border-radius: 4px;
        }

        .ws-feed-line {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.25rem 1rem;
          font-size: 0.7rem;
          line-height: 1.5;
          animation: ws-feed-in 0.35s ease-out;
        }
        @keyframes ws-feed-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ws-feed-time {
          font-variant-numeric: tabular-nums;
          color: var(--ws-text-dim);
          font-size: 0.62rem;
          flex-shrink: 0;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        }
        .ws-feed-prefix {
          font-weight: 600;
          font-size: 0.65rem;
          flex-shrink: 0;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        }
        .ws-feed-prefix--info { color: var(--ws-accent-cyan); }
        .ws-feed-prefix--success { color: var(--ws-accent-green); }

        .ws-feed-msg {
          color: var(--ws-text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ws-feed-check {
          color: var(--ws-accent-green);
          font-size: 0.7rem;
          flex-shrink: 0;
        }

        .ws-feed-line--cursor {
          padding: 0.15rem 1rem;
        }
        .ws-feed-blink {
          color: var(--ws-text-dim);
          font-size: 0.7rem;
          animation: ws-blink 1s step-end infinite;
        }

        /* ═══════════════════════════════════════
           START CARD
           ═══════════════════════════════════════ */
        .ws-start-card { position: relative; }
        .ws-start-card-inner {
          width: 100%; display: flex; align-items: center;
          justify-content: space-between; gap: 0.75rem;
          padding: 1.15rem 1rem; background: none; border: none;
          font-family: inherit; cursor: pointer; text-align: left;
        }
        .ws-start-left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
        .ws-start-icon-box {
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 11px; flex-shrink: 0;
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
          font-size: 0.85rem; font-weight: 600;
          margin-bottom: 0.15rem;
        }
        .ws-start-heading--dark { color: rgba(255,255,255,0.85); }
        .ws-start-heading--light { color: rgba(0,0,0,0.80); }
        .ws-start-heading--bluelight { color: rgba(251,191,36,0.85); }

        .ws-start-sub {
          font-size: 0.7rem; line-height: 1.3;
        }
        .ws-start-sub--dark { color: rgba(255,255,255,0.30); }
        .ws-start-sub--light { color: rgba(0,0,0,0.35); }
        .ws-start-sub--bluelight { color: rgba(251,191,36,0.35); }

        .ws-start-badge {
          display: flex; align-items: center; gap: 0.25rem;
          padding: 0.35rem 0.7rem;
          border-radius: 8px; flex-shrink: 0;
          font-size: 0.68rem; font-weight: 600;
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
        .ws-start-accent {
          position: absolute; bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--ws-accent-cyan), transparent);
          opacity: 0; transition: opacity 0.4s;
        }
        .ws-start-card:hover .ws-start-accent { opacity: 0.7; }

        /* ═══════════════════════════════════════
           CREDENTIALS CARD
           ═══════════════════════════════════════ */
        .ws-cred-card { position: relative; }
        .ws-cred-card-inner {
          width: 100%; display: flex; align-items: center;
          justify-content: space-between; gap: 0.75rem;
          padding: 1.15rem 1rem; background: none; border: none;
          font-family: inherit; cursor: pointer; text-align: left;
        }
        .ws-cred-left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }

        .ws-cred-icon-box {
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 11px; flex-shrink: 0;
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
          font-size: 0.85rem; font-weight: 600;
          margin-bottom: 0.15rem;
        }
        .ws-cred-heading--dark { color: rgba(255,255,255,0.85); }
        .ws-cred-heading--light { color: rgba(0,0,0,0.80); }
        .ws-cred-heading--bluelight { color: rgba(251,191,36,0.85); }

        .ws-cred-sub { font-size: 0.7rem; line-height: 1.3; }
        .ws-cred-sub--dark { color: rgba(255,255,255,0.30); }
        .ws-cred-sub--light { color: rgba(0,0,0,0.35); }
        .ws-cred-sub--bluelight { color: rgba(251,191,36,0.35); }

        .ws-cred-arrow-wrap {
          width: 30px; height: 30px;
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
        .ws-cred-gradient-line {
          height: 2px;
          background: linear-gradient(90deg, var(--ws-accent-cyan), var(--ws-accent-purple), var(--ws-accent-pink));
          opacity: 0; transition: opacity 0.4s;
        }
        .ws-cred-card:hover .ws-cred-gradient-line { opacity: 0.6; }

        /* ═══════════════════════════════════════
           FEATURES CARD
           ═══════════════════════════════════════ */
        .ws-features-card { padding: 1rem 1.1rem; }
        .ws-features-heading {
          font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ws-text-dim);
          margin-bottom: 0.75rem;
        }
        .ws-features-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.4rem;
        }
        .ws-feature-item {
          display: flex; align-items: center; gap: 0.35rem;
          padding: 0.45rem 0.55rem;
          border-radius: 8px;
          font-size: 0.68rem; font-weight: 500;
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
           STATUS CARD
           ═══════════════════════════════════════ */
        .ws-status-card { padding: 1rem 1.1rem; }
        .ws-status-row {
          display: flex; align-items: center; gap: 0.45rem;
          margin-bottom: 0.85rem;
        }
        .ws-status-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34,197,94,0.3);
          animation: ws-pulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .ws-status-dot--bluelight {
          background: #fbbf24;
          box-shadow: 0 0 8px rgba(251,191,36,0.3);
        }
        .ws-status-text {
          font-size: 0.75rem; font-weight: 500;
          color: var(--ws-text-muted);
        }
        .ws-status-bars { display: flex; flex-direction: column; gap: 0.45rem; }
        .ws-status-bar-item { display: flex; align-items: center; gap: 0.45rem; }
        .ws-bar-label {
          font-size: 0.6rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
          width: 26px; flex-shrink: 0;
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
          gap: 0.4rem;
          padding-top: 1rem;
          padding-bottom: 0.25rem;
          opacity: 0; transform: translateY(8px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          flex-wrap: wrap;
        }
        .ws-footer-brand {
          font-size: 0.68rem; font-weight: 700;
          color: var(--ws-text-muted);
        }
        .ws-footer-sep {
          font-size: 0.6rem;
          color: var(--ws-text-dim);
        }
        .ws-footer-text {
          font-size: 0.65rem;
          color: var(--ws-text-dim);
        }
      `}</style>
    </>
  );
}
