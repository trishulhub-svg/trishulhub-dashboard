/**
 * Trishul Cloud Process — GPU / performance live monitor.
 *
 * Super Admins configure up to 3 URLs (e.g. a Cloudflare tunnel exposing GPU
 * metrics) in System → GPU. Each URL has an on/off toggle. When enabled, the
 * workspace polls the URL every 3s and renders live GPU + performance visuals.
 * If no URL is enabled (or none respond), the workspace shows its normal view.
 *
 * Vercel Hobby-friendly: polling happens client-side (browser → URL), the
 * server only stores config and optionally proxies a lightweight health check.
 */

import { db } from "@/lib/db"

export const GPU_MONITOR_SETTING_KEY = "gpu_monitor_config"
export const GPU_MONITOR_MAX_URLS = 3

export type GpuMonitorUrl = {
  id: string
  name: string
  url: string
  enabled: boolean
}

export type GpuMonitorConfig = {
  urls: GpuMonitorUrl[]
}

export function emptyGpuMonitorConfig(): GpuMonitorConfig {
  return { urls: [] }
}

function newId() {
  return `gpu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeUrl(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const url = raw.trim()
  if (!url) return ""
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return ""
    return url
  } catch {
    return ""
  }
}

export async function getGpuMonitorConfig(): Promise<GpuMonitorConfig> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: GPU_MONITOR_SETTING_KEY } })
    if (!row?.value) return emptyGpuMonitorConfig()
    const parsed = JSON.parse(row.value) as { urls?: unknown }
    const urls = Array.isArray(parsed.urls) ? parsed.urls : []
    return {
      urls: urls
        .filter(
          (u): u is GpuMonitorUrl =>
            typeof u === "object" &&
            u !== null &&
            typeof (u as GpuMonitorUrl).id === "string" &&
            typeof (u as GpuMonitorUrl).url === "string"
        )
        .slice(0, GPU_MONITOR_MAX_URLS)
        .map((u) => ({
          id: u.id,
          name: typeof u.name === "string" ? u.name : u.url,
          url: u.url,
          enabled: u.enabled === true,
        })),
    }
  } catch {
    return emptyGpuMonitorConfig()
  }
}

/** Save the full config (called from System → GPU). */
export async function saveGpuMonitorConfig(input: {
  urls: Array<{ id?: string; name?: string; url: string; enabled?: boolean }>
}): Promise<GpuMonitorConfig> {
  const existing = await getGpuMonitorConfig()
  const byId = new Map(existing.urls.map((u) => [u.id, u]))

  const urls: GpuMonitorUrl[] = []
  for (const item of (input.urls || []).slice(0, GPU_MONITOR_MAX_URLS)) {
    const cleanUrl = sanitizeUrl(item.url)
    if (!cleanUrl) continue
    const id = item.id && byId.has(item.id) ? item.id : newId()
    urls.push({
      id,
      name: (item.name || "").trim() || cleanUrl,
      url: cleanUrl,
      enabled: item.enabled === true,
    })
  }

  const config: GpuMonitorConfig = { urls }
  await db.appSetting.upsert({
    where: { key: GPU_MONITOR_SETTING_KEY },
    create: { key: GPU_MONITOR_SETTING_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  })
  return config
}

/** Enabled URLs (for the workspace live monitor). */
export async function getEnabledGpuUrls(): Promise<GpuMonitorUrl[]> {
  const config = await getGpuMonitorConfig()
  return config.urls.filter((u) => u.enabled && u.url)
}

/**
 * Fetch a single GPU endpoint with a short timeout. Returns parsed JSON or null.
 * The URL is user-configured (Super Admin) — we only ever GET it.
 */
export async function fetchGpuUrl(url: string, timeoutMs = 3000): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      if (!res.ok) return null
      const text = await res.text()
      try {
        const json = JSON.parse(text) as unknown
        if (json && typeof json === "object") return json as Record<string, unknown>
      } catch {
        return null
      }
      return null
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/**
 * Fetch all enabled GPU URLs concurrently. Returns per-URL status + merged data
 * so the workspace can render live visuals.
 */
export async function fetchAllGpuStatus(): Promise<{
  enabled: GpuMonitorUrl[]
  results: Array<{ id: string; name: string; url: string; ok: boolean; data: Record<string, unknown> | null; fetchedAt: string }>
  anyLive: boolean
}> {
  const enabled = await getEnabledGpuUrls()
  const results = await Promise.all(
    enabled.map(async (u) => {
      const data = await fetchGpuUrl(u.url)
      return {
        id: u.id,
        name: u.name,
        url: u.url,
        ok: !!data,
        data,
        fetchedAt: new Date().toISOString(),
      }
    })
  )
  return { enabled, results, anyLive: results.some((r) => r.ok) }
}
