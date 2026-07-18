"use client";

import { useEffect, useRef, useState } from "react";
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

const AI_LINES: AiLine[] = [
  { prefix: "ZAI", msg: "GLM 5.1 deep reasoning engine initialized", type: "success" },
  { prefix: "BLUEPRINT", msg: "Loading e-commerce blueprint — smart execution mode", type: "info" },
  { prefix: "WORKSPACE", msg: "Session recovered — last state restored", type: "success" },
  { prefix: "DEPLOY", msg: "Next.js build compiled — 0 TypeScript errors", type: "success" },
  { prefix: "STACK", msg: "Prisma migration applied to PostgreSQL", type: "success" },
  { prefix: "COLLAB", msg: "Real-time sync: 2 files updated by remote user", type: "info" },
  { prefix: "TASK", msg: "Sprint backlog: 7 active, 3 pending, 12 done", type: "info" },
  { prefix: "ZAI", msg: "GLM-5 Turbo fast execution — 2.1s response time", type: "success" },
  { prefix: "AGENT", msg: "Workspace credentials verified — access granted", type: "success" },
  { prefix: "DEPLOY", msg: "CI/CD pipeline passed — all 14 checks green", type: "success" },
  { prefix: "STACK", msg: "Redis cache hit ratio: 97.3% — healthy", type: "success" },
  { prefix: "BLUEPRINT", msg: "Component tree diff: 12 files changed", type: "info" },
  { prefix: "COLLAB", msg: "WebSocket heartbeat — 3 connections stable", type: "success" },
  { prefix: "ZAI", msg: "Autonomous loop: step 7/24 in progress", type: "info" },
  { prefix: "STACK", msg: "Memory usage spike: 78% — monitoring", type: "warn" },
  { prefix: "DEPLOY", msg: "Rate limit approaching: 450/500 requests/min", type: "warn" },
  { prefix: "TASK", msg: "Task deadline in 2h — priority escalated", type: "warn" },
  { prefix: "WORKSPACE", msg: "System idle — background sync paused", type: "idle" },
  { prefix: "STACK", msg: "Health check OK — all services sleeping", type: "idle" },
  { prefix: "ZAI", msg: "Model warming up — standby mode", type: "idle" },
  { prefix: "DEPLOY", msg: "No deployments queued — pipeline idle", type: "idle" },
];

const INTENSITY = [
  { label: "STANDBY", pulseMs: 3200, min: 4500, max: 9000, maxVisible: 4, pool: ["idle", "idle", "success"] as LineType[] },
  { label: "LOW", pulseMs: 2400, min: 2800, max: 5500, maxVisible: 6, pool: ["success", "info", "idle", "info"] as LineType[] },
  { label: "MEDIUM", pulseMs: 1700, min: 1400, max: 3200, maxVisible: 8, pool: ["success", "info", "info", "warn", "success"] as LineType[] },
  { label: "HIGH", pulseMs: 1100, min: 700, max: 1800, maxVisible: 11, pool: ["success", "info", "info", "warn", "success", "info"] as LineType[] },
  { label: "MAX OPS", pulseMs: 650, min: 400, max: 1100, maxVisible: 14, pool: ["success", "info", "info", "warn", "success", "info", "success"] as LineType[] },
];

function pickLine(pool: LineType[]) {
  const filtered = AI_LINES.filter((l) => pool.includes(l.type));
  return filtered[Math.floor(Math.random() * filtered.length)];
}

function formatClockInTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
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
  const level = Math.min(4, count) as 0 | 1 | 2 | 3 | 4;
  const cfg = INTENSITY[level];
  const [aiLogs, setAiLogs] = useState<AiLine[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onLineRef = useRef(onActivityLine);
  onLineRef.current = onActivityLine;

  useEffect(() => {
    if (!entered) return;
    const cfg = INTENSITY[Math.min(4, liveUsers.length) as 0 | 1 | 2 | 3 | 4];
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const start = Math.min(2, cfg.maxVisible);
    setAiLogs(Array.from({ length: start }, () => pickLine(cfg.pool)));

    const schedule = () => {
      const delay = cfg.min + Math.random() * (cfg.max - cfg.min);
      const tid = setTimeout(() => {
        const line = pickLine(cfg.pool);
        setAiLogs((prev) => {
          const next = [...prev, line];
          return next.length > cfg.maxVisible ? next.slice(-cfg.maxVisible) : next;
        });
        onLineRef.current?.(line.prefix, line.type);
        schedule();
      }, delay);
      timersRef.current.push(tid);
    };

    const first = setTimeout(schedule, 900);
    timersRef.current.push(first);
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [entered, liveUsers.length]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [aiLogs, liveUsers]);

  const prefixClass = (type: LineType) =>
    type === "success" ? "ws-feed-prefix--success" : type === "warn" ? "ws-feed-prefix--warn" : type === "idle" ? "ws-feed-prefix--idle" : "ws-feed-prefix--info";

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
      <div ref={feedRef} className="ws-feed-scroll">
        {liveUsers.length === 0 ? (
          <div className="ws-feed-line ws-feed-line--empty">
            <span className={`ws-feed-msg ws-feed-msg--${mode} ws-feed-msg--idle`}>No one is currently working</span>
          </div>
        ) : (
          liveUsers.map((u, i) => {
            const elapsed =
              Math.max(0, Math.floor((Date.now() - new Date(u.clockInAt).getTime()) / 1000)) || u.elapsedSec;
            return (
              <div key={`${u.userId}-${i}`} className="ws-feed-line ws-feed-line--enter">
                <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatClockInTime(u.clockInAt)}</span>
                <span className="ws-feed-prefix ws-feed-prefix--info">{u.name}</span>
                <span className="ws-live-user-dot" aria-hidden title="Clocked in" />
                <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                  working on {u.projectName ?? "no project"} ({formatElapsedHm(elapsed)})
                </span>
              </div>
            );
          })
        )}
        {aiLogs.map((line, i) => (
          <div key={`ai-${i}-${line.prefix}`} className="ws-feed-line ws-feed-line--enter">
            <span className={`ws-feed-time ws-feed-time--${mode}`}>
              {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </span>
            <span className={`ws-feed-prefix ${prefixClass(line.type)}`}>{line.prefix}</span>
            {line.type === "success" && <span className="ws-feed-check">✓</span>}
            {line.type === "warn" && <span className="ws-feed-warn">⚠</span>}
            {line.type === "idle" && <span className="ws-feed-idle">○</span>}
            <span className={`ws-feed-msg ws-feed-msg--${mode}`}>{line.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
