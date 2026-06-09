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
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TRISHULHUB WORKSPACE v2.1 — Live AI + Dynamic Protocol
   ═══════════════════════════════════════════════════════════════ */

/* ── Simulated AI operational lines (expanded pool) ── */
type LineType = "success" | "info" | "warn" | "idle";
const AI_LINES: { prefix: string; msg: string; type: LineType }[] = [
  /* Active operations */
  { prefix: "ZAI", msg: "GLM 5.1 deep reasoning engine initialized", type: "success" },
  { prefix: "BLUEPRINT", msg: "Loading e-commerce blueprint — smart execution mode", type: "info" },
  { prefix: "WORKSPACE", msg: "Session recovered — last state restored", type: "success" },
  { prefix: "COLLAB", msg: "Conflict lock acquired via /work command", type: "info" },
  { prefix: "TASK", msg: "Task queued — /tasks list refreshed", type: "info" },
  { prefix: "DEPLOY", msg: "Next.js build compiled — 0 TypeScript errors", type: "success" },
  { prefix: "STACK", msg: "Prisma migration applied to PostgreSQL", type: "success" },
  { prefix: "PROTOCOL", msg: "ZAI Protocol v10.4 companion guide synced", type: "success" },
  { prefix: "ZAI", msg: "GLM-5 Turbo fast execution — 2.1s response time", type: "success" },
  { prefix: "BLUEPRINT", msg: "SaaS dashboard blueprint loaded successfully", type: "info" },
  { prefix: "COLLAB", msg: "Workspace released — /release lock cleared", type: "success" },
  { prefix: "TASK", msg: "Task #12 marked /finish — moved to completed", type: "success" },
  { prefix: "DEPLOY", msg: "Vercel deployment triggered — prod preview ready", type: "info" },
  { prefix: "STACK", msg: "Tailwind CSS classes optimized — bundle reduced 8%", type: "success" },
  { prefix: "WORKSPACE", msg: "Multi-user session active — 3 collaborators online", type: "info" },
  { prefix: "ZAI", msg: "Context window: 128K tokens — capacity at 34%", type: "info" },
  { prefix: "BLUEPRINT", msg: "Business website template scaffolded", type: "success" },
  { prefix: "PROTOCOL", msg: "User code verified — Name.Code format accepted", type: "success" },
  { prefix: "COLLAB", msg: "Real-time sync: 2 files updated by remote user", type: "info" },
  { prefix: "TASK", msg: "Sprint backlog: 7 active, 3 pending, 12 done", type: "info" },
  { prefix: "DEPLOY", msg: "Git push to main — commit abc7f2e merged", type: "success" },
  { prefix: "STACK", msg: "PostgreSQL connection pool: 10 active, 0 idle", type: "info" },
  { prefix: "WORKSPACE", msg: "Blueprint state checkpoint saved", type: "success" },
  { prefix: "ZAI", msg: "GLM 5.1 switching to autonomous 8hr horizon mode", type: "info" },
  { prefix: "BLUEPRINT", msg: "Smart execution: 4 sub-tasks auto-generated", type: "info" },
  { prefix: "PROTOCOL", msg: "Workspace credentials verified — access granted", type: "success" },
  { prefix: "COLLAB", msg: "Conflict prevention: edit merge resolved cleanly", type: "success" },
  { prefix: "TASK", msg: "Priority re-sort: critical tasks elevated to top", type: "info" },
  { prefix: "DEPLOY", msg: "CI/CD pipeline passed — all 14 checks green", type: "success" },
  { prefix: "STACK", msg: "TypeScript strict mode — zero type errors", type: "success" },
  /* Extra active lines for burst variety */
  { prefix: "ZAI", msg: "Autonomous loop: step 7/24 in progress", type: "info" },
  { prefix: "DEPLOY", msg: "Edge function cold start — 142ms latency", type: "info" },
  { prefix: "STACK", msg: "Redis cache hit ratio: 97.3% — healthy", type: "success" },
  { prefix: "BLUEPRINT", msg: "Component tree diff: 12 files changed", type: "info" },
  { prefix: "TASK", msg: "Auto-assigning task to available workspace member", type: "info" },
  { prefix: "COLLAB", msg: "WebSocket heartbeat — 3 connections stable", type: "success" },
  { prefix: "ZAI", msg: "Token usage this session: 14.2K / 128K", type: "info" },
  { prefix: "PROTOCOL", msg: "Protocol integrity check passed — hash verified", type: "success" },
  { prefix: "WORKSPACE", msg: "Auto-save triggered — state persisted to cloud", type: "success" },
  { prefix: "DEPLOY", msg: "Docker image rebuilt — size 182MB", type: "success" },
  { prefix: "STACK", msg: "Database index optimized — query time -40%", type: "success" },
  { prefix: "BLUEPRINT", msg: "File watcher detected 3 changes in src/", type: "info" },
  { prefix: "TASK", msg: "Dependency graph updated — 0 circular refs", type: "success" },
  { prefix: "ZAI", msg: "Model response cached — TTL 300s", type: "success" },
  { prefix: "COLLAB", msg: "Branch synced with upstream — up to date", type: "success" },
  /* Warning lines (rare) */
  { prefix: "STACK", msg: "Memory usage spike: 78% — monitoring", type: "warn" },
  { prefix: "DEPLOY", msg: "Rate limit approaching: 450/500 requests/min", type: "warn" },
  { prefix: "ZAI", msg: "Context window at 89% — auto-compact triggered", type: "warn" },
  { prefix: "COLLAB", msg: "Merge conflict detected — auto-resolving", type: "warn" },
  { prefix: "TASK", msg: "Task deadline in 2h — priority escalated", type: "warn" },
  /* Idle / quiet lines (nighttime heavy) */
  { prefix: "WORKSPACE", msg: "System idle — background sync paused", type: "idle" },
  { prefix: "STACK", msg: "Health check OK — all services sleeping", type: "idle" },
  { prefix: "WORKSPACE", msg: "No active sessions — monitoring only", type: "idle" },
  { prefix: "ZAI", msg: "Model warming up — standby mode", type: "idle" },
  { prefix: "STACK", msg: "Cron job skipped — next run at 06:00", type: "idle" },
  { prefix: "WORKSPACE", msg: "Connection pool reduced to 2 — low traffic", type: "idle" },
  { prefix: "DEPLOY", msg: "No deployments queued — pipeline idle", type: "idle" },
  { prefix: "PROTOCOL", msg: "Backup completed — 0 changes since last sync", type: "idle" },
];

