/**
 * Shared GPU / performance metric helpers.
 *
 * Used by the Cloud Systems Telemetry card and the Live Operations feed so
 * both render the same numbers from the same source (a single poll of
 * /api/gpu/status on the workspace page).
 */

export type NodeMetrics = {
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
  healthMessage: string | null;
  cpuName: string | null;
  network: string | null;
  cpuMaxFreq: number | null;
  cpuPerformancePercent: number | null;
  cpuFrequencyPercent: number | null;
  cpuFrequencyReductionPercent: number | null;
  cpuPerformanceLimitPercent: number | null;
  performanceState: string | null;
  telemetrySource: string | null;
  codexRunning: boolean | null;
  codexRamMb: number | null;
  nodeRunning: boolean | null;
  nodeRamMb: number | null;
  cloudflareRunning: boolean | null;
  cloudflareRamMb: number | null;
};

export type GpuResult = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  data: Record<string, unknown> | null;
  fetchedAt: string;
};

export type GpuStatus = {
  enabled: GpuResult[];
  results: GpuResult[];
  anyLive: boolean;
};

/** Combined, human-readable totals across every live node. */
export type GpuAggregate = {
  nodeCount: number;
  avgCpu: number | null;
  totalMemoryUsedGb: number;
  totalMemoryGb: number;
  maxTemp: number | null;
  avgBattery: number | null;
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

/** Normalize either the JSON or HTML monitor format into a common shape. */
export function extractMetrics(data: Record<string, unknown>): NodeMetrics {
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
  const bool = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null;
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
    healthMessage: str(data.healthMessage ?? nested.healthMessage),
    cpuName: str(data.cpuName ?? nested.cpuName),
    network: str(data.network ?? nested.network),
    cpuMaxFreq:
      get("cpu_max_mhz", "cpuMaxMhz", "max_clock_mhz") ??
      getN("cpu_max_mhz", "max_clock_mhz"),
    cpuPerformancePercent:
      get("cpu_performance_percent", "cpuPerformancePercent", "performance_percent") ??
      getN("cpu_performance_percent", "performance_percent"),
    cpuFrequencyPercent:
      get("cpu_frequency_percent", "cpuFrequencyPercent", "frequency_percent") ??
      getN("cpu_frequency_percent", "frequency_percent"),
    cpuFrequencyReductionPercent:
      get(
        "cpu_frequency_reduction_percent",
        "cpuFrequencyReductionPercent",
        "frequency_reduction_percent"
      ) ?? getN("cpu_frequency_reduction_percent", "frequency_reduction_percent"),
    cpuPerformanceLimitPercent:
      get(
        "cpu_performance_limit_percent",
        "cpuPerformanceLimitPercent",
        "performance_limit_percent"
      ) ?? getN("cpu_performance_limit_percent", "performance_limit_percent"),
    performanceState: str(data.performanceState ?? nested.performanceState),
    telemetrySource: str(data.telemetrySource ?? nested.telemetrySource),
    codexRunning: bool(data.codexRunning ?? nested.codexRunning),
    codexRamMb: get("codexRamMb", "codex_ram_mb") ?? getN("codexRamMb", "codex_ram_mb"),
    nodeRunning: bool(data.nodeRunning ?? nested.nodeRunning),
    nodeRamMb: get("nodeRamMb", "node_ram_mb") ?? getN("nodeRamMb", "node_ram_mb"),
    cloudflareRunning: bool(data.cloudflareRunning ?? nested.cloudflareRunning),
    cloudflareRamMb:
      get("cloudflareRamMb", "cloudflare_ram_mb") ??
      getN("cloudflareRamMb", "cloudflare_ram_mb"),
  };
}

/** Live results with per-node metrics + combined totals across all nodes. */
export function aggregateGpuResults(
  results: GpuResult[],
  staleMs = 20_000
): { nodes: Array<GpuResult & { metrics: NodeMetrics }>; agg: GpuAggregate } {
  const now = Date.now();
  const nodes = results
    .filter((r) => r.ok)
    .map((r) => ({ ...r, stale: now - new Date(r.fetchedAt).getTime() > staleMs }))
    .filter((r) => !r.stale)
    .map((r) => ({ ...r, metrics: extractMetrics(r.data || {}) }));

  const agg: GpuAggregate = {
    nodeCount: nodes.length,
    avgCpu: null,
    totalMemoryUsedGb: 0,
    totalMemoryGb: 0,
    maxTemp: null,
    avgBattery: null,
  };
  if (nodes.length === 0) return { nodes, agg };

  const cpuVals = nodes.filter((n) => n.metrics.cpu !== null).map((n) => n.metrics.cpu as number);
  const tempVals = nodes.filter((n) => n.metrics.temperature !== null).map((n) => n.metrics.temperature as number);
  const batVals = nodes.filter((n) => n.metrics.batteryPercent !== null).map((n) => n.metrics.batteryPercent as number);

  agg.avgCpu = cpuVals.length ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length : null;
  agg.totalMemoryUsedGb = nodes.reduce((s, n) => s + (n.metrics.memoryUsedGb ?? 0), 0);
  agg.totalMemoryGb = nodes.reduce((s, n) => s + (n.metrics.memoryTotalGb ?? 0), 0);
  agg.maxTemp = tempVals.length ? Math.max(...tempVals) : null;
  agg.avgBattery = batVals.length ? batVals.reduce((a, b) => a + b, 0) / batVals.length : null;
  return { nodes, agg };
}
