// ━━ Client Polling Endpoint — Returns which agents need autonomous thinking ━━
// This replaces Vercel Cron for free-plan compatibility.
// The agents page polls this endpoint every 30s and triggers thinking cycles client-side.
// Lightweight: just DB queries, no AI calls.

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAutonomyTables } from "@/lib/ensure-autonomy-tables"
import { isAdmin } from "@/lib/rbac"
import { initAutonomyConfigs } from "@/lib/ai/autonomy-engine"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // CRITICAL: Ensure tables exist + configs before any DB operations
    await ensureAutonomyTables()
    await initAutonomyConfigs()

    // Find agents that are due for a thinking cycle
    const now = new Date()
    const dueAgents = await db.agentAutonomyConfig.findMany({
      where: {
        enabled: true,
        status: "RUNNING",
        agent: { type: { not: "DEV" }, status: { not: "RUNNING" } },
        nextRunAt: { lte: now },
      },
      include: {
        agent: {
          select: { id: true, name: true, type: true, status: true, model: true },
        },
      },
      orderBy: { nextRunAt: "asc" },
      take: 3, // Max 3 agents at a time to avoid overloading
    })

    // Also find agents currently being executed by another user's browser
    const currentlyRunning = await db.agentAutonomyConfig.findMany({
      where: {
        enabled: true,
        status: "RUNNING",
        agent: { type: { not: "DEV" }, status: "RUNNING" },
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
      },
      take: 5,
    })

    // Get recent activity (last 10 logs across all agents)
    const recentActivity = await db.agentActivityLog.findMany({
      where: {
        agent: { type: { not: "DEV" } },
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    // Get pending approval count
    const pendingApprovals = await db.approval.count({
      where: {
        status: "PENDING",
        requesterType: "AI",
      },
    })

    // Get inter-agent message count
    const pendingInterAgent = await db.crossAgentMessage.count({
      where: { status: "PENDING" },
    })

    return NextResponse.json({
      dueAgents: dueAgents.map(c => ({
        configId: c.id,
        agentId: c.agent.id,
        agentName: c.agent.name,
        agentType: c.agent.type,
        agentStatus: c.agent.status,
        model: c.agent.model,
        interval: c.interval,
        totalRuns: c.totalRuns,
        totalErrors: c.totalErrors,
        lastRunAt: c.lastRunAt,
      })),
      recentActivity: recentActivity.map(log => ({
        id: log.id,
        agentId: log.agentId,
        agentName: log.agent.name,
        agentType: log.agent.type,
        action: log.action,
        title: log.title,
        status: log.status,
        tokensUsed: log.tokensUsed,
        cost: log.cost,
        duration: log.duration,
        createdAt: log.createdAt,
      })),
      pendingApprovals,
      pendingInterAgent,
      currentlyRunning: currentlyRunning.map(c => ({
        agentId: c.agent.id,
        agentName: c.agent.name,
        agentType: c.agent.type,
        startedBy: c.startedBy,
        startedByRole: c.startedByRole,
        lastRunAt: c.lastRunAt,
      })),
      polledAt: now.toISOString(),
    })
  } catch (error: any) {
    console.error("[autonomy/poll] Error:", error.message)
    return NextResponse.json({ error: "Failed to poll autonomy status", dueAgents: [], recentActivity: [] }, { status: 500 })
  }
}
