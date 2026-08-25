import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isSuperAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  getGpuMonitorConfig,
  saveGpuMonitorConfig,
  GPU_MONITOR_MAX_URLS,
  type GpuMonitorUrl,
} from "@/lib/gpu-monitor"

/**
 * GET /api/system/gpu — GPU monitor config (Super Admin only).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isSuperAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const config = await getGpuMonitorConfig()
    return NextResponse.json({ config, maxUrls: GPU_MONITOR_MAX_URLS })
  } catch (err) {
    console.error("[system/gpu] GET", err)
    return NextResponse.json({ error: "Failed to load GPU monitor config" }, { status: 500 })
  }
}

/**
 * PUT /api/system/gpu — save GPU monitor config (Super Admin only).
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isSuperAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`gpu-config-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const rawUrls = Array.isArray(body.urls) ? body.urls : []
    const config = await saveGpuMonitorConfig({ urls: rawUrls })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "SYSTEM",
      page: "settings",
      action: "CONFIG_CHANGE",
      entityType: "GpuMonitorConfig",
      entityId: "gpu_monitor_config",
      description: `Updated GPU monitor: ${config.urls.length} URL(s), ${config.urls.filter((u) => u.enabled).length} enabled`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ ok: true, config, maxUrls: GPU_MONITOR_MAX_URLS })
  } catch (err) {
    console.error("[system/gpu] PUT", err)
    return NextResponse.json({ error: "Failed to save GPU monitor config" }, { status: 500 })
  }
}
