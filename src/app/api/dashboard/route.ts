import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { loadDashboardPayload } from "@/lib/dashboard-data"

// PERF: Allow up to 15s for the dashboard route
export const maxDuration = 15

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const result = await loadDashboardPayload(session.user.id, session.user.role)
    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error: unknown) {
    console.error("[dashboard] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
