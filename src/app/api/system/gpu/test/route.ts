import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canManageGpuMonitor } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { fetchGpuUrl } from "@/lib/gpu-monitor"

/**
 * POST /api/system/gpu/test
 * Probe a single GPU monitor URL (Admin/Super Admin only). Server-side fetch so the
 * browser never hits CORS; returns parsed metrics if the endpoint responds.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageGpuMonitor(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`gpu-test-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const url = String(body.url || "")
    try {
      const u = new URL(url)
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 })
    }

    const data = await fetchGpuUrl(url, 6000)
    if (!data) {
      return NextResponse.json({
        ok: false,
        error: "No data returned — the URL should expose a JSON or TrishulHub Monitor page.",
      })
    }
    return NextResponse.json({ ok: true, metrics: data })
  } catch (err) {
    console.error("[system/gpu/test] POST", err)
    return NextResponse.json({ ok: false, error: "Probe failed" }, { status: 500 })
  }
}
