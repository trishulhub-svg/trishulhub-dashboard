"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Activity, Thermometer, MemoryStick, Gauge, Radio, CircleSlash, Zap } from "lucide-react";
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
};

const POLL_MS = 3000;

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

/** Extract common GPU/performance fields from arbitrary JSON. */
function extractMetrics(data: Record<string, unknown>) {
  const get = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = num(data[k]);
      if (v !== null) return v;
    }
    return null;
  };
  // Nested objects (gpu: {usage: 45}, metrics: {gpu_usage: 45})
  const nested = (data.gpu ?? data.metrics ?? data.performance ?? data.system ?? {}) as Record<string, unknown>;
  const getN = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = num(nested[k]);
      if (v !== null) return v;
    }
    return null;
  };
  return {
    gpuUsage: get("gpu_usage", "gpuUsage", "usage", "load", "utilization") ?? getN("usage", "load", "utilization", "gpu"),
    temperature: get("gpu_temp", "gpuTemp", "temperature", "temp") ?? getN("temp", "temperature"),
    memory: get("gpu_memory", "gpuMemory", "memory", "vram") ?? getN("memory", "vram"),
    memoryTotal: get("gpu_memory_total", "gpuMemoryTotal", "memory_total", "vram_total") ?? getN("memory_total", "vram_total"),
    fps: get("fps", "frame_rate", "frameRate") ?? getN("fps", "frame_rate"),
    cpu: get("cpu_usage", "cpuUsage", "cpu") ?? getN("cpu", "cpu_usage"),
    power: get("power", "power_w", "powerW") ?? getN("power"),
    status: String(data.status ?? nested.status ?? data.state ?? "ok").toLowerCase(),
  };
}

export function GpuLiveCard({ className, style, entered }: GpuLiveCardProps) {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gpu/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GpuStatus;
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // Polling effect: fetch once, then every 3s while mounted
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStatus();
    timerRef.current = setInterval(() => void fetchStatus(), POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchStatus]);

  const anyLive = status?.anyLive === true;
  const liveResults = (status?.results || []).filter((r) => r.ok);

  return (
    <div
      className={cn(
        "ws-card ws-gpu-card",
        entered && "ws-in",
        className
      )}
      style={style}
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

      {error && (
        <p className="ws-gpu-empty">Could not reach the monitor. Retrying…</p>
      )}

      {!error && !anyLive && (
        <p className="ws-gpu-empty">
          {status?.enabled?.length
            ? "Connected nodes are not emitting data right now. Start a GPU process or toggle a URL on in System → GPU."
            : "No GPU sources enabled. Add a URL in System → GPU to see live performance here."}
        </p>
      )}

      {!error && anyLive && (
        <div className="ws-gpu-grid">
          {liveResults.map((r) => {
            const m = extractMetrics(r.data || {});
            const usage = m.gpuUsage;
            const temp = m.temperature;
            const mem = m.memory;
            const memTotal = m.memoryTotal;
            const fps = m.fps;
            const cpu = m.cpu;
            const power = m.power;
            const isLive = m.status !== "down" && m.status !== "offline" && m.status !== "stopped";
            return (
              <div key={r.id} className="ws-gpu-node">
                <div className="ws-gpu-node-head">
                  <span className="ws-gpu-node-name">{r.name || "GPU Node"}</span>
                  {isLive ? (
                    <span className="ws-gpu-node-dot ws-gpu-node-dot--on" />
                  ) : (
                    <span className="ws-gpu-node-dot ws-gpu-node-dot--off" />
                  )}
                </div>

                {usage !== null && (
                  <div className="ws-gpu-metric">
                    <div className="ws-gpu-metric-head">
                      <Gauge size={12} />
                      <span>GPU</span>
                      <span className="ws-gpu-metric-val">{Math.round(usage)}%</span>
                    </div>
                    <div className="ws-gpu-track">
                      <div
                        className="ws-gpu-fill ws-gpu-fill--cyan"
                        style={{ width: `${clamp(usage)}%` }}
                      />
                    </div>
                  </div>
                )}

                {cpu !== null && (
                  <div className="ws-gpu-metric">
                    <div className="ws-gpu-metric-head">
                      <Cpu size={12} />
                      <span>CPU</span>
                      <span className="ws-gpu-metric-val">{Math.round(cpu)}%</span>
                    </div>
                    <div className="ws-gpu-track">
                      <div
                        className="ws-gpu-fill ws-gpu-fill--purple"
                        style={{ width: `${clamp(cpu)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="ws-gpu-node-stats">
                  {temp !== null && (
                    <div className="ws-gpu-stat" title="Temperature">
                      <Thermometer size={12} />
                      <span>{Math.round(temp)}°C</span>
                    </div>
                  )}
                  {mem !== null && (
                    <div className="ws-gpu-stat" title="Memory">
                      <MemoryStick size={12} />
                      <span>
                        {memTotal && memTotal > 0
                          ? `${Math.round(mem)}/${Math.round(memTotal)}GB`
                          : `${Math.round(mem)}GB`}
                      </span>
                    </div>
                  )}
                  {fps !== null && (
                    <div className="ws-gpu-stat" title="Frames per second">
                      <Zap size={12} />
                      <span>{Math.round(fps)} FPS</span>
                    </div>
                  )}
                  {power !== null && (
                    <div className="ws-gpu-stat" title="Power draw">
                      <Gauge size={12} />
                      <span>{Math.round(power)}W</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ws-gpu-footer">
        {anyLive
          ? `Updated every 3s · ${new Date(status?.results?.[0]?.fetchedAt || Date.now()).toLocaleTimeString()}`
          : "Configured in System → GPU"}
      </div>
    </div>
  );
}
