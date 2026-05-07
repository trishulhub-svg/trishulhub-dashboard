// ━━ Autonomy Activity Log API ━━
// GET: Get activity logs for an agent or all agents

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAutonomyTables } from "@/lib/ensure-autonomy-tables"
import { isAdmin } from "@/lib/rbac"

// GET /api/agents/autonomy/activity?agentId=xxx&limit=50
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Ensure autonomy tables exist
    await ensureAutonomyTables()

    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)

    const where: any = {}
    if (agentId) where.agentId = agentId

    const logs = await db.agentActivityLog.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    // Get summary stats
    const stats = await db.agentActivityLog.groupBy({
      by: ["agentId", "status"],
      _count: true,
    })

    return NextResponse.json({
      logs: logs.map(log => ({
        id: log.id,
        agentId: log.agentId,
        agentName: log.agent.name,
        agentType: log.agent.type,
        action: log.action,
        title: log.title,
        description: log.description,
        result: log.result ? JSON.parse(log.result) : null,
        status: log.status,
        tokensUsed: log.tokensUsed,
        cost: log.cost,
        duration: log.duration,
        createdAt: log.createdAt,
      })),
      stats,
    })
  } catch (error: any) {
    console.error("[autonomy/activity] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
