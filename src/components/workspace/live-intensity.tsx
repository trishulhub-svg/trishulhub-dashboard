"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "lucide-react";

export type WorkspaceMode = "dark" | "light" | "bluelight";
export type LineType = "success" | "info" | "warn" | "idle";

export type LiveUser = {
  userId: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  clockInAt: string;
  elapsedSec: number;
};

type AiLine = { prefix: string; msg: string; type: LineType };

/** Cursor model / agent flavour — replaces old ZAI/GLM lines */
const AI_LINES: AiLine[] = [
  { prefix: "CURSOR", msg: "Composer model ready — context window warm", type: "success" },
  { prefix: "CURSOR", msg: "Auto mode planning next edit sequence", type: "info" },
  { prefix: "SONNET", msg: "Claude Sonnet reasoning pass complete", type: "success" },
  { prefix: "OPUS", msg: "Claude Opus deep review — architecture check", type: "info" },
  { prefix: "GPT", msg: "GPT-5.4 patch proposal staged", type: "success" },
  { prefix: "CODEX", msg: "Codex fast path — 14 files indexed", type: "info" },
  { prefix: "CURSOR", msg: "Agent loop: apply → test → iterate", type: "info" },
  { prefix: "DEPLOY", msg: "Next.js build compiled — 0 TypeScript errors", type: "success" },
  { prefix: "STACK", msg: "Prisma client in sync with schema", type: "success" },
  { prefix: "COLLAB", msg: "Real-time sync: workspace state healthy", type: "info" },
  { prefix: "CURSOR", msg: "Background agent scanning for dead code", type: "info" },
  { prefix: "SONNET", msg: "Diff review — no security regressions flagged", type: "success" },
  { prefix: "STACK", msg: "Memory usage elevated — monitoring", type: "warn" },
  { prefix: "CURSOR", msg: "Auto mode waiting for human confirmation", type: "warn" },
  { prefix: "WORKSPACE", msg: "System idle — background sync paused", type: "idle" },
  { prefix: "CURSOR", msg: "Models on standby — no active sessions", type: "idle" },
];

const INTENSITY = [
  { label: "STANDBY", pulseMs: 3200, min: 4500, max: 9000, maxVisible: 4, pool: ["idle", "idle", "success"] as LineType[] },
  { label: "LOW", pulseMs: 2400, min: 2800, max: 5500, maxVisible: 6, pool: ["success", "info", "idle", "info"] as LineType[] },
  { label: "MEDIUM", pulseMs: 1700, min: 1400, max: 3200, maxVisible: 8, pool: ["success", "info", "info", "warn", "success"] as LineType[] },
  { label: "HIGH", pulseMs: 1100, min: 700, max: 1800, maxVisible: 11, pool: ["success", "info", "info", "warn", "success", "info"] as LineType[] },
  { label: "MAX OPS", pulseMs: 650, min: 400, max: 1100, maxVisible: 14, pool: ["success", "info", "info", "warn", "success", "info", "success"] as LineType[] },
];

const PREFIX_CLASS: Record<LineType, string> = {
  success: "ws-feed-prefix--success",
  warn: "ws-feed-prefix--warn",
  idle: "ws-feed-prefix--idle",
  info: "ws-feed-prefix--info",
};

const AUTO_MODE_AFTER_SEC = 5 * 60;
const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

function pickLine(pool: LineType[]) {
  const filtered = AI_LINES.filter((l) => pool.includes(l.type));
  return filtered[Math.floor(Math.random() * filtered.length)] ?? AI_LINES[0];
}

function formatTime(isoOrNow?: string) {
  try {
    return new Date(isoOrNow ?? Date.now()).toLocaleTimeString("en-US", TIME_FMT);
  } catch {
    return "--:--:--";
  }
}

function formatElapsedHm(sec: number) {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function elapsedFor(u: LiveUser) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(u.clockInAt).getTime()) / 1000) || u.elapsedSec
  );
}

