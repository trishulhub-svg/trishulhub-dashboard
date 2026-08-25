"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cpu,
  Activity,
  Thermometer,
  MemoryStick,
  Gauge,
  Radio,
  CircleSlash,
  Zap,
  BatteryMedium,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GpuResult = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  data: Record<string, unknown> | null;
  fetchedAt: string;
};

type GpuStatus = {
  enabled: GpuResult[];
  results: GpuResult[];
  anyLive: boolean;
};

type GpuLiveCardProps = {
  className?: string;
  style?: React.CSSProperties;
  entered?: boolean;
  /** Called when the live/off state changes — lets the page hide the
   *  "All Systems Operational" card while nodes are streaming. */
  onLiveChange?: (live: boolean) => void;
};

const POLL_MS = 3000;
/** Keep showing a node for this long after it stops responding (smooth fade). */
const STALE_MS = 10_000;

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

type NodeMetrics = {
  cpu: number | null;
  cpuFreq: number | null;
  memoryPercent: number | null;
  memoryUsedGb: number | null;
  memoryTotalGb: number | null;
  temperature: number | null;
  batteryPercent: number | null;
  batteryState: string | null;
  uptime: string | null;
  health: string | null;
};

/** Normalize either the JSON or HTML monitor format into a common shape. */
function extractMetrics(data: Record<string, unknown>): NodeMetrics {
  const get = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = num(data[k]);
      if (v !== null) return v;
    }
    return null;
  };
  const nested = (data.gpu ?? data.metrics ?? data.performance ?? data.system ?? {}) as Record<string, unknown>;
  const getN = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = num(nested[k]);
      if (v !== null) return v;
    }
    return null;
  };
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    cpu:
      get("cpu_usage", "cpuUsage", "cpu", "cpuLoad", "load") ??
      getN("cpu", "cpu_usage", "load"),
    cpuFreq:
      get("cpu_freq_mhz", "cpuFreqMhz", "frequency_mhz", "clock_mhz") ??
      getN("frequency_mhz", "clock_mhz", "freq_mhz"),
    memoryPercent:
      get("memory_percent", "memoryPercent", "memory", "mem") ??
      getN("memory_percent", "memory", "mem"),
    memoryUsedGb:
      get("memory_used_gb", "memoryUsedGb", "memory_used") ??
      getN("memory_used_gb", "memory_used"),
    memoryTotalGb:
      get("memory_total_gb", "memoryTotalGb", "memory_total") ??
      getN("memory_total_gb", "memory_total"),
    temperature:
      get("gpu_temp", "gpuTemp", "temperature", "temp", "cpu_temp") ??
      getN("temp", "temperature", "cpu_temp"),
    batteryPercent:
      get("battery_percent", "batteryPercent", "battery") ??
      getN("battery_percent", "battery"),
    batteryState:
      str(data.battery_state ?? data.batteryState) ??
      str(nested.battery_state ?? nested.batteryState),
    uptime: str(data.uptime ?? nested.uptime),
    health: str(data.health ?? nested.health ?? data.status),
  };
}

