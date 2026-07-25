import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { loadLiveOpsPayload } from "@/lib/workspace-live-ops"

/**
 * GET /api/workspace/live-ops
 *
 * Live Operations feed for the TrishulHub Workspace page.
 * Auth: browser session via getServerSession (NOT agent JWT).
 *
 * Returns:
 *   - activeUsers:  every user currently clocked in
 *   - liveProjects: Long Horizon — all active clocked-in projects, filled
 *                   with recent incomplete projects up to 3 when needed
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(
      `workspace-live-ops-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { activeUsers, liveProjects } = await loadLiveOpsPayload(session.user.id)
    return NextResponse.json({ activeUsers, liveProjects })
  } catch (error: unknown) {
    console.error(
      "[api/workspace/live-ops] GET error:",
      error instanceof Error ? error.message : error
    )
    return NextResponse.json(
      { error: "An error occurred", activeUsers: [], liveProjects: [] },
      { status: 500 }
    )
  }
}