/* ── Time-based activity level calculator ── */
function getActivityLevel(): {
  intervalMin: number;
  intervalMax: number;
  burstChance: number;   // 0–1 probability of adding 2-3 lines at once
  maxVisible: number;    // max lines shown in feed
  linePool: LineType[];  // weighted pool for random line selection
} {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  const t = h + m / 60;

  // Night: 22:00–06:00 — very quiet, idle lines, long pauses
  if (t >= 22 || t < 6) {
    return {
      intervalMin: 4000,
      intervalMax: 10000,
      burstChance: 0.08,
      maxVisible: 5,
      linePool: ["idle", "idle", "idle", "success", "info"],
    };
  }
  // Early morning: 06:00–09:00 — warming up
  if (t >= 6 && t < 9) {
    return {
      intervalMin: 2500,
      intervalMax: 6000,
      burstChance: 0.25,
      maxVisible: 8,
      linePool: ["idle", "success", "info", "info", "success"],
    };
  }
  // Peak hours: 09:00–12:00 — busy morning
  if (t >= 9 && t < 12) {
    return {
      intervalMin: 600,
      intervalMax: 1800,
      burstChance: 0.55,
      maxVisible: 15,
      linePool: ["success", "info", "info", "warn", "success", "info"],
    };
  }
  // Lunch dip: 12:00–13:30 — slightly less active
  if (t >= 12 && t < 13.5) {
    return {
      intervalMin: 1500,
      intervalMax: 4000,
      burstChance: 0.3,
      maxVisible: 10,
      linePool: ["success", "info", "idle", "info", "success"],
    };
  }
  // Afternoon peak: 13:30–18:00 — busy
  if (t >= 13.5 && t < 18) {
    return {
      intervalMin: 800,
      intervalMax: 2000,
      burstChance: 0.5,
      maxVisible: 14,
      linePool: ["success", "info", "info", "warn", "success", "info", "success"],
    };
  }
  // Evening wind-down: 18:00–22:00 — decreasing
  return {
    intervalMin: 2500,
    intervalMax: 6000,
    burstChance: 0.25,
    maxVisible: 9,
    linePool: ["success", "info", "idle", "idle", "info", "success"],
  };
}

/* Pick a random line weighted by activity pool */
function pickLine(pool: LineType[]): typeof AI_LINES[number] {
  const filtered = AI_LINES.filter((l) => pool.includes(l.type));
  return filtered[Math.floor(Math.random() * filtered.length)];
}

