import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/tasks/counts
// Returns { [projectId]: pendingCount } where pending = status !== "DONE"
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limit
    const rl = rateLimit(`tasks-counts-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const userId = session.user.id
    const userRole = session.user.role

    // Developers only see tasks from their assigned projects
    const assignedProjectIds = await getAssignedProjectIds(userId, userRole)

    const where: { status: Record<string, string>; projectId?: { in: string[] } } = {
      status: { not: "DONE" }
    }

    if (assignedProjectIds) {
      where.projectId = { in: assignedProjectIds }
    }

    const counts = await db.task.groupBy({
      by: ["projectId"],
      where,
      _count: { id: true }
    })

    // Convert to { [projectId]: count } — skip null projectId entries
    const result: Record<string, number> = {}
    for (const c of counts) {
      if (c.projectId) {
        result[c.projectId] = c._count.id
      }
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[tasks/counts] GET error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
