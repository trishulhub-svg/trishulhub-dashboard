/**
 * GET /api/bootstrap/workspace
 * Workspace page: live-ops + whether current user has an ACTIVE session.
 * One session check; same auth as live-ops / time-tracking.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { loadLiveOpsPayload } from "@/lib/workspace-live-ops"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-workspace")
    if ("error" in auth) return auth.error

    const payload = await loadLiveOpsPayload(auth.session.user.id)
    return NextResponse.json(payload)
  } catch (error: unknown) {
    console.error(
      "[bootstrap/workspace] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json(
      {
        error: "An error occurred",
        activeUsers: [],
        liveProjects: [],
        hasActiveSession: false,
      },
      { status: 500 }
    )
  }
}