export function LiveIntensity({
  liveUsers,
  mode,
  entered,
  onActivityLine,
}: {
  liveUsers: LiveUser[];
  mode: WorkspaceMode;
  entered: boolean;
  onActivityLine?: (prefix: string, type: LineType) => void;
}) {
  const count = liveUsers.length;
  const cfg = INTENSITY[Math.min(4, count)];
  const [aiLogs, setAiLogs] = useState<AiLine[]>([]);
  const [tick, setTick] = useState(0);
  const logsRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onLineRef = useRef(onActivityLine);
  onLineRef.current = onActivityLine;

  useEffect(() => {
    if (liveUsers.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [liveUsers.length]);

  const autoModeUsers = useMemo(
    () => liveUsers.filter((u) => elapsedFor(u) >= AUTO_MODE_AFTER_SEC),
    [liveUsers, tick]
  );

  useEffect(() => {
    if (!entered || liveUsers.length === 0) {
      setAiLogs([]);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }
    const intensity = INTENSITY[Math.min(4, liveUsers.length)];
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setAiLogs(Array.from({ length: Math.min(2, intensity.maxVisible) }, () => pickLine(intensity.pool)));

    const schedule = () => {
      const delay = intensity.min + Math.random() * (intensity.max - intensity.min);
      const tid = setTimeout(() => {
        const line = pickLine(intensity.pool);
        setAiLogs((prev) => {
          const next = [...prev, line];
          return next.length > intensity.maxVisible ? next.slice(-intensity.maxVisible) : next;
        });
        onLineRef.current?.(line.prefix, line.type);
        schedule();
      }, delay);
      timersRef.current.push(tid);
    };

    timersRef.current.push(setTimeout(schedule, 900));
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [entered, liveUsers.length]);

  // Only the AI log pane scrolls — user + CURSOR agent rows stay pinned at top.
  useEffect(() => {
    const el = logsRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [aiLogs]);

  return (
    <div className={`ws-card ws-feed-card ${entered ? "ws-in" : ""}`} style={{ transitionDelay: "0.35s" }}>
      <div className="ws-feed-header">
        <div className="ws-feed-title-row">
          <Terminal size={14} className={`ws-feed-icon ws-feed-icon--${mode}`} />
          <h3 className={`ws-feed-heading ws-feed-heading--${mode}`}>Live Operations</h3>
        </div>
        <div className="ws-feed-live-badge" title={`${count} active ${count === 1 ? "user" : "users"}`}>
          <span className="ws-feed-live-dot" style={{ animationDuration: `${cfg.pulseMs}ms` }} />
          <span>{cfg.label}</span>
        </div>
      </div>
      <div className="ws-feed-body">
        {liveUsers.length === 0 ? (
          <div className="ws-feed-line ws-feed-line--empty">
            <span className={`ws-feed-msg ws-feed-msg--${mode} ws-feed-msg--idle`}>
              No one is currently working
            </span>
          </div>
        ) : (
          <>
            <div className="ws-feed-pinned">
              {liveUsers.map((u, i) => (
                <div key={`${u.userId}-${i}`} className="ws-feed-line ws-feed-line--enter">
                  <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatTime(u.clockInAt)}</span>
                  <span className="ws-feed-prefix ws-feed-prefix--info">{u.name}</span>
                  <span className="ws-live-user-dot" aria-hidden title="Clocked in" />
                  <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                    working on {u.projectName ?? "no project"} ({formatElapsedHm(elapsedFor(u))})
                  </span>
                </div>
              ))}
              {autoModeUsers.map((u) => (
                <div key={`auto-${u.userId}`} className="ws-feed-line ws-feed-line--enter">
                  <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatTime()}</span>
                  <span className="ws-feed-prefix ws-feed-prefix--success">CURSOR</span>
                  <span className="ws-live-user-dot" aria-hidden />
                  <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                    Auto mode running for {u.name} — agent loop active
                  </span>
                </div>
              ))}
            </div>
            <div ref={logsRef} className="ws-feed-logs">
              {aiLogs.map((line, i) => (
                <div key={`ai-${i}-${line.prefix}`} className="ws-feed-line ws-feed-line--enter">
                  <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatTime()}</span>
                  <span className={`ws-feed-prefix ${PREFIX_CLASS[line.type]}`}>{line.prefix}</span>
                  {line.type === "success" && <span className="ws-feed-check">✓</span>}
                  {line.type === "warn" && <span className="ws-feed-warn">⚠</span>}
                  {line.type === "idle" && <span className="ws-feed-idle">○</span>}
                  <span className={`ws-feed-msg ws-feed-msg--${mode}`}>{line.msg}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
