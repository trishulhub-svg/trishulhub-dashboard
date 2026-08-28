"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGpuStatus } from "@/hooks/use-gpu-status";
import { aggregateGpuResults, clamp } from "@/lib/gpu-metrics";
import {
  Activity,
  BatteryMedium,
  CircleSlash,
  Cpu,
  Gauge,
  MemoryStick,
  Radio,
  Thermometer,
  Zap,
} from "lucide-react";

type CloudStatus = {
  anyLive: boolean;
  nodeCount: number;
  enabledCount: number;
  lastChecked: number;
};

/** Lightweight poll — header is on every page, so keep it gentle (12s, pauses
 *  when the tab is hidden) to stay comfortably inside the Vercel Hobby plan. */
const POLL_MS = 12_000;

/**
 * Global header indicator for Cloud Systems Telemetry (monitor URLs).
 * - Green blinking dot + "Cloud Active" when at least one configured URL is
 *   emitting live data.
 * - Amber/red + "Cloud Stopped" / "Cloud Off" when nothing is running.
 * Visible from every dashboard page, right next to the clock-in indicator.
 */
export function CloudStatusHeaderDot() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CloudStatus | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gpu/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        anyLive?: boolean;
        results?: Array<{ ok?: boolean }>;
        enabled?: unknown[];
      };
      const results = Array.isArray(data?.results) ? data.results : [];
      const live = results.filter((r) => r.ok === true).length;
      if (!mountedRef.current) return;
      setState({
        anyLive: data?.anyLive === true || live > 0,
        nodeCount: live,
        enabledCount: Array.isArray(data?.enabled) ? data.enabled.length : 0,
        lastChecked: Date.now(),
      });
      setError(false);
      setLoaded(true);
    } catch {
      if (!mountedRef.current) return;
      setError(true);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Deferred first poll so setState never runs synchronously inside the effect.
    const initial = setTimeout(() => void fetchStatus(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchStatus();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchStatus]);

  if (!loaded) return null;

  const live = state?.anyLive === true;
  const hasSources = (state?.enabledCount ?? 0) > 0;

  let label = "Cloud Off";
  if (error) label = "Cloud Error";
  else if (live) label = "Cloud Active";
  else if (hasSources) label = "Cloud Stopped";

  const dotClass = live
    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]"
    : error
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]"
      : hasSources
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
        : "bg-zinc-400 dark:bg-zinc-500";

  const textClass = live
    ? "text-emerald-700 dark:text-emerald-300"
    : error
      ? "text-red-700 dark:text-red-300"
      : hasSources
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";

  const title = live
    ? `Trishul Cloud active — ${state?.nodeCount} node${state?.nodeCount === 1 ? "" : "s"} streaming · updated ${new Date(
        state?.lastChecked || Date.now()
      ).toLocaleTimeString()}`
    : hasSources
      ? "Trishul Cloud configured but not emitting data right now"
      : "Trishul Cloud — no monitor URLs configured (System → GPU)";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative inline-flex items-center justify-center gap-2 rounded-full",
          "h-9 px-2.5 sm:px-3 shrink-0",
          "border bg-background/60 backdrop-blur",
          live
            ? "border-emerald-500/30 hover:bg-emerald-500/10"
            : error
              ? "border-red-500/30 hover:bg-red-500/10"
              : hasSources
                ? "border-amber-500/30 hover:bg-amber-500/10"
                : "border-border hover:bg-muted/50",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-label={title}
        title={title}
      >
        <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          )}
          <span className={cn("relative inline-flex h-3 w-3 rounded-full", dotClass)} />
        </span>
        <span className={cn("hidden sm:inline text-[11px] font-semibold tracking-wide", textClass)}>
          {label}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(85dvh,44rem)] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-5 pt-4 pb-2 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-cyan-600" />
              Cloud Systems Telemetry
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5 overflow-y-auto">
            <CloudMonitorPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Self-contained live monitor shown in the header popup (no workspace CSS
 *  dependency, so it renders correctly on every page and every device). */
