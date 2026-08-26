import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { fetchAllGpuStatus } from "@/lib/gpu-monitor"

/**
 * GET /api/gpu/status
 * Any authenticated user can read the live GPU status (used by the workspace).
 * Fetches every enabled URL with a short timeout; returns per-URL results.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const rl = rateLimit(`gpu-status-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const status = await fetchAllGpuStatus()
    return NextResponse.json(status)
  } catch (err) {
    console.error("[gpu/status] GET", err)
    return NextResponse.json({ enabled: [], results: [], anyLive: false }, { status: 200 })
  }
}
