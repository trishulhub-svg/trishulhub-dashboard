"use client";

import React from "react";
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
import {
  aggregateGpuResults,
  clamp,
  type GpuStatus,
} from "@/lib/gpu-metrics";
import { useGpuStatus } from "@/hooks/use-gpu-status";

type GpuLiveCardProps = {
  className?: string;
  style?: React.CSSProperties;
  entered?: boolean;
  /** Current fetch result (used for the LIVE/OFF liveness label). */
  status?: GpuStatus | null;
  /** Last known-good snapshot — keeps data visible during brief outages. */
  source?: GpuStatus | null;
  error?: boolean;
};

/** Keep showing a node for this long after it stops responding (smooth fade). */
const STALE_MS = 20_000;

export const GpuLiveCard = React.memo(function GpuLiveCard({
  className,
  style,
  entered,
  status: statusProp,
  source: sourceProp,
  error: errorProp,
}: GpuLiveCardProps) {
  // Standalone fallback: when no controlled snapshot is passed, poll directly.
  const internal = useGpuStatus(statusProp === undefined && sourceProp === undefined);
  const status = statusProp !== undefined ? statusProp : internal.status;
  const dataSource = sourceProp !== undefined ? sourceProp : internal.source;
  const error = errorProp !== undefined ? errorProp : internal.error;

  // Smoothly drop nodes that stopped responding (keep them for STALE_MS).
  const { nodes: liveResults, agg: totals } = aggregateGpuResults(
    dataSource?.results || [],
    STALE_MS
  );
  const anyLive = liveResults.length > 0;
  // Track whether we are currently live vs waiting (for the OFF label).
  const isCurrentlyLive = status?.anyLive === true;
  const avgCpu = totals.avgCpu;
  const totalMemoryUsed = totals.totalMemoryUsedGb;
  const totalMemory = totals.totalMemoryGb;
  const avgBattery = totals.avgBattery;
  const maxTemp = totals.maxTemp;

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
        <div className="ws-gpu-body">
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
              const m = r.metrics;
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
        </div>
      )}

      <div className="ws-gpu-footer">
        {anyLive
          ? `${isCurrentlyLive ? "Updated every 3s" : "Reconnecting… last data"} · ${new Date(
              liveResults[0].fetchedAt
            ).toLocaleTimeString()}`
          : "Configured in System → GPU"}
      </div>
    </div>
  );
})
