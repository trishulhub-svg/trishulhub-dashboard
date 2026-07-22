/**
 * GET /api/bootstrap/home
 * Home dashboard: dashboard payload + self earnings + week hours (developers).
 * One session check; same RBAC stripping as /api/dashboard + /api/earnings.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import {
  loadDashboardPayload,
  loadSelfEarnings,
  loadWeekHoursForUser,
} from "@/lib/dashboard-data"

export const maxDuration = 15

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-home")
    if ("error" in auth) return auth.error

    const userId = auth.session.user.id
    const role = auth.session.user.role
    const isDeveloper = role === "DEVELOPER"

    const [dash, earnings, weekHours] = await Promise.all([
      loadDashboardPayload(userId, role),
      loadSelfEarnings(userId),
      isDeveloper ? loadWeekHoursForUser(userId) : Promise.resolve(null),
    ])

    if (dash.status !== 200) {
      return NextResponse.json({ error: dash.error }, { status: dash.status })
    }

    return NextResponse.json({
      dashboard: dash.data,
      earnings,
      weekHours,
    })
  } catch (error: unknown) {
    console.error(
      "[bootstrap/home] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "Failed to load home bootstrap" }, { status: 500 })
  }
}