function CloudMonitorPanel() {
  const { status, source, error } = useGpuStatus();
  const dataSource = source ?? status;
  const { nodes, agg } = aggregateGpuResults(dataSource?.results || []);
  const anyLive = nodes.length > 0;
  const isCurrentlyLive = status?.anyLive === true;
  const enabledCount = Array.isArray(status?.enabled) ? status.enabled.length : 0;
  const memPct =
    agg.totalMemoryGb > 0 ? (agg.totalMemoryUsedGb / agg.totalMemoryGb) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Header status strip */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {anyLive
            ? `${agg.nodeCount} connected machine${agg.nodeCount === 1 ? "" : "s"} streaming live`
            : enabledCount > 0
              ? "Nodes configured — waiting for data"
              : "Telemetry monitor idle"}
        </p>
        {anyLive ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
            <Radio className="h-3 w-3" /> LIVE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider text-muted-foreground">
            <CircleSlash className="h-3 w-3" /> OFF
          </span>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
          Could not reach the monitor. Retrying…
        </p>
      ) : !anyLive ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs leading-relaxed text-muted-foreground">
          {enabledCount > 0
            ? "Connected nodes are not emitting data right now. Start a GPU process or toggle a URL on in System → GPU."
            : "No GPU sources enabled. Add a URL in System → GPU to see live performance here."}
        </p>
      ) : (
        <>
          {/* Combined totals */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {agg.avgCpu !== null && (
              <Stat
                icon={<Gauge className="h-3 w-3" />}
                label="Average CPU"
                value={`${Math.round(agg.avgCpu)}%`}
                bar={<Bar value={agg.avgCpu} className="bg-cyan-500" />}
              />
            )}
            {agg.totalMemoryGb > 0 && (
              <Stat
                icon={<MemoryStick className="h-3 w-3" />}
                label="Memory"
                value={`${agg.totalMemoryUsedGb.toFixed(1)}/${agg.totalMemoryGb.toFixed(1)} GB`}
                bar={<Bar value={memPct} className="bg-purple-500" />}
              />
            )}
            {agg.maxTemp !== null && (
              <Stat
                icon={<Thermometer className="h-3 w-3" />}
                label="Hottest node"
                value={`${Math.round(agg.maxTemp)}°C`}
              />
            )}
            {agg.avgBattery !== null && (
              <Stat
                icon={<BatteryMedium className="h-3 w-3" />}
                label="Battery"
                value={`${Math.round(agg.avgBattery)}%`}
              />
            )}
          </div>

          {/* Per-node breakdown */}
          <div className="space-y-2">
            {nodes.map((n) => {
              const m = n.metrics;
              const nodeMemPct =
                m.memoryTotalGb != null && m.memoryTotalGb > 0 && m.memoryUsedGb != null
                  ? (m.memoryUsedGb / m.memoryTotalGb) * 100
                  : m.memoryPercent ?? 0;
              return (
                <div key={n.id} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-semibold">{n.name || "Cloud machine"}</p>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {isCurrentlyLive ? "live" : "last data"}
                      </span>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  </div>

                  {m.cpu !== null && (
                    <div className="mt-2 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Cpu className="h-3 w-3" /> CPU
                        </span>
                        <span className="tabular-nums">{Math.round(m.cpu)}%</span>
                      </div>
                      <Bar value={m.cpu} className="bg-cyan-500" />
                    </div>
                  )}

                  {m.memoryPercent !== null && (
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MemoryStick className="h-3 w-3" /> Memory
                        </span>
                        <span className="tabular-nums">{Math.round(nodeMemPct)}%</span>
                      </div>
                      <Bar value={nodeMemPct} className="bg-purple-500" />
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {m.memoryUsedGb != null && m.memoryTotalGb != null && (
                      <MiniStat icon={<MemoryStick className="h-3 w-3" />} text={`${m.memoryUsedGb.toFixed(1)}/${m.memoryTotalGb.toFixed(1)} GB`} />
                    )}
                    {m.cpuFreq != null && (
                      <MiniStat icon={<Zap className="h-3 w-3" />} text={`${Math.round(m.cpuFreq)} MHz`} />
                    )}
                    {m.temperature != null && (
                      <MiniStat icon={<Thermometer className="h-3 w-3" />} text={`${Math.round(m.temperature)}°C`} />
                    )}
                    {m.batteryPercent != null && (
                      <MiniStat icon={<BatteryMedium className="h-3 w-3" />} text={`${Math.round(m.batteryPercent)}%`} />
                    )}
                    {m.uptime && <MiniStat icon={<Activity className="h-3 w-3" />} text={m.uptime} />}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-[10px] text-muted-foreground">
        {anyLive
          ? `${isCurrentlyLive ? "Updated every 3s" : "Reconnecting… last data"} · configured in System → GPU`
          : "Configured in System → GPU"}
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  bar,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  bar?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-2">
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums">{value}</p>
      {bar}
    </div>
  );
}

function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", className)}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}

function MiniStat({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      {icon}
      {text}
    </span>
  );
}
