// ━━ Autonomy Configuration API ━━
// GET: Get autonomy status for all agents
// PATCH: Update autonomy config (toggle, interval)

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAutonomyStatus, toggleAgentAutonomy, toggleAllAutonomy, updateAgentInterval, initAutonomyConfigs } from "@/lib/ai/autonomy-engine"
import { isAdmin } from "@/lib/rbac"

// ━━ Auto-migration for Turso ━━
let migrationAttempted = false
async function ensureAutonomyTables(): Promise<void> {
  if (migrationAttempted) return
  migrationAttempted = true
  try {
    await db.$queryRawUnsafe(`SELECT 1 FROM AgentAutonomyConfig LIMIT 0`)
  } catch {
    // Trigger migration via cron endpoint (which handles full migration)
    console.log("[autonomy] Tables not yet available, initializing...")
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""
    if (baseUrl) {
      await fetch(`${baseUrl}/api/agents/autonomy/cron`, { method: "POST" }).catch(() => {})
    }
  }
}

// GET /api/agents/autonomy — Get status of all autonomous agents
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Initialize configs if needed
    await ensureAutonomyTables()
    await initAutonomyConfigs()

    const status = await getAutonomyStatus()
    return NextResponse.json(status)
  } catch (error: any) {
    console.error("[autonomy] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/agents/autonomy — Toggle autonomy
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { action, agentId, enabled, interval } = body

    switch (action) {
      case "toggle": {
        // Toggle a specific agent
        if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
        const result = await toggleAgentAutonomy(agentId, enabled ?? true)
        if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
        return NextResponse.json({ success: true, message: `Agent ${enabled ? "enabled" : "paused"}` })
      }

      case "toggleAll": {
        // Toggle all agents (global pause/resume)
        const result = await toggleAllAutonomy(enabled ?? false)
        return NextResponse.json({ success: true, message: `${result.toggled} agents ${enabled ? "enabled" : "paused"}`, toggled: result.toggled })
      }

      case "updateInterval": {
        // Update thinking interval for an agent
        if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
        if (!interval) return NextResponse.json({ error: "interval is required" }, { status: 400 })
        const result = await updateAgentInterval(agentId, interval)
        if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
        return NextResponse.json({ success: true, message: `Interval set to ${interval} minutes` })
      }

      case "restart": {
        // Restart a specific agent (clear error, re-enable)
        if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
        const agent = await db.agent.findUnique({ where: { id: agentId } })
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

        await toggleAgentAutonomy(agentId, true)
        return NextResponse.json({ success: true, message: "Agent restarted" })
      }

      default:
        return NextResponse.json({ error: "Invalid action. Use: toggle, toggleAll, updateInterval, restart" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[autonomy] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