/* Random interval in range */
function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function TrishulWorkspacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

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

  /* ── Live AI Terminal Feed (time-aware dynamic engine) ── */
  const [aiLogs, setAiLogs] = useState<typeof AI_LINES>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activityRef = useRef(getActivityLevel());

  /* Periodically re-check activity level (every 60s) */
  useEffect(() => {
    if (!entered) return;
    const check = setInterval(() => {
      activityRef.current = getActivityLevel();
    }, 60000);
    return () => clearInterval(check);
  }, [entered]);

  useEffect(() => {
    if (!entered) return;

    const activity = activityRef.current;
    const startCount = Math.min(3, activity.maxVisible);
    const initial: typeof AI_LINES = [];
    for (let i = 0; i < startCount; i++) {
      initial.push(pickLine(activity.linePool));
    }
    setAiLogs(initial);

    /* Schedule the next line(s) with dynamic timing */
    const scheduleNext = () => {
      const a = activityRef.current;
      // Occasionally inject a quiet pause (10% chance during non-peak)
      const isQuietPause = Math.random() < 0.10 && a.intervalMin > 3000;
      const delay = isQuietPause
        ? randomBetween(a.intervalMax * 2, a.intervalMax * 3.5)
        : randomBetween(a.intervalMin, a.intervalMax);

      const tid = setTimeout(() => {
        const currentActivity = activityRef.current;
        // Determine burst size
        let burstCount = 1;
        if (Math.random() < currentActivity.burstChance) {
          burstCount = Math.random() < 0.3 ? 3 : 2;
        }
        // For burst, stagger additions slightly
        for (let b = 0; b < burstCount; b++) {
          setTimeout(() => {
            const line = pickLine(currentActivity.linePool);
            setAiLogs((prev) => {
              const next = [...prev, line];
              return next.length > currentActivity.maxVisible
                ? next.slice(-currentActivity.maxVisible)
                : next;
            });
            // Drive status bars from this operation
            const bump = barBumpFnRef.current;
            if (bump) bump(line.prefix, line.type);
          }, b * (randomBetween(200, 600)));
        }
        scheduleNext();
      }, delay);
      timersRef.current.push(tid);
    };

    const firstTid = setTimeout(scheduleNext, 1200);
    timersRef.current.push(firstTid);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [entered]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [aiLogs]);

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

    /* Lerp animation loop — different speeds per bar for natural feel */
    let frame: number;
    const lerp = (cur: number, target: number, speed: number) =>
      cur + (target - cur) * speed;
    const animate = () => {
      setBarValues((prev) => ({
        ai: Math.round(lerp(prev.ai, barTargets.current.ai, 0.08)),
        sync: Math.round(lerp(prev.sync, barTargets.current.sync, 0.05)),
        api: Math.round(lerp(prev.api, barTargets.current.api, 0.065)),
      }));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

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
      cancelAnimationFrame(frame);
      decayTimers.forEach(clearTimeout);
      barBumpFnRef.current = null;
    };
  }, [entered]);

  /* ── 8hr Horizon long-running tasks ── */
  const horizonStartRef = useRef(Date.now() - 1000 * 60 * 60 * 2.4 - 1000 * 47); // ~2h 47m ago
  const [horizonElapsed, setHorizonElapsed] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - horizonStartRef.current) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setHorizonElapsed(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const [horizonStart2, setHorizonStart2] = useState(Date.now() - 1000 * 60 * 47);
  const [horizonElapsed2, setHorizonElapsed2] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - horizonStart2) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setHorizonElapsed2(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
                <a
                    href="https://chat.z.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`ws-btn-primary ws-btn-primary--${mode}`}
                  >
                    <Zap size={16} strokeWidth={2.5} />
                    <span>START</span>
                    <ArrowUpRight size={14} />
                  </a>
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
                  Autonomous Mode
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
                    {line.type === "warn" && (
                      <span className="ws-feed-warn">&#9888;</span>
                    )}
                    {line.type === "idle" && (
                      <span className="ws-feed-idle">···</span>
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

            {/* ─── ROW 4: Status bars (right after Live Ops) ─── */}

            {/* STATUS INDICATOR CARD */}
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

            {/* ─── 8HR HORIZON CARD ─── */}
            <div
              className={`ws-card ws-horizon-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.39s" }}
            >
              <div className="ws-horizon-header">
                <div className="ws-horizon-title-row">
                  <Clock size={13} className={`ws-horizon-icon ws-horizon-icon--${mode}`} />
                  <h3 className={`ws-horizon-heading ws-horizon-heading--${mode}`}>
                    8hr Horizon
                  </h3>
                </div>
                <span className={`ws-horizon-count ws-horizon-count--${mode}`}>2 tasks</span>
              </div>
              <div className="ws-horizon-list">
                <div className="ws-horizon-task">
                  <div className="ws-horizon-task-top">
                    <span className="ws-horizon-task-prefix">[ZAI]</span>
                    <span className={`ws-horizon-task-name ws-horizon-task-name--${mode}`}>
                      Full-stack e-commerce build
                    </span>
                  </div>
                  <div className="ws-horizon-task-meta">
                    <span className="ws-horizon-timer">{horizonElapsed}</span>
                    <span className="ws-horizon-badge">RUNNING</span>
                    <span className={`ws-horizon-progress-label ws-horizon-progress-label--${mode}`}>
                      step 18/42
                    </span>
                  </div>
                  <div className={`ws-horizon-progress-track ws-horizon-progress-track--${mode}`}>
                    <div className="ws-horizon-progress-fill" style={{ width: "43%" }} />
                  </div>
                </div>
                <div className="ws-horizon-task">
                  <div className="ws-horizon-task-top">
                    <span className="ws-horizon-task-prefix">[BLUEPRINT]</span>
                    <span className={`ws-horizon-task-name ws-horizon-task-name--${mode}`}>
                      SaaS dashboard + auth flow
                    </span>
                  </div>
                  <div className="ws-horizon-task-meta">
                    <span className="ws-horizon-timer">{horizonElapsed2}</span>
                    <span className="ws-horizon-badge">RUNNING</span>
                    <span className={`ws-horizon-progress-label ws-horizon-progress-label--${mode}`}>
                      step 7/28
                    </span>
                  </div>
                  <div className={`ws-horizon-progress-track ws-horizon-progress-track--${mode}`}>
                    <div className="ws-horizon-progress-fill" style={{ width: "25%" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── ROW 5: Actions + Features ─── */}

            {/* START CARD */}
            <div
              className={`ws-card ws-start-card ${entered ? "ws-in" : ""}`}
              style={{ transitionDelay: "0.4s" }}
            >
              <a
                href="https://chat.z.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="ws-start-card-inner"
                aria-label="Launch AI Workspace"
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
                      Full AI workspace environment
                    </p>
                  </div>
                </div>
                <div className={`ws-start-badge ws-start-badge--${mode}`}>
                  <span>Open</span>
                  <ArrowUpRight size={14} />
                </div>
              </a>
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
          touch-action: pan-y;
          margin: -0.75rem;
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
        @media (min-width: 480px) {
          .ws-root { margin: -1.25rem; }
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
        @media (max-width: 639px) {
          .ws-orb--1 { width: 300px; height: 300px; }
          .ws-orb--2 { width: 250px; height: 250px; }
          .ws-orb--3 { width: 200px; height: 200px; }
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
          min-height: 160px;
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
          min-height: 100px;
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
        .ws-feed-prefix--warn { color: #f59e0b; }
        .ws-feed-prefix--idle { color: var(--ws-text-dim); }

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

        /* 8hr Horizon Card */
        .ws-horizon-card { padding: 0; grid-column: 1 / -1; }
        @media (min-width: 1024px) {
          .ws-horizon-card { grid-column: span 2; }
        }
        .ws-horizon-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.85rem 1rem 0.65rem;
          border-bottom: 1px solid var(--ws-card-border);
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
        }
        .ws-horizon-list { display: flex; flex-direction: column; }
        .ws-horizon-task {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--ws-card-border);
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
        .ws-root--bluelight .ws-horizon-task-prefix { color: #f59e0b; }
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
        .ws-root--bluelight .ws-horizon-timer { color: #f59e0b; }
        .ws-root--light .ws-horizon-timer { color: #0891b2; }
        .ws-horizon-badge {
          font-size: 0.5rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #22c55e;
          background: rgba(34,197,94,0.1);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          flex-shrink: 0;
          animation: ws-horizon-pulse 2s ease-in-out infinite;
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
        .ws-horizon-progress-track {
          width: 100%; height: 3px;
          border-radius: 100px;
          background: var(--ws-card-border);
          overflow: hidden;
        }
        .ws-horizon-progress-fill {
          height: 100%; border-radius: 100px;
          background: linear-gradient(90deg, #06b6d4, #8b5cf6);
          transition: width 0.5s ease;
        }
        .ws-root--bluelight .ws-horizon-progress-fill {
          background: linear-gradient(90deg, #f59e0b, #d97706);
        }
        .ws-root--light .ws-horizon-progress-fill {
          background: linear-gradient(90deg, #0891b2, #7c3aed);
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
          background: #fbbf24;
          box-shadow: 0 0 8px rgba(251,191,36,0.3);
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
          will-change: top;
        }
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
        .ws-root--bluelight .ws-bar-pct--cyan { color: rgba(245,158,11,0.65); }
        .ws-root--bluelight .ws-bar-pct--purple { color: rgba(217,119,6,0.65); }
        .ws-root--bluelight .ws-bar-pct--pink { color: rgba(251,191,36,0.65); }

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
