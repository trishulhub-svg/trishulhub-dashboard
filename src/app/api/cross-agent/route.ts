import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { callAI, estimateCost } from "@/lib/ai/openrouter"

// GET /api/cross-agent - Get cross-agent messages
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")
    const direction = searchParams.get("direction") || "incoming" // incoming or outgoing
    const status = searchParams.get("status")

    const where: any = {}
    if (agentId) {
      if (direction === "incoming") where.toAgentId = agentId
      else if (direction === "outgoing") where.fromAgentId = agentId
    }
    if (status) where.status = status

    const messages = await db.crossAgentMessage.findMany({
      where,
      include: {
        fromAgent: { select: { id: true, name: true, type: true } },
        toAgent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json(messages)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/cross-agent - Send a message from one agent to another
// This is called internally when an agent needs to communicate with another agent
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { fromAgentId, toAgentId, message, type, chatId } = await req.json()

    if (!fromAgentId || !toAgentId || !message) {
      return NextResponse.json({ error: "From agent, to agent, and message are required" }, { status: 400 })
    }

    // Verify both agents exist
    const [fromAgent, toAgent] = await Promise.all([
      db.agent.findUnique({ where: { id: fromAgentId } }),
      db.agent.findUnique({ where: { id: toAgentId } }),
    ])

    if (!fromAgent || !toAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Create the cross-agent message
    const crossMsg = await db.crossAgentMessage.create({
      data: {
        fromAgentId,
        toAgentId,
        chatId: chatId || null,
        message,
        type: type || "INFO",
        status: "PENDING",
      },
      include: {
        fromAgent: { select: { id: true, name: true, type: true } },
        toAgent: { select: { id: true, name: true, type: true } },
      }
    })

    // Process the message - have the receiving agent acknowledge/act on it
    // This creates an AI response from the receiving agent
    try {
      const toAgentConfig = await db.agentRoleConfig.findUnique({
        where: { agentId: toAgentId }
      })

      const systemPrompt = toAgentConfig?.rolePrompt || toAgent.systemPrompt
      const contextMessage = `[Cross-Agent Message from ${fromAgent.name}]: ${message}\n\nBriefly acknowledge this message and describe how you will act on it.`

      // Find an active API key
      let apiKey = toAgent.apiKeyId
        ? await db.apiKey.findUnique({ where: { id: toAgent.apiKeyId } })
        : null

      if (!apiKey || apiKey.status !== "ACTIVE") {
        apiKey = await db.apiKey.findFirst({
          where: { status: "ACTIVE" },
          orderBy: { priority: "asc" },
        })
      }

      let aiResponse = ""
      if (apiKey) {
        const result = await callAI(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextMessage }
          ],
          toAgent.model,
          apiKey.keyValue,
          apiKey.provider
        )
        aiResponse = result.content

        // Log usage
        const cost = estimateCost(result.model, result.inputTokens, result.outputTokens)
        await db.apiUsageLog.create({
          data: {
            apiKeyId: apiKey.id,
            agentId: toAgent.id,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cost,
          }
        })
      }

      // Update cross-agent message status
      await db.crossAgentMessage.update({
        where: { id: crossMsg.id },
        data: { status: "PROCESSED" },
      })

      // If there's a linked chat, add the cross-agent message to it
      if (chatId) {
        await db.chatMessage.create({
          data: {
            chatId,
            role: "system",
            content: `[${fromAgent.name} → ${toAgent.name}]: ${message}\n\n${toAgent.name}'s Response: ${aiResponse}`,
          }
        })
      }

      // Notify relevant users
      const usersWithAccess = await db.userAgentAccess.findMany({
        where: { agentId: toAgentId, canView: true },
      })

      for (const access of usersWithAccess) {
        await db.notification.create({
          data: {
            userId: access.userId,
            title: `Cross-Agent: ${fromAgent.name} → ${toAgent.name}`,
            message: `${fromAgent.name} sent a message to ${toAgent.name}: ${message.substring(0, 100)}...`,
            type: "AGENT",
            link: `/dashboard/agents/${toAgentId}`,
            metadata: JSON.stringify({ crossAgentMessageId: crossMsg.id }),
          }
        })
      }

      return NextResponse.json({
        ...crossMsg,
        aiResponse,
      })
    } catch (aiError: any) {
      // Still record the message even if AI processing fails
      await db.crossAgentMessage.update({
        where: { id: crossMsg.id },
        data: { status: "PENDING" },
      })

      return NextResponse.json({
        ...crossMsg,
        aiResponse: `Message delivered but processing failed: ${aiError.message}`,
      })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
