"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import {
  aggregateGpuResults,
  type GpuAggregate,
  type GpuStatus,
} from "@/lib/gpu-metrics";

export type WorkspaceMode = "dark" | "light" | "bluelight";
export type LineType = "success" | "info" | "warn" | "idle";

export type LiveUser = {
  userId: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  activityType?: string | null;
  /** Project name, training title, or activity bucket label */
  activityLabel?: string | null;
  clockInAt: string;
  elapsedSec: number;
};

function workLabel(u: LiveUser): string {
  if (u.activityLabel?.trim()) return u.activityLabel.trim();
  if (u.activityType === "TRAINING") return "Training";
  if (u.activityType === "SUPERVISION") return "Supervision";
  if (u.activityType === "HR_ADMIN") return "HR & Administration";
  if (u.activityType === "RD_SA") return "R&D / SA";
  return u.projectName?.trim() || "no project";
}

function isTrainingUser(u: LiveUser): boolean {
  return u.activityType === "TRAINING";
}

type AiLine = { prefix: string; msg: string; type: LineType };

/** DeepSeek harness + CPU/GPU monitor flavour — replaces old ZAI/GLM lines */
const AI_LINES: AiLine[] = [
  { prefix: "DEEPSEEK", msg: "DeepSeek v4 Flash harness active — token window warm", type: "success" },
  { prefix: "HARNESS", msg: "DeepSeek harness planning next edit sequence", type: "info" },
  { prefix: "DEEPSEEK", msg: "v4 Flash reasoning pass complete — low latency", type: "success" },
  { prefix: "HARNESS", msg: "Harness controller: deep review — architecture check", type: "info" },
  { prefix: "DEEPSEEK", msg: "v4 Flash patch proposal staged", type: "success" },
  { prefix: "HARNESS", msg: "DeepSeek harness fast path — files indexed", type: "info" },
  { prefix: "HARNESS", msg: "Harness loop: apply → test → iterate", type: "info" },
  { prefix: "DEPLOY", msg: "Next.js build compiled — 0 TypeScript errors", type: "success" },
  { prefix: "GPU", msg: "GPU core engaged — shader pipeline active", type: "success" },
  { prefix: "CPU", msg: "CPU threads utilising — workload scheduled", type: "info" },
  { prefix: "GPU", msg: "GPU memory allocated for inference batch", type: "info" },
  { prefix: "CPU", msg: "CPU frequency boosted — compute burst", type: "success" },
  { prefix: "GPU", msg: "Tensor cores busy — matrix multiply in flight", type: "info" },
  { prefix: "CPU", msg: "CPU load elevated — harness monitoring", type: "warn" },
  { prefix: "GPU", msg: "GPU temperature stable — thermal headroom OK", type: "success" },
  { prefix: "DEEPSEEK", msg: "v4 Flash context window compacted", type: "info" },
  { prefix: "HARNESS", msg: "Harness waiting for next instruction", type: "warn" },
  { prefix: "GPU", msg: "GPU idle — harness paused", type: "idle" },
  { prefix: "CPU", msg: "CPU idle — background sync paused", type: "idle" },
  { prefix: "DEEPSEEK", msg: "v4 Flash on standby — no active sessions", type: "idle" },
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

/** Real CPU/GPU lines derived from the configured monitor URLs (when live). */
function buildGpuLines(agg: GpuAggregate): AiLine[] {
  const lines: AiLine[] = [];
  if (agg.avgCpu !== null) {
    const pct = Math.round(agg.avgCpu);
    lines.push({
      prefix: "CPU",
      msg: `${pct}% load across ${agg.nodeCount} node${agg.nodeCount === 1 ? "" : "s"} — harness compute active`,
      type: pct >= 70 ? "warn" : pct >= 25 ? "success" : "info",
    });
  }
  if (agg.totalMemoryGb > 0) {
    lines.push({
      prefix: "GPU",
      msg: `${agg.totalMemoryUsedGb.toFixed(1)} / ${agg.totalMemoryGb.toFixed(1)} GB memory — inference buffers allocated`,
      type: agg.totalMemoryUsedGb / agg.totalMemoryGb > 0.85 ? "warn" : "info",
    });
  }
  if (agg.maxTemp !== null) {
    const t = Math.round(agg.maxTemp);
    lines.push({
      prefix: "GPU",
      msg: `Hottest node ${t}°C — thermal headroom ${t >= 70 ? "low" : "OK"}`,
      type: t >= 70 ? "warn" : "success",
    });
  }
  if (agg.avgBattery !== null) {
    const b = Math.round(agg.avgBattery);
    lines.push({
      prefix: "GPU",
      msg: `Node battery ${b}% — ${b <= 20 ? "charge recommended" : "power stable"}`,
      type: b <= 20 ? "warn" : "info",
    });
  }
  return lines;
}

function pickLine(pool: LineType[], gpu?: GpuAggregate | null) {
  const dynamic = gpu ? buildGpuLines(gpu) : [];
  const candidates = [...dynamic, ...AI_LINES].filter((l) => pool.includes(l.type));
  return candidates[Math.floor(Math.random() * candidates.length)] ?? AI_LINES[0];
}

/**
 * Map live CPU/memory/temperature into an intensity bucket (0-4 → the
 * INTENSITY array). Used when a configured URL is emitting data so the badge
 * reflects real compute usage instead of the number of active users.
 */
function gpuLevelIndex(agg: GpuAggregate): number {
  const cpu = agg.avgCpu ?? 0;
  const memPct =
    agg.totalMemoryGb > 0 ? (agg.totalMemoryUsedGb / agg.totalMemoryGb) * 100 : 0;
  const temp = agg.maxTemp ?? 0;
  if (cpu >= 80 || memPct >= 90 || temp >= 75) return 4; // MAX OPS
  if (cpu >= 50 || memPct >= 70 || temp >= 60) return 3; // HIGH
  if (cpu >= 25 || memPct >= 40) return 2; // MEDIUM
  return 1; // LOW
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

export const LiveIntensity = React.memo(function LiveIntensity({
  liveUsers,
  mode,
  entered,
  onActivityLine,
  gpuStatus,
}: {
  liveUsers: LiveUser[];
  mode: WorkspaceMode;
  entered: boolean;
  onActivityLine?: (prefix: string, type: LineType) => void;
  /** Live snapshot of the configured GPU/monitor URLs (Trishul Cloud Process). */
  gpuStatus?: GpuStatus | null;
}) {
  const count = liveUsers.length;
  // Single shared poll comes from the workspace page; aggregate it here so the
  // feed shows real CPU/GPU numbers when a configured URL is emitting data.
  // Computed during render (not memoized) so stale nodes fade out on their own
  // as `now` advances on each re-render while the feed keeps streaming.
  const gpuAgg = gpuStatus?.anyLive === true ? aggregateGpuResults(gpuStatus.results || []) : null;
  const gpuSnapshot = gpuAgg && gpuAgg.agg.nodeCount > 0 ? gpuAgg.agg : null;
  const gpuLive = gpuSnapshot !== null;
  // Latest snapshot for the scheduling loop without restarting its timers.
  const gpuSnapshotRef = useRef<GpuAggregate | null>(gpuSnapshot);
  gpuSnapshotRef.current = gpuSnapshot;
  // Intensity: driven by real CPU/GPU usage when a URL is live, otherwise by
  // the number of active users.
  const gpuLevel = gpuLive && gpuSnapshot ? gpuLevelIndex(gpuSnapshot) : null;
  const levelIndex = gpuLevel !== null ? gpuLevel : Math.min(4, count);
  const cfg = INTENSITY[levelIndex];
  // Current config for the recursive schedule loop (updates as GPU data
  // changes without restarting timers).
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const active = entered && (liveUsers.length > 0 || gpuLive);
  const [aiLogs, setAiLogs] = useState<AiLine[]>([]);
  const [tick, setTick] = useState(0);
  const logsRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onLineRef = useRef(onActivityLine);

  // Keep the latest callback without touching refs during render.
  useEffect(() => {
    onLineRef.current = onActivityLine;
  }, [onActivityLine]);

  // Reset the feed when the live state changes (adjusted during render).
  const [resetState, setResetState] = useState({ active, count: liveUsers.length });
  if (resetState.active !== active || resetState.count !== liveUsers.length) {
    setResetState({ active, count: liveUsers.length });
    if (!active) {
      setAiLogs([]);
    } else {
      const intensity = INTENSITY[levelIndex];
      setAiLogs(
        Array.from(
          { length: Math.min(2, intensity.maxVisible) },
          () => pickLine(intensity.pool, gpuSnapshotRef.current)
        )
      );
    }
  }

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);

  const autoModeUsers = useMemo(
    () => liveUsers.filter((u) => elapsedFor(u) >= AUTO_MODE_AFTER_SEC),
    [liveUsers, tick]
  );

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (!active) return;

    const schedule = () => {
      const cur = cfgRef.current;
      const delay = cur.min + Math.random() * (cur.max - cur.min);
      const tid = setTimeout(() => {
        const line = pickLine(cur.pool, gpuSnapshotRef.current);
        setAiLogs((prev) => {
          const next = [...prev, line];
          return next.length > cur.maxVisible ? next.slice(-cur.maxVisible) : next;
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
  }, [active, liveUsers.length]);

  // Only the AI log pane scrolls — user + harness rows stay pinned at top.
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
        <div
          className="ws-feed-live-badge"
          title={`${cfg.label} — based on ${gpuLive ? "live CPU/GPU usage from configured URLs" : "active users"}`}
        >
          <span className="ws-feed-live-dot" style={{ animationDuration: `${cfg.pulseMs}ms` }} />
          <span>{cfg.label}</span>
        </div>
      </div>
      <div className="ws-feed-body">
        {!active ? (
          <div className="ws-feed-line ws-feed-line--empty">
            <span className={`ws-feed-msg ws-feed-msg--${mode} ws-feed-msg--idle`}>
              No one is currently working
            </span>
          </div>
        ) : (
          <>
            {liveUsers.length > 0 && (
              <div className="ws-feed-pinned">
                {liveUsers.map((u, i) => (
                  <div key={`${u.userId}-${i}`} className="ws-feed-line ws-feed-line--enter">
                    <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatTime(u.clockInAt)}</span>
                    <span className="ws-feed-prefix ws-feed-prefix--info">{u.name}</span>
                    <span className="ws-live-user-dot" aria-hidden title="Clocked in" />
                    <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                      {isTrainingUser(u)
                        ? `in training — ${workLabel(u)} (${formatElapsedHm(elapsedFor(u))})`
                        : `working on ${workLabel(u)} (${formatElapsedHm(elapsedFor(u))})`}
                    </span>
                  </div>
                ))}
                {autoModeUsers.map((u) =>
                  isTrainingUser(u) ? (
                    <div key={`train-${u.userId}`} className="ws-feed-line ws-feed-line--enter">
                      <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatTime()}</span>
                      <span className="ws-feed-prefix ws-feed-prefix--success">TRAINING</span>
                      <span className="ws-live-user-dot" aria-hidden />
                      <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                        {workLabel(u)} — session active for {u.name}
                      </span>
                    </div>
                  ) : (
                    <div key={`auto-${u.userId}`} className="ws-feed-line ws-feed-line--enter">
                      <span className={`ws-feed-time ws-feed-time--${mode}`}>{formatTime()}</span>
                      <span className="ws-feed-prefix ws-feed-prefix--success">DEEPSEEK HARNESS</span>
                      <span className="ws-live-user-dot" aria-hidden />
                      <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                        Auto mode running for {u.name} — DeepSeek v4 Flash harness loop active
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
            {gpuLive && (
              <div className="ws-feed-gpu-summary">
                <span className="ws-feed-prefix ws-feed-prefix--success">GPU LIVE</span>
                <span className={`ws-feed-msg ws-feed-msg--${mode}`}>
                  {gpuSnapshot!.nodeCount} node{gpuSnapshot!.nodeCount === 1 ? "" : "s"} streaming ·{" "}
                  {gpuSnapshot!.avgCpu !== null ? `${Math.round(gpuSnapshot!.avgCpu)}% CPU` : "CPU —"}
                  {gpuSnapshot!.totalMemoryGb > 0
                    ? ` · ${gpuSnapshot!.totalMemoryUsedGb.toFixed(1)}/${gpuSnapshot!.totalMemoryGb.toFixed(1)} GB`
                    : ""}
                  {gpuSnapshot!.maxTemp !== null ? ` · ${Math.round(gpuSnapshot!.maxTemp)}°C` : ""}
                </span>
              </div>
            )}
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
})
