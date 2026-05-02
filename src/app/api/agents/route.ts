import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/agents - List agents (filtered by user access)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    // CRITICAL FIX: Return 401 if not authenticated - previously leaked all agent data
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = (session.user as any)?.role
    const userId = (session.user as any)?.id

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
    })

    // Filter agents based on user access
    if (userRole !== "SUPER_ADMIN") {
      const filtered = agents.filter(agent => {
        // ADMIN can see all agents
        if (userRole === "ADMIN") return true
        // Others only see agents they have access to
        const access = agent.userAccess?.[0]
        return access?.canView || false
      })
      // SECURITY: Strip githubToken from roleConfig for non-DEV agents and non-admin users
      const sanitized = filtered.map(agent => {
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
      return NextResponse.json(sanitized)
    }

    return NextResponse.json(agents)
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
    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only admins can update agent settings" }, { status: 403 })
    }

    const body = await req.json()
    const { id, roleConfig, ...data } = body

    if (!id) {
      return NextResponse.json({ error: "Agent ID required" }, { status: 400 })
    }

    // Update agent basic data
    const agent = await db.agent.update({
      where: { id },
      data,
      include: { roleConfig: true },
    })

    // Update role config if provided
    if (roleConfig) {
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
          githubRepo: roleConfig.githubRepo || "",
          githubToken: roleConfig.githubToken || "",
          autoPushEnabled: roleConfig.autoPushEnabled || false,
        },
        update: {
          ...(roleConfig.rolePrompt !== undefined && { rolePrompt: roleConfig.rolePrompt }),
          ...(roleConfig.quickActions !== undefined && { quickActions: JSON.stringify(roleConfig.quickActions) }),
          ...(roleConfig.specialCommands !== undefined && { specialCommands: JSON.stringify(roleConfig.specialCommands) }),
          ...(roleConfig.features !== undefined && { features: JSON.stringify(roleConfig.features) }),
          ...(roleConfig.suggestedPrompts !== undefined && { suggestedPrompts: JSON.stringify(roleConfig.suggestedPrompts) }),
          ...(roleConfig.autoWorkflows !== undefined && { autoWorkflows: JSON.stringify(roleConfig.autoWorkflows) }),
          ...(roleConfig.githubRepo !== undefined && { githubRepo: roleConfig.githubRepo }),
          ...(roleConfig.githubToken !== undefined && { githubToken: roleConfig.githubToken }),
          ...(roleConfig.autoPushEnabled !== undefined && { autoPushEnabled: roleConfig.autoPushEnabled }),
        }
      })
    }

    // Refetch with role config
    const updated = await db.agent.findUnique({
      where: { id },
      include: { roleConfig: true },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[agents] PATCH error:", error.message, error.stack)
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 })
  }
}
