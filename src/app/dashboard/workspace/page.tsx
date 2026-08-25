"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";
import { LiveIntensity, type LineType, type LiveUser } from "@/components/workspace/live-intensity";
import { GpuLiveCard } from "@/components/workspace/gpu-live-card";
import { DeepSeekPricingBadge } from "@/components/workspace/deepseek-pricing-badge";
import { useDeepSeekPricing } from "@/hooks/use-deepseek-pricing";
import { openCodexApp, openResearchGpt, openQwenWorkspace } from "@/lib/open-external-app";

/* ═══════════════════════════════════════════════════════════════
   TRISHULHUB WORKSPACE v2.1 — Live AI + Dynamic Agents
   ═══════════════════════════════════════════════════════════════ */

/** Animated Long Horizon progress — fills up smoothly with live % + sheen when running. */
function HorizonProgressBar({
  progress,
  isActive,
  mode,
}: {
  progress: number;
  isActive: boolean;
  mode: string;
}) {
  const target = Math.min(100, Math.max(0, Math.round(progress)));
  const [display, setDisplay] = useState(0);
  const [fill, setFill] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef({ from: 0, to: 0, t0: 0 });

  useEffect(() => {
    const from = display;
    const to = target;
    if (from === to) {
      setFill(to);
      return;
    }
    startRef.current = { from, to, t0: performance.now() };
    const duration = Math.min(1400, 400 + Math.abs(to - from) * 12);

    const tick = (now: number) => {
      const { from: f, to: t, t0 } = startRef.current;
      const p = Math.min(1, (now - t0) / duration);
      // ease-out cubic — feels like progress stacking up then settling
      const eased = 1 - Math.pow(1 - p, 3);
      const value = f + (t - f) * eased;
      setDisplay(Math.round(value));
      setFill(value);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // re-run when target changes; intentionally omit `display` to avoid restart loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div className="ws-horizon-progress-block">
      <div
        className={`ws-horizon-progress-track ws-horizon-progress-track--${mode}${
          isActive ? " ws-horizon-progress-track--running" : ""
        }`}
        role="progressbar"
        aria-valuenow={display}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Project progress ${display} percent`}
      >
        <div className="ws-horizon-progress-segments" aria-hidden />
        <div
          className={`ws-horizon-progress-fill${isActive ? " ws-horizon-progress-fill--running" : ""}`}
          style={{ width: `${fill}%` }}
        >
          {isActive && fill > 2 && <span className="ws-horizon-progress-sheen" aria-hidden />}
          {isActive && fill > 1 && <span className="ws-horizon-progress-edge" aria-hidden />}
        </div>
      </div>
      <span
        className={`ws-horizon-progress-label ws-horizon-progress-pct ws-horizon-progress-label--${mode}`}
      >
        {display}
        <span className="ws-horizon-progress-pct-sym">%</span>
      </span>
    </div>
  );
}

export default function TrishulWorkspacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // DeepSeek Peak/Off-Peak — Beijing-derived, local display only.
  const deepSeekState = useDeepSeekPricing();
  // True while any GPU monitor node is streaming live data — hides the static
  // "All Systems Operational" card so the live cloud process replaces it.
  const [gpuLive, setGpuLive] = useState(false);
  const handleGpuLiveChange = useCallback((live: boolean) => setGpuLive(live), []);
  const handleActivityLine = useCallback(
    (prefix: string, type: LineType) => barBumpFnRef.current?.(prefix, type),
    []
  );

  // Guard: ensure layout session is available before rendering
  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading workspace...</p>
      </div>
    );
  }

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

  /* Display name — always Codex Agent (no protocol/init fetch) */
  const agentTitle = "Codex Agent";

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
  const handleCredentials = useCallback(() => {
    router.push("/dashboard/access-hub");
  }, [router]);

  /* ── Time-based greeting ── */
  const [greeting, setGreeting] = useState("Good evening");
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  /* ── Dynamic status bars — fully independent with wide spread ── */
  const [barValues, setBarValues] = useState({ ai: 82, sync: 45, api: 67 });
  const barTargets = useRef({ ai: 82, sync: 45, api: 67 });
  const barBumpFnRef = useRef<((p: string, t: LineType) => void) | null>(null);

  /* Each bar gets its OWN base range — intentionally spread apart */
  const getBarBase = (bar: "ai" | "sync" | "api") => {
    const h = new Date().getHours();
    const t = h + new Date().getMinutes() / 60;
    const isNight = t >= 22 || t < 6;
    const isMorning = t >= 6 && t < 9;
    const isLunch = t >= 12 && t < 13.5;
    const isEvening = t >= 18 && t < 22;

    if (bar === "ai") {
      // AI is the highest — it's the core engine
      if (isNight) return [35, 60];
      if (isMorning) return [60, 85];
      if (isLunch) return [55, 80];
      if (isEvening) return [50, 75];
      return [72, 96];
    }
    if (bar === "sync") {
      // Sync is the lowest — collaborative, intermittent
      if (isNight) return [8, 25];
      if (isMorning) return [20, 45];
      if (isLunch) return [25, 50];
      if (isEvening) return [18, 42];
      return [15, 48];
    }
    // API is the middle — varies a lot
    if (isNight) return [15, 40];
    if (isMorning) return [35, 62];
    if (isLunch) return [30, 58];
    if (isEvening) return [28, 55];
    return [40, 75];
  };

  /* Map operation prefix → bar impact — each op affects ONE primary bar strongly */
  const getBarImpact = (prefix: string, type: LineType) => {
    const r = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    const impact = { ai: 0, sync: 0, api: 0 };
    switch (prefix) {
      case "ZAI":
        impact.ai += type === "warn" ? -r(12, 20) : type === "idle" ? -r(5, 10) : r(10, 18);
        break;
      case "BLUEPRINT":
        impact.ai += type === "idle" ? -r(2, 4) : r(3, 8);
        break;
      case "DEPLOY":
        impact.api += type === "warn" ? -r(12, 18) : type === "idle" ? -r(4, 8) : r(8, 16);
        break;
      case "STACK":
        impact.api += type === "warn" ? -r(8, 14) : type === "idle" ? -r(3, 6) : r(5, 10);
        break;
      case "COLLAB":
        impact.sync += type === "warn" ? -r(10, 18) : type === "idle" ? -r(4, 8) : r(8, 16);
        break;
      case "WORKSPACE":
        impact.sync += type === "idle" ? -r(3, 6) : r(4, 8);
        impact.api += type === "idle" ? -r(1, 3) : r(1, 4);
        break;
      case "AGENT":
      case "PROTOCOL":
        impact.sync += type === "idle" ? -r(2, 4) : r(3, 6);
        break;
      case "TASK":
        impact.ai += type === "idle" ? -r(1, 3) : r(2, 6);
        impact.api += type === "idle" ? -r(1, 3) : r(1, 4);
        break;
    }
    return impact;
  };

  useEffect(() => {
    if (!entered) return;

    const initTarget = (bar: "ai" | "sync" | "api") => {
      const range = getBarBase(bar);
      return range[0] + Math.random() * (range[1] - range[0]);
    };
    barTargets.current = {
      ai: initTarget("ai"),
      sync: initTarget("sync"),
      api: initTarget("api"),
    };

    /* Lerp animation loop — throttled to ~10fps with change detection.
       (CSS `transition: width 1s` on .ws-bar-fill already smooths the bars;
       this loop only advances targets toward their current goal and skips
       state updates when nothing changed — avoids 60 re-renders/sec.) */
    const lerp = (cur: number, target: number, speed: number) =>
      cur + (target - cur) * speed;
    let last = { ai: -1, sync: -1, api: -1 };
    const animate = () => {
      setBarValues((prev) => {
        const next = {
          ai: Math.round(lerp(prev.ai, barTargets.current.ai, 0.16)),
          sync: Math.round(lerp(prev.sync, barTargets.current.sync, 0.12)),
          api: Math.round(lerp(prev.api, barTargets.current.api, 0.14)),
        };
        if (next.ai === last.ai && next.sync === last.sync && next.api === last.api) {
          return prev; // no visible change → skip render
        }
        last = next;
        return next;
      });
    };
    const loop = setInterval(animate, 100);

    /* Each bar decays independently toward its own base range */
    const decayTimers: ReturnType<typeof setTimeout>[] = [];
    const scheduleDecay = (bar: "ai" | "sync" | "api") => {
      const delay = 1500 + Math.random() * 2500;
      const tid = setTimeout(() => {
        const range = getBarBase(bar);
        const base = range[0] + Math.random() * (range[1] - range[0]);
        barTargets.current[bar] = barTargets.current[bar] * 0.88 + base * 0.12;
        scheduleDecay(bar);
      }, delay);
      decayTimers.push(tid);
    };
    scheduleDecay("ai");
    scheduleDecay("sync");
    scheduleDecay("api");

    /* Expose function so feed can bump bars */
    barBumpFnRef.current = (prefix: string, type: LineType) => {
      const impact = getBarImpact(prefix, type);
      barTargets.current = {
        ai: Math.max(3, Math.min(99, barTargets.current.ai + impact.ai)),
        sync: Math.max(3, Math.min(99, barTargets.current.sync + impact.sync)),
        api: Math.max(3, Math.min(99, barTargets.current.api + impact.api)),
      };
    };

    return () => {
      clearInterval(loop);
      decayTimers.forEach(clearTimeout);
      barBumpFnRef.current = null;
    };
  }, [entered]);

  /* ── ONE merged 1s tick for all live counters (time, horizons, uptime) ──
     Previously 4 separate setInterval(…, 1000) effects each triggered a full
     re-render of this large component — now a single interval updates all of
     them in one batched render (≈1 render/sec instead of ≈4). */
  const horizonStartRef = useRef(Date.now() - 1000 * 60 * 60 * 2.4 - 1000 * 47); // ~2h 47m ago
  const horizonStart2Ref = useRef(Date.now() - 1000 * 60 * 47);
  const [clockState, setClockState] = useState(() => ({
    time: "",
    horizonElapsed: "",
    horizonElapsed2: "",
    uptime: 0,
  }));

  useEffect(() => {
    const fmtElapsed = (from: number) => {
      const diff = Math.floor((Date.now() - from) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    };
    const tick = () => {
      const now = new Date();
      setClockState((prev) => ({
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
        horizonElapsed: fmtElapsed(horizonStartRef.current),
        horizonElapsed2: fmtElapsed(horizonStart2Ref.current),
        uptime: prev.uptime + 1,
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { time, horizonElapsed, horizonElapsed2, uptime } = clockState;
  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  /* ═══════════════════════════════════════
     LIVE OPERATIONS — real data from /api/workspace/live-ops
     Polls every 10s for active users (clocked-in TimeEntries) and
     recently-active projects. The "time" state already drives a 1s
     re-render, so the per-user elapsed display updates naturally.
     ═══════════════════════════════════════ */
  type LiveProject = {
    projectId: string;
    name: string;
    progress: number;
    status: string;
    activeUserCount: number;
    isActive: boolean;
  };

  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [liveProjects, setLiveProjects] = useState<LiveProject[]>([]);
  /* Direct active-session check — do not rely only on live-ops (can lag/fail) */
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchBootstrap = async () => {
      try {
        const res = await fetch("/api/bootstrap/workspace", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setLiveUsers(Array.isArray(data.activeUsers) ? data.activeUsers : []);
        setLiveProjects(Array.isArray(data.liveProjects) ? data.liveProjects : []);
        setHasActiveSession(Boolean(data.hasActiveSession));
      } catch {
        /* silent — keep last known state */
      }
    };
    fetchBootstrap();
    const id = setInterval(fetchBootstrap, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  /* Whether the currently-logged-in user is clocked in */
  const currentUserId = session?.user?.id;

  const currentUserIsLive = Boolean(
    (currentUserId && liveUsers.some((u) => u.userId === currentUserId)) ||
      hasActiveSession
  );

   /* ── START handler ──
     If the user is clocked in (has an active TimeEntry / appears in
     liveUsers), open Codex Workspace (app when installed). Otherwise,
     send them to the time-tracking page so they can clock in first. */
  const handleStart = useCallback(() => {
    if (currentUserIsLive) {
      openCodexApp((app) => {
        toast.error(
          app === "chatgpt" ? "ChatGPT app is not installed" : "Codex app is not installed",
          {
            description: "Please install it first, then try again.",
          }
        );
      });
    } else {
      router.push("/dashboard/time-tracking?action=start");
    }
  }, [currentUserIsLive, router]);

  const handleResearchGpt = useCallback(() => {
    if (currentUserIsLive) {
      openResearchGpt();
    } else {
      router.push("/dashboard/time-tracking?action=start");
    }
  }, [currentUserIsLive, router]);

  const handleQwenResearch = useCallback(() => {
    if (currentUserIsLive) {
      openQwenWorkspace();
    } else {
      router.push("/dashboard/time-tracking?action=start");
    }
  }, [currentUserIsLive, router]);

  const handleClockOut = useCallback(() => {
    router.push("/dashboard/time-tracking?action=clockout");
  }, [router]);

  /* ── Bar positions for smooth reordering (absolute positioning) ── */
  const statusBarsRef = useRef<HTMLDivElement>(null);
  const [barStep, setBarStep] = useState(28); // px — will be measured

  /* Measure actual item spacing after mount */
  useEffect(() => {
    if (!entered || !statusBarsRef.current) return;
    const items = statusBarsRef.current.querySelectorAll('.ws-status-bar-item');
    if (items.length >= 2) {
      const r0 = items[0].getBoundingClientRect();
      const r1 = items[1].getBoundingClientRect();
      setBarStep(Math.round(r1.top - r0.top));
    }
  }, [entered]);

  const barPositions = useMemo(() => {
    const entries = [
      { key: "ai" as const, value: barValues.ai },
      { key: "sync" as const, value: barValues.sync },
      { key: "api" as const, value: barValues.api },
    ];
    const sorted = [...entries].sort((a, b) => b.value - a.value);
    const pos: Record<string, number> = {};
    sorted.forEach((e, i) => { pos[e.key] = i * barStep; });
    return pos;
  }, [barValues, barStep]);

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
                <span>{agentTitle}</span>
              </div>
            </div>
            <div className="ws-header-right">
              <DeepSeekPricingBadge state={deepSeekState} variant="standard" />
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
                  {currentUserIsLive && (
                    <span
                      className="ws-live-user-dot ws-live-user-dot--lg"
                      aria-label="You are clocked in"
                      title="You are clocked in"
                    />
                  )}
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
                    type="button"
                    onClick={handleStart}
                    className={`ws-btn-primary ws-btn-primary--${mode}${currentUserIsLive ? "" : " ws-btn-clockin"}`}
                    aria-label={currentUserIsLive ? "Codex Workspace — open Codex" : "Start session — clock in first"}
                    title={currentUserIsLive ? "Codex Workspace" : "Start Session — clock in first"}
                  >
                    {currentUserIsLive ? (
                      <Zap size={16} strokeWidth={2.5} />
                    ) : (
                      <Clock size={16} strokeWidth={2.5} />
                    )}
                    <span>{currentUserIsLive ? "Codex Workspace" : "Start Session"}</span>
                    <ArrowUpRight size={14} />
                  </button>
                  {status === "authenticated" && currentUserIsLive && (
                    <button
                      type="button"
                      onClick={handleResearchGpt}
                      className={`ws-btn-primary ws-btn-primary--${mode}`}
                      aria-label="Research GPT — login to ChatGPT"
                      title="Research GPT"
                    >
                      <Zap size={16} strokeWidth={2.5} />
                      <span>Research GPT</span>
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                  {status === "authenticated" && currentUserIsLive && (
                    <button
                      type="button"
                      onClick={handleQwenResearch}
                      className={`ws-btn-primary ws-btn-primary--${mode}`}
                      aria-label="QWEN workspace — open Qwen"
                      title="QWEN workspace"
                    >
                      <Zap size={16} strokeWidth={2.5} />
                      <span>QWEN workspace</span>
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                  <button
                    onClick={handleCredentials}
                    className={`ws-btn-ghost ws-btn-ghost--${mode}`}
                    type="button"
                    aria-label="Go to Access Hub"
                  >
                    <KeyRound size={15} />
                    <span>Access Hub</span>
                  </button>
                </div>
                {currentUserIsLive && (
                  <div className="ws-clockout-row">
                    <DeepSeekPricingBadge state={deepSeekState} variant="compact" />
                    <button
                      type="button"
                      onClick={handleClockOut}
                      className={`ws-btn-clockout ws-btn-clockout--${mode}`}
                      aria-label="Clock out of your active session"
                      title="Clock Out"
                    >
                      <StopCircle size={15} strokeWidth={2.5} />
                      <span>Clock Out</span>
                    </button>
                    <p className={`ws-clockout-hint ws-clockout-hint--${mode}`}>
                      Only you see this while clocked in
                    </p>
                  </div>
                )}
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

            {/* STAT CARD — Autonomous Mode */}
            <div
              className={`ws-card ws-stat-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.2s" }}
            >
              <div className="ws-stat-icon-wrap ws-stat-icon-wrap--cyan">
                <Clock size={18} />
              </div>
              <div className="ws-stat-body">
                <span className={`ws-stat-label ws-stat-label--${mode}`}>
                  Fully Autonomous
                </span>
                <span className={`ws-stat-value ws-stat-value--${mode}`}>
                  Long Horizon
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

            <LiveIntensity
              liveUsers={liveUsers}
              mode={mode}
              entered={entered}
              onActivityLine={handleActivityLine}
            />

            {/* ─── ROW 4: Status bars (right after Live Ops) ─── */}

            {/* STATUS INDICATOR CARD — hidden while the live GPU monitor streams */}
            {!gpuLive && (
              <div
                className={`ws-card ws-status-card ${entered ? "ws-in" : ""}`}
                style={{ transitionDelay: "0.38s" }}
              >
                <div className="ws-status-row">
                  <div className={`ws-status-dot ws-status-dot--${mode}`} />
                  <span className={`ws-status-text ws-status-text--${mode}`}>
                    All Systems Operational
                  </span>
                </div>
                <div ref={statusBarsRef} className="ws-status-bars" style={{ height: barStep * 3 }}>
                  <div className="ws-status-bar-item" style={{ top: `${barPositions.ai}px` }}>
                    <span className={`ws-bar-label ws-bar-label--${mode}`}>AI</span>
                    <div className={`ws-bar-track ws-bar-track--${mode}`}>
                      <div className="ws-bar-fill ws-bar-fill--cyan" style={{ width: `${barValues.ai}%` }} />
                    </div>
                    <span className={`ws-bar-pct ws-bar-pct--cyan`}>{barValues.ai}%</span>
                  </div>
                  <div className="ws-status-bar-item" style={{ top: `${barPositions.sync}px` }}>
                    <span className={`ws-bar-label ws-bar-label--${mode}`}>Sync</span>
                    <div className={`ws-bar-track ws-bar-track--${mode}`}>
                      <div className="ws-bar-fill ws-bar-fill--purple" style={{ width: `${barValues.sync}%` }} />
                    </div>
                    <span className={`ws-bar-pct ws-bar-pct--purple`}>{barValues.sync}%</span>
                  </div>
                  <div className="ws-status-bar-item" style={{ top: `${barPositions.api}px` }}>
                    <span className={`ws-bar-label ws-bar-label--${mode}`}>API</span>
                    <div className={`ws-bar-track ws-bar-track--${mode}`}>
                      <div className="ws-bar-fill ws-bar-fill--pink" style={{ width: `${barValues.api}%` }} />
                    </div>
                    <span className={`ws-bar-pct ws-bar-pct--pink`}>{barValues.api}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── TRISHUL CLOUD PROCESS — GPU & performance live monitor ─── */}
            <GpuLiveCard
              entered={entered}
              style={{ transitionDelay: "0.385s" }}
              onLiveChange={handleGpuLiveChange}
            />

            {/* ─── LONG HORIZON CARD ─── */}
            <div
              className={`ws-card ws-horizon-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.39s" }}
            >
              <div className="ws-horizon-header">
                <div className="ws-horizon-title-row">
                  <Clock size={13} className={`ws-horizon-icon ws-horizon-icon--${mode}`} />
                  <h3 className={`ws-horizon-heading ws-horizon-heading--${mode}`}>
                    Long Horizon · Fully Autonomous
                  </h3>
                </div>
                <span className={`ws-horizon-count ws-horizon-count--${mode}`}>
                  {liveProjects.length} {liveProjects.length === 1 ? "project" : "projects"}
                </span>
              </div>
              <div className="ws-horizon-list">
                {liveProjects.length === 0 ? (
                  <div className="ws-horizon-task ws-horizon-task--empty">
                    <span className={`ws-horizon-task-name ws-horizon-task-name--${mode} ws-feed-msg--idle`}>
                      No active projects
                    </span>
                  </div>
                ) : (
                  liveProjects.map((p) => (
                    <div className="ws-horizon-task" key={p.projectId}>
                      <div className="ws-horizon-task-top">
                        <span className={`ws-horizon-task-name ws-horizon-task-name--${mode}`}>
                          {p.name}
                        </span>
                      </div>
                      <div className="ws-horizon-task-meta">
                        <span
                          className={`ws-horizon-badge ${
                            p.isActive ? "" : "ws-horizon-badge--paused"
                          }`}
                        >
                          {p.isActive ? "RUNNING" : "PAUSED"}
                        </span>
                        {p.isActive && (
                          <span className={`ws-horizon-progress-label ws-horizon-progress-label--${mode}`}>
                            {p.activeUserCount} {p.activeUserCount === 1 ? "user" : "users"} active
                          </span>
                        )}
                      </div>
                      <HorizonProgressBar
                        progress={p.progress}
                        isActive={p.isActive}
                        mode={mode}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ─── ROW 5: Actions + Features ─── */}

            {/* START CARD */}
            <div
              className={`ws-card ws-start-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.4s" }}
            >
              <button
                type="button"
                onClick={handleStart}
                className="ws-start-card-inner"
                aria-label={currentUserIsLive ? "Codex Workspace — open Codex" : "Start your session — clock in first"}
                title={currentUserIsLive ? "Codex Workspace" : "Clock in first"}
              >
                <div className="ws-start-left">
                  <div className={`ws-start-icon-box ws-start-icon-box--${mode}`}>
                    {currentUserIsLive ? <Zap size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <h3 className={`ws-start-heading ws-start-heading--${mode}`}>
                      {currentUserIsLive ? "Codex Workspace" : "Start Session"}
                    </h3>
                    <p className={`ws-start-sub ws-start-sub--${mode}`}>
                      {currentUserIsLive
                        ? "Open Codex Workspace"
                        : "Clock in to begin working"}
                    </p>
                  </div>
                </div>
                <div className={`ws-start-badge ws-start-badge--${mode}`}>
                  <span>{currentUserIsLive ? "Open" : "Clock In"}</span>
                  <ArrowUpRight size={14} />
                </div>
              </button>
              {status === "authenticated" && currentUserIsLive && (
                <button
                  type="button"
                  onClick={handleResearchGpt}
                  className="ws-start-card-inner"
                  style={{ marginTop: "0.5rem", borderTop: "1px solid color-mix(in oklch, var(--border) 80%, transparent)" }}
                  aria-label="Research GPT — login to ChatGPT"
                  title="Research GPT"
                >
                  <div className="ws-start-left">
                    <div className={`ws-start-icon-box ws-start-icon-box--${mode}`}>
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className={`ws-start-heading ws-start-heading--${mode}`}>
                        Research GPT
                      </h3>
                      <p className={`ws-start-sub ws-start-sub--${mode}`}>
                        Login to ChatGPT in a new tab
                      </p>
                    </div>
                  </div>
                  <div className={`ws-start-badge ws-start-badge--${mode}`}>
                    <span>Open</span>
                    <ArrowUpRight size={14} />
                  </div>
                </button>
              )}
              {status === "authenticated" && currentUserIsLive && (
                <button
                  type="button"
                  onClick={handleQwenResearch}
                  className="ws-start-card-inner"
                  style={{ marginTop: "0.5rem", borderTop: "1px solid color-mix(in oklch, var(--border) 80%, transparent)" }}
                  aria-label="QWEN workspace — open Qwen"
                  title="QWEN workspace"
                >
                  <div className="ws-start-left">
                    <div className={`ws-start-icon-box ws-start-icon-box--${mode}`}>
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className={`ws-start-heading ws-start-heading--${mode}`}>
                        QWEN workspace
                      </h3>
                      <p className={`ws-start-sub ws-start-sub--${mode}`}>
                        Open QWEN workspace
                      </p>
                    </div>
                  </div>
                  <div className={`ws-start-badge ws-start-badge--${mode}`}>
                    <span>Open</span>
                    <ArrowUpRight size={14} />
                  </div>
                </button>
              )}
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
                      Access Hub
                    </h3>
                    <p className={`ws-cred-sub ws-cred-sub--${mode}`}>
                      View credentials in Access Hub
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
                  <span>Autonomous</span>
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
              {agentTitle}
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
          touch-action: pan-y;
          margin: -0.75rem;
          background: var(--ws-bg);
          font-family: var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif;
          color: var(--ws-text);
          --ws-ease: cubic-bezier(0.16, 1, 0.3, 1);
          --ws-glass-blur: 0px;
          --ws-glass-sat: 1;
          --ws-glass-bright: 1;
          --ws-bg: oklch(0.16 0.012 255);
          --ws-text: oklch(0.95 0.005 240);
          --ws-text-muted: oklch(0.7 0.012 240);
          --ws-text-dim: oklch(0.55 0.01 240);
          --ws-card-bg: oklch(0.2 0.012 255);
          --ws-card-bg-mid: oklch(0.2 0.012 255);
          --ws-card-border: oklch(0.3 0.012 255);
          --ws-card-hover: oklch(0.24 0.012 255);
          --ws-card-border-hover: oklch(0.72 0.09 170);
          --ws-specular: transparent;
          --ws-rim-dark: transparent;
          --ws-glass-tint: transparent;
          --ws-shadow-outer: 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.18);
          --ws-shadow-outer-hover: 0 2px 6px rgba(0,0,0,0.25), 0 12px 24px rgba(0,0,0,0.22);
          --ws-accent-cyan: #06b6d4;
          --ws-accent-purple: #22d3ee;
          --ws-accent-pink: #67e8f9;
          --ws-accent-green: #22c55e;
          --ws-accent-cyan-dim: rgba(6,182,212,0.14);
          --ws-accent-purple-dim: rgba(34,211,238,0.14);
          --ws-accent-pink-dim: rgba(103,232,249,0.14);
        }
        @media (min-width: 480px) {
          .ws-root { margin: -1.25rem; }
        }
        @media (min-width: 768px) {
          .ws-root { margin: -2rem; }
        }

        .ws-root--light {
          background: var(--ws-bg);
          --ws-bg: oklch(0.975 0.004 220);
          --ws-text: oklch(0.21 0.02 255);
          --ws-text-muted: oklch(0.52 0.02 255);
          --ws-text-dim: oklch(0.65 0.015 255);
          --ws-card-bg: oklch(1 0 0);
          --ws-card-bg-mid: oklch(1 0 0);
          --ws-card-border: oklch(0.9 0.008 220);
          --ws-card-hover: oklch(0.955 0.006 220);
          --ws-card-border-hover: oklch(0.48 0.11 170);
          --ws-specular: transparent;
          --ws-rim-dark: transparent;
          --ws-glass-tint: transparent;
          --ws-glass-blur: 0px;
          --ws-glass-sat: 1;
          --ws-glass-bright: 1;
          --ws-shadow-outer: 0 1px 2px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.06);
          --ws-shadow-outer-hover: 0 2px 6px rgba(15,23,42,0.07), 0 12px 24px rgba(15,23,42,0.08);
          --ws-accent-green: #16a34a;
        }
        .ws-root--bluelight {
          background: var(--ws-bg);
          --ws-bg: oklch(0.97 0.01 85);
          --ws-text: oklch(0.29 0.02 60);
          --ws-text-muted: oklch(0.5 0.015 65);
          --ws-text-dim: oklch(0.62 0.012 65);
          --ws-card-bg: oklch(0.995 0.006 85);
          --ws-card-bg-mid: oklch(0.995 0.006 85);
          --ws-card-border: oklch(0.88 0.012 80);
          --ws-card-hover: oklch(0.95 0.01 82);
          --ws-card-border-hover: oklch(0.46 0.08 160);
          --ws-specular: transparent;
          --ws-rim-dark: transparent;
          --ws-glass-tint: transparent;
          --ws-glass-blur: 0px;
          --ws-glass-sat: 1;
          --ws-glass-bright: 1;
          --ws-shadow-outer: 0 1px 2px rgba(42,36,28,0.05), 0 4px 12px rgba(42,36,28,0.06);
          --ws-shadow-outer-hover: 0 2px 6px rgba(42,36,28,0.07), 0 12px 24px rgba(42,36,28,0.08);
          --ws-accent-cyan: #0e7490;
          --ws-accent-purple: #0891b2;
          --ws-accent-pink: #06b6d4;
          --ws-accent-green: #15803d;
          --ws-accent-cyan-dim: rgba(14,116,144,0.12);
          --ws-accent-purple-dim: rgba(8,145,178,0.12);
          --ws-accent-pink-dim: rgba(6,182,212,0.12);
        }

        /* ═══════════════════════════════════════
           AMBIENT BACKGROUND
           ═══════════════════════════════════════ */
        .ws-glow {
          position: fixed;
          inset: 0; z-index: 0;
          pointer-events: none;
          background: radial-gradient(
            720px circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(6,182,212,0.09), transparent 62%
          );
          opacity: 0;
          transition: opacity 0.45s var(--ws-ease);
        }
        .ws-root:hover .ws-glow { opacity: 1; }
        .ws-root--light .ws-glow {
          background: radial-gradient(720px circle at var(--glow-x,50%) var(--glow-y,50%), rgba(6,182,212,0.10), transparent 62%);
        }
        .ws-root--bluelight .ws-glow {
          background: radial-gradient(720px circle at var(--glow-x,50%) var(--glow-y,50%), rgba(14,116,144,0.10), transparent 62%);
        }

        .ws-orbs {
          position: fixed; inset: 0; z-index: 0;
          pointer-events: none; overflow: hidden;
        }
        .ws-orb {
          position: absolute; border-radius: 50%;
          filter: blur(72px);
          contain: layout style;
        }
        .ws-orb--1 {
          width: 480px; height: 480px;
          top: -15%; right: -5%;
          background: rgba(6,182,212,0.09);
          animation: ws-drift-1 25s ease-in-out infinite;
        }
        @media (max-width: 639px) {
          .ws-orb--1 { width: 280px; height: 280px; }
          .ws-orb--2 { width: 230px; height: 230px; }
          .ws-orb--3 { width: 180px; height: 180px; }
        }
        .ws-orb--2 {
          width: 380px; height: 380px;
          bottom: -10%; left: -5%;
          background: rgba(14,116,144,0.07);
          animation: ws-drift-2 30s ease-in-out infinite;
        }
        .ws-orb--3 {
          width: 280px; height: 280px;
          top: 40%; left: 40%;
          background: rgba(34,211,238,0.05);
          animation: ws-drift-3 35s ease-in-out infinite;
        }
        .ws-root--light .ws-orb--1 { background: rgba(6,182,212,0.07); }
        .ws-root--light .ws-orb--2 { background: rgba(8,145,178,0.05); }
        .ws-root--light .ws-orb--3 { background: rgba(34,211,238,0.04); }
        .ws-root--bluelight .ws-orb--1 { background: rgba(14,116,144,0.07); }
        .ws-root--bluelight .ws-orb--2 { background: rgba(8,145,178,0.05); }
        .ws-root--bluelight .ws-orb--3 { background: rgba(6,182,212,0.04); }

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
          background-image: radial-gradient(circle, rgba(42,36,28,0.035) 1px, transparent 1px);
        }

        .ws-noise {
          position: fixed; inset: 0; z-index: 1;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 200px;
          opacity: 0.028;
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
          transform: translateY(0);
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
          padding: 0.35rem 0.8rem;
          border-radius: 100px;
          color: var(--ws-text-muted);
          max-width: 220px;
          overflow: hidden;
          background: var(--ws-card-bg-mid);
          border: 1px solid var(--ws-card-border);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          box-shadow: none;
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
          background: #15803d;
          box-shadow: 0 0 8px rgba(21,128,61,0.35);
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
          padding: 0.28rem 0.65rem;
          border-radius: 999px;
          background: var(--ws-card-bg-mid);
          border: 1px solid var(--ws-card-border);
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .ws-time {
          font-size: 0.75rem; font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--ws-text-dim);
          letter-spacing: 0.02em;
          padding: 0.28rem 0.65rem;
          border-radius: 999px;
          background: var(--ws-card-bg-mid);
          border: 1px solid var(--ws-card-border);
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
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
          isolation: isolate;
          border-radius: 0.75rem;
          overflow: hidden;
          opacity: 0;
          transform: translateY(16px);
          color: inherit;
          background: var(--ws-card-bg);
          border: 1px solid var(--ws-card-border);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          box-shadow: var(--ws-shadow-outer);
          transition:
            opacity 0.6s var(--ws-ease),
            transform 0.55s var(--ws-ease),
            border-color 0.4s var(--ws-ease),
            box-shadow 0.45s var(--ws-ease),
            background 0.45s var(--ws-ease),
            filter 0.45s var(--ws-ease);
        }
        .ws-card::before {
          content: none;
        }
        .ws-card::after {
          content: none;
        }
        .ws-card.ws-in:hover {
          border-color: var(--ws-card-border-hover);
          transform: translateY(-2px);
          box-shadow: var(--ws-shadow-outer-hover);
        }
        .ws-card.ws-in:hover::before { opacity: 0.92; }
        .ws-card:focus-within {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--ws-accent-cyan) 45%, transparent), var(--ws-shadow-outer);
        }
        .ws-hero-content,
        .ws-stat-card > *,
        .ws-status-card > *,
        .ws-horizon-header,
        .ws-horizon-list,
        .ws-start-card-inner,
        .ws-cred-card-inner,
        .ws-features-card > *,
        .ws-feed-header,
        .ws-feed-body {
          position: relative;
          z-index: 2;
        }
        .ws-hero-glow,
        .ws-hero-rings,
        .ws-start-accent,
        .ws-cred-gradient-line {
          z-index: 0;
        }

        /* ═══════════════════════════════════════
           HERO CARD
           ═══════════════════════════════════════ */
        .ws-hero-card {
          grid-column: 1 / -1;
          padding: 1.5rem 1.25rem 1.25rem;
          display: flex; align-items: flex-start; justify-content: space-between;
          min-height: 160px;
          border-radius: 0.875rem;
          --ws-glass-blur: 0px;
          --ws-glass-sat: 1;
          background: var(--ws-card-bg);
          box-shadow: var(--ws-shadow-outer-hover);
        }
        .ws-root--light .ws-hero-card {
          box-shadow: var(--ws-shadow-outer-hover);
        }
        .ws-root--bluelight .ws-hero-card {
          box-shadow: var(--ws-shadow-outer-hover);
        }
        .ws-hero-card.ws-in:hover {
          transform: translateY(-3px);
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
          width: 300px; height: 300px;
          border-radius: 50%;
          filter: blur(72px);
          pointer-events: none; z-index: 0;
          opacity: 0.95;
        }
        .ws-hero-glow--dark {
          background: radial-gradient(circle, rgba(6,182,212,0.18), rgba(34,211,238,0.06) 45%, transparent 72%);
        }
        .ws-hero-glow--light,
        .ws-hero-glow--bluelight {
          background: radial-gradient(circle, rgba(14,116,144,0.14), rgba(6,182,212,0.05) 45%, transparent 72%);
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
          color: var(--ws-text);
          background: none;
          -webkit-background-clip: initial; background-clip: initial;
        }
        .ws-hero-title--light {
          color: var(--ws-text);
          background: none;
          -webkit-background-clip: initial; background-clip: initial;
        }
        .ws-hero-title--bluelight {
          color: var(--ws-text);
          background: none;
          -webkit-background-clip: initial; background-clip: initial;
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
        .ws-tagline--bluelight { color: rgba(42,36,28,0.40); font-size: 0.85rem; font-style: italic; letter-spacing: 0.01em; }

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

        .ws-clockout-row {
          margin-top: 0.85rem;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.35rem;
        }
        .ws-btn-clockout {
          display: inline-flex; align-items: center; gap: 0.45rem;
          padding: 0.55rem 1.15rem;
          border-radius: 0.5rem;
          font-family: inherit;
          font-size: 0.78rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          cursor: pointer;
          position: relative;
          isolation: isolate;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          transition: transform 0.35s var(--ws-ease), box-shadow 0.35s var(--ws-ease), background 0.35s var(--ws-ease), border-color 0.35s var(--ws-ease);
        }
        .ws-btn-clockout--dark {
          background: var(--destructive);
          color: var(--destructive-foreground);
          border: 1px solid var(--destructive);
          box-shadow: 0 1px 2px color-mix(in oklch, var(--destructive) 24%, transparent);
        }
        .ws-btn-clockout--light,
        .ws-btn-clockout--bluelight {
          background: var(--destructive);
          color: var(--destructive-foreground);
          border: 1px solid var(--destructive);
          box-shadow: 0 1px 2px color-mix(in oklch, var(--destructive) 24%, transparent);
        }
        .ws-btn-clockout:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 6px color-mix(in oklch, var(--destructive) 30%, transparent);
        }
        .ws-btn-clockout:active {
          transform: translateY(1px) scale(0.985);
        }
        .ws-btn-clockout:focus-visible {
          outline: 2px solid rgba(248,113,113,0.55);
          outline-offset: 2px;
        }
        .ws-clockout-hint {
          font-size: 0.65rem;
          margin: 0;
        }
        .ws-clockout-hint--dark { color: var(--ws-text-dim); }
        .ws-clockout-hint--light,
        .ws-clockout-hint--bluelight { color: rgba(42,36,28,0.40); }

        .ws-btn-primary {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.62rem 1.3rem;
          border-radius: 0.5rem;
          font-family: inherit;
          font-size: 0.8rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer;
          position: relative;
          isolation: isolate;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          transition: transform 0.4s var(--ws-ease), box-shadow 0.4s var(--ws-ease), background 0.35s var(--ws-ease), border-color 0.35s var(--ws-ease);
        }
        .ws-btn-primary--dark {
          background: var(--primary);
          color: var(--primary-foreground);
          border: 1px solid var(--primary);
          box-shadow: 0 1px 2px color-mix(in oklch, var(--primary) 24%, transparent);
        }
        .ws-btn-primary--dark:hover {
          background: color-mix(in oklch, var(--primary) 90%, black);
          border-color: var(--primary);
          box-shadow: 0 2px 6px color-mix(in oklch, var(--primary) 28%, transparent);
          transform: translateY(-2px);
        }
        .ws-btn-primary--light {
          background: var(--primary);
          color: var(--primary-foreground);
          border: 1px solid var(--primary);
          box-shadow: 0 1px 2px color-mix(in oklch, var(--primary) 24%, transparent);
        }
        .ws-btn-primary--light:hover {
          background: color-mix(in oklch, var(--primary) 90%, black);
          border-color: var(--primary);
          box-shadow: 0 2px 6px color-mix(in oklch, var(--primary) 28%, transparent);
          transform: translateY(-2px);
        }
        .ws-btn-primary--bluelight {
          background: var(--primary);
          color: var(--primary-foreground);
          border: 1px solid var(--primary);
          box-shadow: 0 1px 2px color-mix(in oklch, var(--primary) 24%, transparent);
        }
        .ws-btn-primary--bluelight:hover {
          background: color-mix(in oklch, var(--primary) 90%, black);
          border-color: var(--primary);
          box-shadow: 0 2px 6px color-mix(in oklch, var(--primary) 28%, transparent);
          transform: translateY(-2px);
        }
        .ws-btn-clockin {
          background:
            linear-gradient(155deg, rgba(255,255,255,0.28), transparent 42%),
            color-mix(in oklch, oklch(0.68 0.14 155) 22%, transparent) !important;
          color: #34d399 !important;
          border-color: color-mix(in oklch, oklch(0.68 0.14 155) 42%, transparent) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.32),
            0 10px 26px color-mix(in oklch, oklch(0.68 0.14 155) 18%, transparent) !important;
        }
        .ws-root--light .ws-btn-clockin,
        .ws-root--bluelight .ws-btn-clockin {
          color: #047857 !important;
          background:
            linear-gradient(155deg, rgba(255,255,255,0.78), transparent 45%),
            color-mix(in oklch, oklch(0.62 0.14 155) 16%, transparent) !important;
        }
        .ws-btn-clockin:hover {
          transform: translateY(-2px);
        }
        .ws-btn-primary:active {
          transform: translateY(1px) scale(0.985);
        }
        .ws-btn-primary:focus-visible {
          outline: 2px solid color-mix(in oklch, var(--primary) 55%, transparent);
          outline-offset: 2px;
        }

        .ws-btn-ghost {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.6rem 1.05rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 75%, transparent);
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--ws-specular) 35%, transparent), transparent 45%),
            color-mix(in srgb, var(--ws-card-bg) 55%, transparent);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          font-family: inherit;
          font-size: 0.8rem; font-weight: 500;
          cursor: pointer;
          color: var(--ws-text-muted);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 45%, transparent),
            0 6px 16px rgba(0,0,0,0.08);
          transition: transform 0.4s var(--ws-ease), box-shadow 0.4s var(--ws-ease), background 0.35s var(--ws-ease), border-color 0.35s var(--ws-ease), color 0.35s var(--ws-ease);
        }
        .ws-btn-ghost:hover {
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--ws-specular) 55%, transparent), transparent 45%),
            var(--ws-card-hover);
          border-color: var(--ws-card-border-hover);
          color: var(--ws-text);
          transform: translateY(-2px);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 60%, transparent),
            0 10px 22px rgba(0,0,0,0.12);
        }
        .ws-btn-ghost:active {
          transform: translateY(1px) scale(0.985);
        }
        .ws-btn-ghost:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--ws-accent-cyan) 50%, transparent);
          outline-offset: 2px;
        }

        .ws-hero-rings {
          position: absolute;
          right: 1rem; top: 50%;
          transform: translateY(-50%);
          width: 150px; height: 150px;
          opacity: 0.42;
          color: var(--ws-accent-cyan);
          filter: blur(0.2px) saturate(1.1);
          mask-image: linear-gradient(90deg, transparent 0%, black 25%, black 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 25%, black 100%);
          animation: ws-ring-rotate 40s linear infinite;
        }
        .ws-hero-rings--bluelight { color: #0e7490; }
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
          border-radius: 20px;
        }
        .ws-stat-icon-wrap {
          width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px; flex-shrink: 0;
          transition: transform 0.4s var(--ws-ease), box-shadow 0.4s var(--ws-ease);
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 70%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 50%, transparent),
            inset 0 -1px 0 color-mix(in srgb, var(--ws-rim-dark) 25%, transparent),
            0 4px 12px rgba(0,0,0,0.08);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .ws-stat-card:hover .ws-stat-icon-wrap {
          transform: translateY(-1px) scale(1.04);
        }
        .ws-stat-icon-wrap--cyan {
          background:
            linear-gradient(155deg, color-mix(in srgb, var(--ws-specular) 35%, transparent), transparent 50%),
            var(--ws-accent-cyan-dim);
          color: var(--ws-accent-cyan);
        }
        .ws-stat-icon-wrap--purple {
          background:
            linear-gradient(155deg, color-mix(in srgb, var(--ws-specular) 35%, transparent), transparent 50%),
            var(--ws-accent-purple-dim);
          color: var(--ws-accent-purple);
        }
        .ws-stat-icon-wrap--pink {
          background:
            linear-gradient(155deg, color-mix(in srgb, var(--ws-specular) 35%, transparent), transparent 50%),
            var(--ws-accent-pink-dim);
          color: var(--ws-accent-pink);
        }

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
          border-bottom: 1px solid color-mix(in srgb, var(--ws-card-border) 55%, transparent);
          background: linear-gradient(180deg, color-mix(in srgb, var(--ws-specular) 8%, transparent), transparent);
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
          padding: 0.22rem 0.55rem;
          border-radius: 999px;
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--ws-specular) 40%, transparent), transparent 50%),
            color-mix(in srgb, var(--ws-accent-green) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--ws-accent-green) 28%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 35%, transparent);
        }
        .ws-feed-live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--ws-accent-green);
          box-shadow: 0 0 6px var(--ws-accent-green);
          animation: ws-pulse 1.5s ease-in-out infinite;
        }

        /* Outer shell: pinned user/agent rows stay put; only .ws-feed-logs scrolls */
        .ws-feed-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 0.5rem 0;
          max-height: 220px;
          min-height: 100px;
          overflow: hidden;
        }
        .ws-feed-pinned { flex-shrink: 0; }
        .ws-feed-logs {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--ws-card-border) transparent;
        }
        .ws-feed-logs::-webkit-scrollbar { width: 4px; }
        .ws-feed-logs::-webkit-scrollbar-track { background: transparent; }
        .ws-feed-logs::-webkit-scrollbar-thumb {
          background: var(--ws-card-border); border-radius: 4px;
        }

        .ws-feed-line {
          display: flex; align-items: flex-start; gap: 0.4rem;
          flex-wrap: wrap;
          row-gap: 0.15rem;
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
        .ws-feed-prefix--warn { color: #f59e0b; }
        .ws-feed-prefix--idle { color: var(--ws-text-dim); }

        .ws-feed-msg {
          min-width: 0;
          flex: 1 1 8rem;
          color: var(--ws-text-muted);
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
        }
        @media (min-width: 768px) {
          .ws-feed-line { flex-wrap: nowrap; align-items: center; }
          .ws-feed-msg {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
        .ws-feed-check {
          color: var(--ws-accent-green);
          font-size: 0.7rem;
          flex-shrink: 0;
        }
        .ws-feed-warn {
          color: #f59e0b;
          font-size: 0.7rem;
          flex-shrink: 0;
          animation: ws-warn-pulse 2s ease-in-out infinite;
        }
        @keyframes ws-warn-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .ws-feed-idle {
          color: var(--ws-text-dim);
          font-size: 0.65rem;
          flex-shrink: 0;
          opacity: 0.6;
        }
        /* Dim the entire idle line slightly */
        .ws-feed-line:has(.ws-feed-idle) .ws-feed-msg {
          opacity: 0.5;
        }

        .ws-feed-line--cursor {
          padding: 0.15rem 1rem;
        }
        .ws-feed-blink {
          color: var(--ws-text-dim);
          font-size: 0.7rem;
          animation: ws-blink 1s step-end infinite;
        }

        /* Empty-state line for the Live Operations feed */
        .ws-feed-line--empty {
          padding: 0.6rem 1rem;
          justify-content: center;
          opacity: 0.85;
        }
        .ws-feed-msg--idle {
          font-style: italic;
          opacity: 0.65;
        }

        /* Red blinking dot — indicates a user is currently clocked in.
           Uses the existing @keyframes ws-blink (defined near .ws-cursor--blink). */
        .ws-live-user-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 6px #ef4444;
          animation: ws-blink 1s step-end infinite;
          margin-left: 4px;
          vertical-align: middle;
          flex-shrink: 0;
        }
        /* Larger variant used next to the user's name in the workspace header */
        .ws-live-user-dot--lg {
          width: 9px;
          height: 9px;
          margin-left: 8px;
          vertical-align: middle;
        }

        /* Long Horizon Card */
        .ws-horizon-card { padding: 0; grid-column: 1 / -1; }
        @media (min-width: 1024px) {
          .ws-horizon-card { grid-column: span 2; }
        }
        .ws-horizon-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.85rem 1rem 0.65rem;
          border-bottom: 1px solid color-mix(in srgb, var(--ws-card-border) 50%, transparent);
          background: linear-gradient(180deg, color-mix(in srgb, var(--ws-specular) 7%, transparent), transparent);
        }
        .ws-horizon-title-row {
          display: flex; align-items: center; gap: 0.45rem;
        }
        .ws-horizon-icon { color: var(--ws-accent-cyan); }
        .ws-horizon-heading {
          font-size: 0.72rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ws-text-dim);
        }
        .ws-horizon-count {
          font-size: 0.6rem; font-weight: 600;
          color: var(--ws-text-dim);
          letter-spacing: 0.04em;
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--ws-card-bg) 70%, transparent);
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 55%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 30%, transparent);
        }
        .ws-horizon-list { display: flex; flex-direction: column; }
        .ws-horizon-task {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid color-mix(in srgb, var(--ws-card-border) 40%, transparent);
          background: linear-gradient(90deg, color-mix(in srgb, var(--ws-glass-tint) 35%, transparent), transparent 55%);
          transition: background 0.35s var(--ws-ease);
        }
        .ws-horizon-task:hover {
          background: linear-gradient(90deg, color-mix(in srgb, var(--ws-glass-tint) 70%, transparent), transparent 70%);
        }
        .ws-horizon-task:last-child { border-bottom: none; }
        .ws-horizon-task-top {
          display: flex; align-items: center; gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .ws-horizon-task-prefix {
          font-size: 0.6rem; font-weight: 700;
          letter-spacing: 0.04em;
          font-family: 'SF Mono','Fira Code','Cascadia Code',monospace;
          color: #06b6d4;
          flex-shrink: 0;
        }
        .ws-root--bluelight .ws-horizon-task-prefix { color: #0e7490; }
        .ws-horizon-task-name {
          font-size: 0.78rem; font-weight: 500;
          color: var(--ws-text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ws-horizon-task-meta {
          display: flex; align-items: center; gap: 0.5rem;
          margin-bottom: 0.5rem;
          flex-wrap: wrap;
        }
        .ws-horizon-timer {
          font-size: 0.6rem; font-weight: 600;
          font-family: 'SF Mono','Fira Code','Cascadia Code',monospace;
          color: #06b6d4;
          letter-spacing: 0.02em;
        }
        .ws-root--bluelight .ws-horizon-timer { color: #0e7490; }
        .ws-root--light .ws-horizon-timer { color: #0891b2; }
        .ws-horizon-badge {
          font-size: 0.5rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #22c55e;
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--ws-specular) 35%, transparent), transparent 50%),
            rgba(34,197,94,0.12);
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid rgba(34,197,94,0.28);
          flex-shrink: 0;
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 30%, transparent);
          animation: ws-horizon-pulse 2s ease-in-out infinite;
        }
        /* PAUSED variant — gray, static (no pulse) for projects with no active users */
        .ws-horizon-badge--paused {
          color: var(--ws-text-dim);
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--ws-specular) 25%, transparent), transparent 50%),
            rgba(128,128,128,0.12);
          border-color: color-mix(in srgb, var(--ws-card-border) 70%, transparent);
          animation: none;
        }
        .ws-horizon-task--empty {
          padding: 1rem;
          justify-content: center;
          text-align: center;
        }
        @keyframes ws-horizon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .ws-horizon-progress-label {
          font-size: 0.58rem; font-weight: 500;
          color: var(--ws-text-dim);
          font-family: 'SF Mono','Fira Code','Cascadia Code',monospace;
          letter-spacing: 0.02em;
          margin-left: auto;
        }
        .ws-horizon-progress-block {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 0.55rem;
          width: 100%;
        }
        .ws-horizon-progress-pct {
          margin-left: 0;
          font-variant-numeric: tabular-nums;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--ws-text);
          min-width: 2.4rem;
          text-align: right;
        }
        .ws-horizon-progress-pct-sym {
          font-size: 0.58rem;
          font-weight: 600;
          opacity: 0.65;
          margin-left: 0.05rem;
        }
        .ws-horizon-progress-track {
          position: relative;
          width: 100%;
          height: 9px;
          border-radius: 100px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--ws-rim-dark) 12%, transparent), transparent 55%),
            color-mix(in srgb, var(--ws-card-border) 70%, transparent);
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 50%, transparent);
          box-shadow:
            inset 0 1px 2px rgba(0,0,0,0.16),
            inset 0 -1px 0 color-mix(in srgb, var(--ws-specular) 18%, transparent);
        }
        .ws-horizon-progress-track--running {
          background: color-mix(in oklch, var(--ws-card-border) 70%, rgba(6,182,212,0.18));
        }
        .ws-horizon-progress-segments {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent calc(10% - 1px),
            rgba(255,255,255,0.07) calc(10% - 1px),
            rgba(255,255,255,0.07) 10%
          );
          opacity: 0.55;
          z-index: 1;
        }
        .ws-root--light .ws-horizon-progress-segments,
        .ws-root--bluelight .ws-horizon-progress-segments {
          background: repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent calc(10% - 1px),
            rgba(0,0,0,0.06) calc(10% - 1px),
            rgba(0,0,0,0.06) 10%
          );
        }
        .ws-horizon-progress-fill {
          position: relative;
          height: 100%;
          border-radius: 100px;
          background: linear-gradient(90deg, #0e7490 0%, #06b6d4 55%, #22d3ee 100%);
          box-shadow: 0 0 10px rgba(6,182,212,0.25);
          will-change: width;
          z-index: 2;
          overflow: hidden;
        }
        .ws-horizon-progress-fill--running {
          background: linear-gradient(
            90deg,
            #0e7490 0%,
            #06b6d4 40%,
            #22d3ee 70%,
            #67e8f9 100%
          );
          background-size: 200% 100%;
          animation: ws-horizon-fill-flow 2.8s ease-in-out infinite;
        }
        .ws-horizon-progress-sheen {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            105deg,
            transparent 35%,
            rgba(255,255,255,0.45) 50%,
            transparent 65%
          );
          background-size: 220% 100%;
          animation: ws-horizon-sheen 1.8s ease-in-out infinite;
          pointer-events: none;
        }
        .ws-horizon-progress-edge {
          position: absolute;
          top: 0;
          right: 0;
          width: 6px;
          height: 100%;
          border-radius: 100px;
          background: rgba(255,255,255,0.75);
          box-shadow: 0 0 8px 2px rgba(34,211,238,0.55);
          pointer-events: none;
        }
        @keyframes ws-horizon-sheen {
          0% { background-position: 120% 0; }
          100% { background-position: -40% 0; }
        }
        @keyframes ws-horizon-fill-flow {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .ws-root--bluelight .ws-horizon-progress-fill,
        .ws-root--bluelight .ws-horizon-progress-fill--running {
          background: linear-gradient(90deg, #155e75 0%, #0e7490 50%, #0891b2 100%);
          box-shadow: 0 0 8px rgba(14,116,144,0.28);
        }
        .ws-root--light .ws-horizon-progress-fill,
        .ws-root--light .ws-horizon-progress-fill--running {
          background: linear-gradient(90deg, #0e7490 0%, #0891b2 55%, #06b6d4 100%);
          box-shadow: 0 0 8px rgba(8,145,178,0.22);
        }
        @media (prefers-reduced-motion: reduce) {
          .ws-horizon-progress-fill--running,
          .ws-horizon-progress-sheen {
            animation: none;
          }
          .ws-orb--1,
          .ws-orb--2,
          .ws-orb--3,
          .ws-pulse-dot,
          .ws-feed-live-dot,
          .ws-status-dot,
          .ws-cursor--blink,
          .ws-feed-blink,
          .ws-live-user-dot,
          .ws-hero-rings,
          .ws-horizon-badge:not(.ws-horizon-badge--paused),
          .ws-feed-warn {
            animation: none;
          }
          .ws-card,
          .ws-card.ws-in:hover,
          .ws-hero-card.ws-in:hover,
          .ws-btn-primary,
          .ws-btn-primary:hover,
          .ws-btn-primary:active,
          .ws-btn-ghost,
          .ws-btn-ghost:hover,
          .ws-btn-ghost:active,
          .ws-btn-clockout,
          .ws-btn-clockout:hover,
          .ws-btn-clockout:active,
          .ws-stat-card:hover .ws-stat-icon-wrap,
          .ws-feature-item:hover,
          .ws-start-card:hover .ws-start-badge,
          .ws-cred-card:hover .ws-cred-arrow-wrap {
            transition: none !important;
            transform: none !important;
          }
        }

        @media (max-width: 639px) {
          .ws-card {
            --ws-glass-blur: 18px;
            border-radius: 18px;
          }
          .ws-hero-card {
            --ws-glass-blur: 22px;
            border-radius: 22px;
          }
        }

        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .ws-card,
          .ws-btn-primary,
          .ws-btn-ghost,
          .ws-btn-clockout,
          .ws-header-badge {
            background-color: color-mix(in srgb, var(--ws-card-bg-mid) 88%, var(--ws-bg));
          }
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
          border-radius: 14px; flex-shrink: 0;
          transition: transform 0.4s var(--ws-ease), box-shadow 0.4s var(--ws-ease);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 45%, transparent),
            0 6px 14px rgba(0,0,0,0.08);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
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
          background: rgba(14,116,144,0.08);
          border: 1px solid rgba(14,116,144,0.14);
          color: #0e7490;
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
        .ws-start-heading--bluelight { color: rgba(42,36,28,0.85); }

        .ws-start-sub {
          font-size: 0.7rem; line-height: 1.3;
        }
        .ws-start-sub--dark { color: rgba(255,255,255,0.30); }
        .ws-start-sub--light { color: rgba(0,0,0,0.35); }
        .ws-start-sub--bluelight { color: rgba(42,36,28,0.40); }

        .ws-start-badge {
          display: flex; align-items: center; gap: 0.25rem;
          padding: 0.35rem 0.75rem;
          border-radius: 999px; flex-shrink: 0;
          font-size: 0.68rem; font-weight: 600;
          letter-spacing: 0.04em;
          transition: transform 0.4s var(--ws-ease), box-shadow 0.4s var(--ws-ease);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 35%, transparent);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
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
          background: rgba(14,116,144,0.08);
          border: 1px solid rgba(14,116,144,0.15);
          color: #0e7490;
        }
        .ws-start-card:hover .ws-start-badge {
          transform: translateY(-1px);
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
          border-radius: 14px; flex-shrink: 0;
          transition: transform 0.4s var(--ws-ease), box-shadow 0.4s var(--ws-ease);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 45%, transparent),
            0 6px 14px rgba(0,0,0,0.08);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
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
          background: rgba(124,58,237,0.08);
          border: 1px solid rgba(124,58,237,0.14);
          color: #7c3aed;
        }
        .ws-cred-card:hover .ws-cred-icon-box { transform: scale(1.05); }

        .ws-cred-heading {
          font-size: 0.85rem; font-weight: 600;
          margin-bottom: 0.15rem;
        }
        .ws-cred-heading--dark { color: rgba(255,255,255,0.85); }
        .ws-cred-heading--light { color: rgba(0,0,0,0.80); }
        .ws-cred-heading--bluelight { color: rgba(42,36,28,0.85); }

        .ws-cred-sub { font-size: 0.7rem; line-height: 1.3; }
        .ws-cred-sub--dark { color: rgba(255,255,255,0.30); }
        .ws-cred-sub--light { color: rgba(0,0,0,0.35); }
        .ws-cred-sub--bluelight { color: rgba(42,36,28,0.40); }

        .ws-cred-arrow-wrap {
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 999px; flex-shrink: 0;
          transition: transform 0.4s var(--ws-ease), background 0.35s var(--ws-ease), box-shadow 0.4s var(--ws-ease);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 30%, transparent);
        }
        .ws-cred-arrow-wrap--dark {
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.30);
        }
        .ws-cred-arrow-wrap--light {
          background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.30);
        }
        .ws-cred-arrow-wrap--bluelight {
          background: rgba(42,36,28,0.04); color: rgba(42,36,28,0.35);
        }
        .ws-cred-card:hover .ws-cred-arrow-wrap {
          background: var(--ws-card-hover);
          transform: translateY(-1px);
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
          padding: 0.48rem 0.58rem;
          border-radius: 12px;
          font-size: 0.68rem; font-weight: 500;
          color: var(--ws-text-muted);
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 65%, transparent);
          background:
            linear-gradient(155deg, color-mix(in srgb, var(--ws-specular) 28%, transparent), transparent 50%),
            color-mix(in srgb, var(--ws-card-bg) 40%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ws-specular) 25%, transparent);
          transition: transform 0.35s var(--ws-ease), background 0.35s var(--ws-ease), border-color 0.35s var(--ws-ease), color 0.35s var(--ws-ease);
        }
        .ws-feature-item:hover {
          background:
            linear-gradient(155deg, color-mix(in srgb, var(--ws-specular) 45%, transparent), transparent 50%),
            var(--ws-card-hover);
          border-color: var(--ws-card-border-hover);
          color: var(--ws-text);
          transform: translateY(-1px);
        }

        /* ═══════════════════════════════════════
           STATUS CARD
           ═══════════════════════════════════════ */
        .ws-status-card { padding: 1rem 1.1rem; grid-column: 1 / -1; }
        @media (min-width: 1024px) {
          .ws-status-card { grid-column: span 3; }
        }
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
          background: #15803d;
          box-shadow: 0 0 8px rgba(21,128,61,0.3);
        }
        .ws-status-text {
          font-size: 0.75rem; font-weight: 500;
          color: var(--ws-text-muted);
        }
        .ws-status-bars {
          position: relative;
        }
        .ws-status-bar-item {
          position: absolute;
          left: 0; right: 0;
          display: flex; align-items: center; gap: 0.45rem;
          transition: top 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-bar-label {
          font-size: 0.6rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ws-text-dim);
          width: 26px; flex-shrink: 0;
        }
        .ws-bar-track {
          flex: 1; height: 6px;
          border-radius: 100px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--ws-rim-dark) 10%, transparent), transparent 60%),
            color-mix(in srgb, var(--ws-card-border) 65%, transparent);
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 45%, transparent);
          box-shadow:
            inset 0 1px 2px rgba(0,0,0,0.14),
            inset 0 -1px 0 color-mix(in srgb, var(--ws-specular) 15%, transparent);
        }
        .ws-bar-fill {
          height: 100%; border-radius: 100px;
          transition: width 1s var(--ws-ease) 0.5s;
          width: 0;
          position: relative;
        }
        .ws-bar-fill::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,0.35), transparent 55%);
          pointer-events: none;
        }
        .ws-in .ws-bar-fill { width: inherit; }
        .ws-bar-fill--cyan { background: var(--ws-accent-cyan); box-shadow: 0 0 6px rgba(6,182,212,0.28); }
        .ws-bar-fill--purple { background: var(--ws-accent-purple); box-shadow: 0 0 6px rgba(34,211,238,0.24); }
        .ws-bar-fill--pink { background: var(--ws-accent-pink); box-shadow: 0 0 6px rgba(103,232,249,0.22); }
        .ws-bar-pct {
          font-size: 0.55rem; font-weight: 600;
          font-variant-numeric: tabular-nums;
          width: 2.2rem; text-align: right;
          flex-shrink: 0;
          color: var(--ws-text-dim);
        }
        .ws-bar-pct--cyan { color: rgba(6,182,212,0.65); }
        .ws-bar-pct--purple { color: rgba(139,92,246,0.65); }
        .ws-bar-pct--pink { color: rgba(236,72,153,0.65); }
        .ws-root--bluelight .ws-bar-pct--cyan { color: rgba(14,116,144,0.70); }
        .ws-root--bluelight .ws-bar-pct--purple { color: rgba(124,58,237,0.70); }
        .ws-root--bluelight .ws-bar-pct--pink { color: rgba(219,39,119,0.70); }

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

        /* ── Trishul Cloud Process — GPU & performance live monitor ── */
        .ws-gpu-card {
          padding: 1rem 1.1rem;
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        @media (min-width: 768px) {
          .ws-gpu-card { grid-column: 1 / -1; }
          .ws-gpu-body {
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
            gap: 0.75rem;
            align-items: start;
          }
          .ws-gpu-totals { height: 100%; }
        }
        @media (min-width: 1400px) {
          .ws-gpu-body {
            grid-template-columns: minmax(0, 1.6fr) minmax(0, 3.4fr);
          }
        }
        .ws-gpu-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .ws-gpu-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.1rem;
          height: 2.1rem;
          border-radius: 0.6rem;
          flex-shrink: 0;
          background: color-mix(in srgb, var(--ws-card-border) 55%, transparent);
          color: var(--ws-text-muted);
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 70%, transparent);
        }
        .ws-gpu-icon--live {
          background: rgba(6,182,212,0.14);
          color: var(--ws-accent-cyan);
          border-color: rgba(6,182,212,0.35);
        }
        .ws-gpu-title {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--ws-text);
          letter-spacing: -0.01em;
        }
        .ws-gpu-sub {
          font-size: 0.68rem;
          color: var(--ws-text-dim);
          margin-top: 0.1rem;
        }
        .ws-gpu-live-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.55rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #34d399;
          background: rgba(16,185,129,0.12);
          border: 1px solid rgba(16,185,129,0.3);
          border-radius: 100px;
          padding: 0.2rem 0.55rem;
          flex-shrink: 0;
          animation: ws-pulse 2s ease-in-out infinite;
        }
        .ws-gpu-off-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.55rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--ws-text-dim);
          background: color-mix(in srgb, var(--ws-card-border) 40%, transparent);
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 60%, transparent);
          border-radius: 100px;
          padding: 0.2rem 0.55rem;
          flex-shrink: 0;
        }
        .ws-gpu-empty {
          font-size: 0.7rem;
          color: var(--ws-text-dim);
          text-align: center;
          padding: 0.75rem 0.5rem;
          line-height: 1.5;
          border: 1px dashed color-mix(in srgb, var(--ws-card-border) 55%, transparent);
          border-radius: 0.6rem;
        }
        .ws-gpu-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.6rem;
        }
        @media (min-width: 640px) {
          .ws-gpu-grid { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
        }
        .ws-gpu-node {
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 60%, transparent);
          background: color-mix(in srgb, var(--ws-card-bg-mid) 45%, transparent);
          border-radius: 0.7rem;
          padding: 0.7rem 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .ws-gpu-node-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.4rem;
        }
        .ws-gpu-node-name {
          font-size: 0.68rem;
          font-weight: 600;
          color: var(--ws-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ws-gpu-node-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .ws-gpu-node-dot--on {
          background: #22c55e;
          box-shadow: 0 0 6px rgba(34,197,94,0.5);
          animation: ws-pulse 2s ease-in-out infinite;
        }
        .ws-gpu-node-dot--off {
          background: #ef4444;
          box-shadow: 0 0 6px rgba(239,68,68,0.4);
        }
        .ws-gpu-metric {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .ws-gpu-metric-head {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--ws-text-dim);
        }
        .ws-gpu-metric-val {
          margin-left: auto;
          color: var(--ws-text-muted);
          font-variant-numeric: tabular-nums;
        }
        .ws-gpu-track {
          height: 5px;
          border-radius: 100px;
          background: color-mix(in srgb, var(--ws-card-border) 55%, transparent);
          overflow: hidden;
        }
        .ws-gpu-fill {
          height: 100%;
          border-radius: 100px;
          transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-gpu-fill--cyan { background: var(--ws-accent-cyan); }
        .ws-gpu-fill--purple { background: var(--ws-accent-purple); }
        .ws-gpu-node-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          padding-top: 0.1rem;
        }
        .ws-gpu-stat {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.62rem;
          color: var(--ws-text-muted);
          background: color-mix(in srgb, var(--ws-card-border) 35%, transparent);
          border-radius: 100px;
          padding: 0.2rem 0.5rem;
          font-variant-numeric: tabular-nums;
        }
        .ws-gpu-footer {
          font-size: 0.6rem;
          color: var(--ws-text-dim);
          text-align: center;
        }
        .ws-gpu-totals {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          border: 1px solid color-mix(in srgb, var(--ws-card-border) 55%, transparent);
          background: color-mix(in srgb, var(--ws-card-bg-mid) 35%, transparent);
          border-radius: 0.7rem;
          padding: 0.7rem 0.8rem;
        }
        .ws-gpu-total {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .ws-gpu-total-head {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.62rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ws-text-dim);
        }
        .ws-gpu-total-val {
          margin-left: auto;
          color: var(--ws-text-muted);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0;
          text-transform: none;
        }
        .ws-gpu-total-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          padding-top: 0.15rem;
        }
      `}</style>
    </>
  );
}
