// ━━ Autonomy Configuration API ━━
// GET: Get autonomy status for all agents
// PATCH: Update autonomy config (toggle, interval)

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAutonomyTables } from "@/lib/ensure-autonomy-tables"
import { getAutonomyStatus, toggleAgentAutonomy, toggleAllAutonomy, updateAgentInterval, initAutonomyConfigs } from "@/lib/ai/autonomy-engine"
import { isAdmin } from "@/lib/rbac"

// GET /api/agents/autonomy — Get status of all autonomous agents
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // CRITICAL: Ensure tables exist in Turso before any DB operations
    await ensureAutonomyTables()
    await initAutonomyConfigs()

    const status = await getAutonomyStatus()
    return NextResponse.json(status)
  } catch (error: any) {
    console.error("[autonomy] GET error:", error.message)
    return NextResponse.json({ error: "Failed to fetch autonomy status" }, { status: 500 })
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

    // CRITICAL: Ensure tables exist + init configs BEFORE any DB operations
    await ensureAutonomyTables()
    await initAutonomyConfigs()

    switch (action) {
      case "toggle": {
        // Toggle a specific agent with role-based hierarchy
        if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })

        // Verify agent exists before proceeding
        const agentExists = await db.agent.findUnique({ where: { id: agentId }, select: { id: true } })
        if (!agentExists) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

        const userRole = session.user.role as string
        const userId = session.user.id as string
        const wantEnabled = enabled ?? true

        // Get current autonomy config
        const currentConfig = await db.agentAutonomyConfig.findUnique({
          where: { agentId },
        })

        // HIERARCHY LOGIC
        if (wantEnabled) {
          // User wants to START the agent
          if (isAdmin(userRole)) {
            // SUPER_ADMIN or ADMIN — always allowed, overrides everyone
            // Just proceed with the toggle
          } else {
            // DEVELOPER or other non-admin role
            if (currentConfig?.startedBy && currentConfig?.startedByRole) {
              const starterRole = currentConfig.startedByRole
              if (starterRole === "SUPER_ADMIN" || starterRole === "ADMIN") {
                // An admin started this agent — non-admin CANNOT override
                return NextResponse.json({
                  error: `Cannot override — agent was started by ${starterRole === "SUPER_ADMIN" ? "Super Admin" : "Admin"}`,
                  code: "ADMIN_LOCKED",
                }, { status: 403 })
              }
              // If started by another developer, allow override
            }
          }
        }

        // Perform the toggle
        const result = await toggleAgentAutonomy(agentId, wantEnabled)
        if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

        // Update startedBy info
        if (wantEnabled) {
          await db.agentAutonomyConfig.update({
            where: { agentId },
            data: {
              startedBy: userId,
              startedByRole: userRole,
            },
          })
        } else {
          // Clear startedBy when stopped
          await db.agentAutonomyConfig.update({
            where: { agentId },
            data: {
              startedBy: null,
              startedByRole: null,
            },
          })
        }

        return NextResponse.json({
          success: true,
          message: `Agent ${wantEnabled ? "enabled" : "paused"}`,
          startedBy: wantEnabled ? userId : null,
          startedByRole: wantEnabled ? userRole : null,
        })
      }

      case "toggleAll": {
        // Toggle all agents (global pause/resume)
        // Only SUPER_ADMIN can toggle all — prevent ADMIN from overriding SUPER_ADMIN
        if (session.user.role !== "SUPER_ADMIN") {
          return NextResponse.json({ error: "Only Super Admin can toggle all agents" }, { status: 403 })
        }
        const result = await toggleAllAutonomy(enabled ?? false)

        // Update startedBy for all configs
        if (enabled) {
          await db.agentAutonomyConfig.updateMany({
            where: {
              agent: { type: { not: "DEV" } },
            },
            data: {
              startedBy: session.user.id,
              startedByRole: session.user.role,
            },
          })
        } else {
          await db.agentAutonomyConfig.updateMany({
            where: {},
            data: {
              startedBy: null,
              startedByRole: null,
            },
          })
        }

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

        // Update startedBy
        await db.agentAutonomyConfig.update({
          where: { agentId },
          data: {
            startedBy: session.user.id,
            startedByRole: session.user.role,
          },
        })

        return NextResponse.json({ success: true, message: "Agent restarted" })
      }

      default:
        return NextResponse.json({ error: "Invalid action. Use: toggle, toggleAll, updateInterval, restart" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[autonomy] PATCH error:", error.message)
    return NextResponse.json({ error: "Failed to update autonomy config" }, { status: 500 })
  }
}
