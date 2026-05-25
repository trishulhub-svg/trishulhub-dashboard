import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/agents - List agents (filtered by user access)
// GET /api/agents?id=xxx - Single agent fetch (optimized, no full list query)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    // CRITICAL FIX: Return 401 if not authenticated - previously leaked all agent data
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    const userId = session.user.id

    // ── Single agent fetch (optimized) ──
    const { searchParams } = new URL(req.url)
    const singleId = searchParams.get("id")
    if (singleId) {
      const agent = await db.agent.findFirst({
        where: {
          id: singleId,
          // Only return if user has view access (or is admin)
          ...(!["SUPER_ADMIN", "ADMIN"].includes(userRole) ? { userAccess: { some: { userId, canView: true } } } : {}),
        },
        include: {
          apiKey: { select: { id: true, keyName: true, provider: true, status: true } },
          roleConfig: true,
          _count: {
            select: { conversations: true, chats: { where: { status: "ACTIVE" } } }
          },
          userAccess: { where: { userId }, select: { canChat: true, canView: true, canApprove: true } },
        },
      })
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
      // Apply githubToken masking for non-SUPER_ADMIN
      if (userRole !== "SUPER_ADMIN" && agent.roleConfig) {
        if (agent.type !== "DEV") {
          agent.roleConfig.githubToken = ""
          agent.roleConfig.githubRepo = ""
        } else {
          agent.roleConfig.githubToken = agent.roleConfig.githubToken
            ? `${agent.roleConfig.githubToken.substring(0, 4)}...${agent.roleConfig.githubToken.slice(-4)}`
            : ""
        }
      }
      return NextResponse.json(JSON.parse(JSON.stringify(agent)))
    }

    // ── Full agent list (original behavior) ──

    const agents = await db.agent.findMany({
      include: {
        apiKey: { select: { id: true, keyName: true, provider: true, status: true } },
        roleConfig: true,
        _count: {
          select: {
            conversations: true,
            chats: { where: { status: "ACTIVE" } },
          }
        },
        userAccess: userId ? {
          where: { userId },
          select: { canChat: true, canView: true, canApprove: true }
        } : false,
      },
      orderBy: { createdAt: "asc" },
      // FIX: Use Prisma where clause for agent type filtering instead of JS filtering
      // Non-super-admin users should only see agents they have access to
      ...(userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" ? {
        where: {
          userAccess: {
            some: { userId, canView: true }
          }
        }
      } : {}),
    })

    // SECURITY: Mask githubToken for non-SUPER_ADMIN users
    // Developers already filtered by Prisma where clause above
    if (userRole !== "SUPER_ADMIN") {
      const sanitized = agents.map(agent => {
        if (agent.roleConfig && agent.type !== "DEV" && userRole !== "SUPER_ADMIN") {
          return {
            ...agent,
            roleConfig: {
              ...agent.roleConfig,
              githubToken: "",
              githubRepo: "",
            }
          }
        }
        // Mask githubToken for all non-super-admin users even for DEV agent
        if (agent.roleConfig && userRole !== "SUPER_ADMIN") {
          return {
            ...agent,
            roleConfig: {
              ...agent.roleConfig,
              githubToken: agent.roleConfig.githubToken
                ? `${agent.roleConfig.githubToken.substring(0, 4)}...${agent.roleConfig.githubToken.slice(-4)}`
                : "",
            }
          }
        }
        return agent
      })
      // ZAI FIX #310: JSON round-trip to strip any non-serializable values
      return NextResponse.json(JSON.parse(JSON.stringify(sanitized)))
    }

    // ZAI FIX #310: JSON round-trip to strip any non-serializable values
    return NextResponse.json(JSON.parse(JSON.stringify(agents)))
  } catch (error: any) {
    console.error("[agents] GET error:", error.message); return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 })
  }
}

// PATCH /api/agents - Update agent settings
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only admins can update agent settings" }, { status: 403 })
    }

    const body = await req.json()
    const { id, roleConfig, ...data } = body

    if (!id) {
      return NextResponse.json({ error: "Agent ID required" }, { status: 400 })
    }

    // SECURITY: Whitelist allowed fields for agent update (prevent mass assignment)
    const allowedAgentFields = ["name", "description", "systemPrompt", "model", "status", "apiKeyId"]
    const sanitizedAgentData: Record<string, any> = {}
    for (const key of allowedAgentFields) {
      if (data[key] !== undefined) {
        sanitizedAgentData[key] = data[key]
      }
    }

    // Update agent basic data
    const agent = await db.agent.update({
      where: { id },
      data: sanitizedAgentData,
      include: { roleConfig: true },
    })

    // Update role config if provided
    if (roleConfig) {
      // SECURITY: Only allow GitHub fields for DEV agent type
      const isDevAgent = agent.type === "DEV"
      const githubRepo = isDevAgent ? (roleConfig.githubRepo ?? "") : ""
      const githubToken = isDevAgent ? (roleConfig.githubToken ?? "") : ""
      const autoPushEnabled = isDevAgent ? (roleConfig.autoPushEnabled ?? false) : false

      await db.agentRoleConfig.upsert({
        where: { agentId: id },
        create: {
          agentId: id,
          rolePrompt: roleConfig.rolePrompt || agent.systemPrompt,
          quickActions: JSON.stringify(roleConfig.quickActions || []),
          specialCommands: JSON.stringify(roleConfig.specialCommands || []),
          features: JSON.stringify(roleConfig.features || {}),
          suggestedPrompts: JSON.stringify(roleConfig.suggestedPrompts || []),
          autoWorkflows: JSON.stringify(roleConfig.autoWorkflows || []),
          githubRepo,
          githubToken,
          autoPushEnabled,
        },
        update: {
          ...(roleConfig.rolePrompt !== undefined && { rolePrompt: roleConfig.rolePrompt }),
          ...(roleConfig.quickActions !== undefined && { quickActions: JSON.stringify(roleConfig.quickActions) }),
          ...(roleConfig.specialCommands !== undefined && { specialCommands: JSON.stringify(roleConfig.specialCommands) }),
          ...(roleConfig.features !== undefined && { features: JSON.stringify(roleConfig.features) }),
          ...(roleConfig.suggestedPrompts !== undefined && { suggestedPrompts: JSON.stringify(roleConfig.suggestedPrompts) }),
          ...(roleConfig.autoWorkflows !== undefined && { autoWorkflows: JSON.stringify(roleConfig.autoWorkflows) }),
          // GitHub fields: only set for DEV agent, always clear for others
          ...(isDevAgent && roleConfig.githubRepo !== undefined && { githubRepo: roleConfig.githubRepo }),
          ...(isDevAgent && roleConfig.githubToken !== undefined && { githubToken: roleConfig.githubToken }),
          ...(isDevAgent && roleConfig.autoPushEnabled !== undefined && { autoPushEnabled: roleConfig.autoPushEnabled }),
          ...(!isDevAgent && { githubRepo: "", githubToken: "", autoPushEnabled: false }),
        }
      })
    }

    // Refetch with role config
    const updated = await db.agent.findUnique({
      where: { id },
      include: { roleConfig: true },
    })

    return NextResponse.json(JSON.parse(JSON.stringify(updated)))
  } catch (error: any) {
    console.error("[agents] PATCH error:", error.message, error.stack)
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 })
  }
}