export function GpuLiveCard({ className, style, entered, onLiveChange }: GpuLiveCardProps) {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gpu/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GpuStatus;
      setStatus(data);
      setError(false);
      const live = data.anyLive === true;
      if (live !== liveRef.current) {
        liveRef.current = live;
        onLiveChange?.(live);
      }
    } catch {
      setError(true);
    }
  }, [onLiveChange]);

  useEffect(() => {
    // Polling effect: fetch once, then every 3s while mounted
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStatus();
    timerRef.current = setInterval(() => void fetchStatus(), POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchStatus]);

  // Smoothly drop nodes that stopped responding (keep them for STALE_MS).
  const now = Date.now();
  const liveResults = (status?.results || [])
    .filter((r) => r.ok)
    .map((r) => ({ ...r, stale: now - new Date(r.fetchedAt).getTime() > STALE_MS }))
    .filter((r) => !r.stale);
  const anyLive = liveResults.length > 0;

  // ── Aggregated totals across all live nodes ──
  const metrics = liveResults.map((r) => extractMetrics(r.data || {}));
  const totalMemoryUsed = metrics.reduce(
    (s, m) => s + (m.memoryUsedGb ?? 0),
    0
  );
  const totalMemory = metrics.reduce((s, m) => s + (m.memoryTotalGb ?? 0), 0);
  const avgCpu =
    metrics.filter((m) => m.cpu !== null).length > 0
      ? metrics.reduce((s, m) => s + (m.cpu ?? 0), 0) /
        metrics.filter((m) => m.cpu !== null).length
      : null;
  const avgBattery =
    metrics.filter((m) => m.batteryPercent !== null).length > 0
      ? metrics.reduce((s, m) => s + (m.batteryPercent ?? 0), 0) /
        metrics.filter((m) => m.batteryPercent !== null).length
      : null;
  const maxTemp =
    metrics.filter((m) => m.temperature !== null).length > 0
      ? Math.max(...metrics.filter((m) => m.temperature !== null).map((m) => m.temperature as number))
      : null;

  return (
    <div
      className={cn("ws-card ws-gpu-card", entered && "ws-in", className)}
      style={style}
      data-gpu-live={anyLive ? "true" : "false"}
    >
      <div className="ws-gpu-header">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("ws-gpu-icon", anyLive && "ws-gpu-icon--live")}>
            {anyLive ? <Activity size={18} /> : <Cpu size={18} />}
          </div>
          <div className="min-w-0">
            <h3 className="ws-gpu-title">Trishul Cloud Process</h3>
            <p className="ws-gpu-sub">
              {anyLive
                ? `${liveResults.length} node${liveResults.length === 1 ? "" : "s"} streaming live`
                : status?.enabled?.length
                  ? "Nodes configured — waiting for data"
                  : "GPU monitor idle"}
            </p>
          </div>
        </div>
        {anyLive ? (
          <span className="ws-gpu-live-badge">
            <Radio className="h-3 w-3" /> LIVE
          </span>
        ) : (
          <span className="ws-gpu-off-badge">
            <CircleSlash className="h-3 w-3" /> OFF
          </span>
        )}
      </div>

      {error && <p className="ws-gpu-empty">Could not reach the monitor. Retrying…</p>}

      {!error && !anyLive && (
        <p className="ws-gpu-empty">
          {status?.enabled?.length
            ? "Connected nodes are not emitting data right now. Start a GPU process or toggle a URL on in System → GPU."
            : "No GPU sources enabled. Add a URL in System → GPU to see live performance here."}
        </p>
      )}

      {!error && anyLive && (
        <>
          {/* Combined totals — e.g. "4 GB of 8 GB" across all nodes */}
          <div className="ws-gpu-totals">
            {avgCpu !== null && (
              <div className="ws-gpu-total">
                <div className="ws-gpu-total-head">
                  <Gauge size={13} />
                  <span>Combined CPU</span>
                  <span className="ws-gpu-total-val">{Math.round(avgCpu)}%</span>
                </div>
                <div className="ws-gpu-track">
                  <div
                    className="ws-gpu-fill ws-gpu-fill--cyan"
                    style={{ width: `${clamp(avgCpu)}%` }}
                  />
                </div>
              </div>
            )}
            {totalMemory > 0 && (
              <div className="ws-gpu-total">
                <div className="ws-gpu-total-head">
                  <MemoryStick size={13} />
                  <span>Combined Memory</span>
                  <span className="ws-gpu-total-val">
                    {totalMemoryUsed.toFixed(1)} / {totalMemory.toFixed(1)} GB
                  </span>
                </div>
                <div className="ws-gpu-track">
                  <div
                    className="ws-gpu-fill ws-gpu-fill--purple"
                    style={{ width: `${clamp((totalMemoryUsed / totalMemory) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="ws-gpu-total-chips">
              {avgBattery !== null && (
                <div className="ws-gpu-stat" title="Average battery">
                  <BatteryMedium size={12} />
                  <span>{Math.round(avgBattery)}%</span>
                </div>
              )}
              {maxTemp !== null && (
                <div className="ws-gpu-stat" title="Hottest node">
                  <Thermometer size={12} />
                  <span>{Math.round(maxTemp)}°C</span>
                </div>
              )}
            </div>
          </div>

          {/* Per-node breakdown */}
          <div className="ws-gpu-grid">
            {liveResults.map((r) => {
              const m = extractMetrics(r.data || {});
              return (
                <div key={r.id} className="ws-gpu-node">
                  <div className="ws-gpu-node-head">
                    <span className="ws-gpu-node-name">{r.name || "GPU Node"}</span>
                    <span className="ws-gpu-node-dot ws-gpu-node-dot--on" />
                  </div>

                  {m.cpu !== null && (
                    <div className="ws-gpu-metric">
                      <div className="ws-gpu-metric-head">
                        <Gauge size={12} />
                        <span>CPU</span>
                        <span className="ws-gpu-metric-val">{Math.round(m.cpu)}%</span>
                      </div>
                      <div className="ws-gpu-track">
                        <div
                          className="ws-gpu-fill ws-gpu-fill--cyan"
                          style={{ width: `${clamp(m.cpu)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {m.memoryPercent !== null && (
                    <div className="ws-gpu-metric">
                      <div className="ws-gpu-metric-head">
                        <MemoryStick size={12} />
                        <span>Memory</span>
                        <span className="ws-gpu-metric-val">
                          {m.memoryPercent != null ? `${Math.round(m.memoryPercent)}%` : "—"}
                        </span>
                      </div>
                      <div className="ws-gpu-track">
                        <div
                          className="ws-gpu-fill ws-gpu-fill--purple"
                          style={{ width: `${clamp(m.memoryPercent)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="ws-gpu-node-stats">
                    {m.memoryUsedGb !== null && m.memoryTotalGb !== null && (
                      <div className="ws-gpu-stat" title="Memory used of total">
                        <MemoryStick size={12} />
                        <span>
                          {m.memoryUsedGb.toFixed(1)}/{m.memoryTotalGb.toFixed(1)} GB
                        </span>
                      </div>
                    )}
                    {m.cpuFreq !== null && (
                      <div className="ws-gpu-stat" title="CPU frequency">
                        <Zap size={12} />
                        <span>{Math.round(m.cpuFreq)} MHz</span>
                      </div>
                    )}
                    {m.temperature !== null && (
                      <div className="ws-gpu-stat" title="Temperature">
                        <Thermometer size={12} />
                        <span>{Math.round(m.temperature)}°C</span>
                      </div>
                    )}
                    {m.batteryPercent !== null && (
                      <div className="ws-gpu-stat" title="Battery">
                        <BatteryMedium size={12} />
                        <span>{Math.round(m.batteryPercent)}%</span>
                      </div>
                    )}
                    {m.uptime && (
                      <div className="ws-gpu-stat" title="Uptime">
                        <Activity size={12} />
                        <span>{m.uptime}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="ws-gpu-footer">
        {anyLive
          ? `Updated every 3s · ${new Date(liveResults[0].fetchedAt).toLocaleTimeString()}`
          : "Configured in System → GPU"}
      </div>
    </div>
  );
}
