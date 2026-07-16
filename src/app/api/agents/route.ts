import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

/** Strip secrets from agent payloads — never return githubToken to any client. */
function sanitizeAgent<T extends {
  roleConfig?: {
    githubToken?: string | null
    githubRepo?: string | null
    [key: string]: unknown
  } | null
}>(agent: T, userRole: string) {
  if (!agent.roleConfig) return agent
  const isSuperAdmin = userRole === "SUPER_ADMIN"
  const isDev = (agent as { type?: string }).type === "DEV"
  const { githubToken: _token, ...restConfig } = agent.roleConfig
  return {
    ...agent,
    roleConfig: {
      ...restConfig,
      // Non-dev agents: never expose repo either
      githubRepo: isDev || isSuperAdmin ? (restConfig.githubRepo || "") : "",
      hasGithubToken: !!_token,
    },
  }
}

// GET /api/agents - List agents (filtered by user access)
// GET /api/agents?id=xxx - Single agent fetch (optimized, no full list query)
// NOTE: Legacy in-app Agents page was removed; Workspace uses /api/agent-auth + /api/agent.
// This route remains for any residual admin tooling — secrets are always stripped.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
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
          ...(!["SUPER_ADMIN", "ADMIN"].includes(userRole) ? { userAccess: { some: { userId, canView: true } } } : {}),
        },
        include: {
          roleConfig: true,
          _count: {
            select: { conversations: true, chats: { where: { status: "ACTIVE" } } }
          },
          userAccess: { where: { userId }, select: { canChat: true, canView: true, canApprove: true } },
        },
      })
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
      return NextResponse.json(JSON.parse(JSON.stringify(sanitizeAgent(agent, userRole))))
    }

    const agents = await db.agent.findMany({
      include: {
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
      ...(userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" ? {
        where: {
          userAccess: {
            some: { userId, canView: true }
          }
        }
      } : {}),
    })

    const sanitized = agents.map((agent) => sanitizeAgent(agent, userRole))
    return NextResponse.json(JSON.parse(JSON.stringify(sanitized)))
  } catch (error: unknown) {
    console.error("[agents] GET error:", error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined); return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 })
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
    const allowedAgentFields = ["name", "description", "systemPrompt", "model", "status"]
    const sanitizedAgentData: Record<string, unknown> = {}
    for (const key of allowedAgentFields) {
      if (data[key] !== undefined) {
        sanitizedAgentData[key] = data[key]
      }
    }

    const agent = await db.agent.update({
      where: { id },
      data: sanitizedAgentData,
      include: { roleConfig: true },
    })

    if (roleConfig) {
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
          ...(isDevAgent && roleConfig.githubRepo !== undefined && { githubRepo: roleConfig.githubRepo }),
          ...(isDevAgent && roleConfig.githubToken !== undefined && { githubToken: roleConfig.githubToken }),
          ...(isDevAgent && roleConfig.autoPushEnabled !== undefined && { autoPushEnabled: roleConfig.autoPushEnabled }),
          ...(!isDevAgent && { githubRepo: "", githubToken: "", autoPushEnabled: false }),
        }
      })
    }

    const updated = await db.agent.findUnique({
      where: { id },
      include: { roleConfig: true },
    })

    return NextResponse.json(JSON.parse(JSON.stringify(updated ? sanitizeAgent(updated, userRole) : null)))
  } catch (error: unknown) {
    console.error("[agents] PATCH error:", error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined)
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 })
  }
}
