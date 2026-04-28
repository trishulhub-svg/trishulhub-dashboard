import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { callAI, estimateCost, getVisionModel } from "@/lib/ai/openrouter"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { agentId, message, chatId, fileUrls } = await req.json()
    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 })
    }

    // Check user has access to this agent
    const userRole = (session.user as any).role
    if (userRole !== "SUPER_ADMIN") {
      const access = await db.userAgentAccess.findFirst({
        where: { userId, agentId }
      })
      if (!access?.canChat) {
        return NextResponse.json({ error: "You don't have access to this agent" }, { status: 403 })
      }
    }

    // Get agent with role config
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { roleConfig: true }
    })
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Get or create chat
    let chat
    if (chatId) {
      chat = await db.chat.findUnique({
        where: { id: chatId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" }
          }
        }
      })
      if (!chat || chat.userId !== userId) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 })
      }
    } else {
      // Create new chat
      chat = await db.chat.create({
        data: {
          agentId,
          userId,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
          status: "ACTIVE",
        },
        include: { messages: true }
      })
    }

    // Save user message
    await db.chatMessage.create({
      data: {
        chatId: chat.id,
        role: "user",
        content: message,
      }
    })

    // Get active API key
    let apiKey = agent.apiKeyId
      ? await db.apiKey.findUnique({ where: { id: agent.apiKeyId } })
      : null

    if (!apiKey || apiKey.status !== "ACTIVE") {
      const allActiveKeys = await db.apiKey.findMany({
        where: { status: "ACTIVE" },
        orderBy: { priority: "asc" },
      })

      apiKey = allActiveKeys.find((k) => {
        try {
          const assigned = JSON.parse(k.assignedAgents || "[]")
          return assigned.length === 0 || assigned.includes(agent.type)
        } catch {
          return true
        }
      }) || null

      if (apiKey) {
        await db.agent.update({
          where: { id: agentId },
          data: { apiKeyId: apiKey.id },
        })
      }
    }

    if (!apiKey) {
      return NextResponse.json({
        error: "No active API key available. Please add a valid API key in Settings > API Keys.",
        chatId: chat.id,
      }, { status: 400 })
    }

    // Build messages array with conversation history
    const systemPrompt = agent.roleConfig?.rolePrompt || agent.systemPrompt

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt }
    ]

    // Add conversation history (last 20 messages for context)
    const historyMessages = chat.messages.slice(-20)
    for (const msg of historyMessages) {
      chatMessages.push({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })
    }

    // Add current user message
    const hasImages = fileUrls && fileUrls.length > 0
    if (hasImages) {
      // For vision, we need to handle content parts differently
      const contentParts: any[] = [{ type: "text", text: message }]
      if (fileUrls) {
        for (const url of fileUrls) {
          contentParts.push({ type: "image_url", image_url: { url } })
        }
      }
      // Skip adding duplicate user message since we already saved it
      // For vision models, we need to use the content parts format
      chatMessages.push({ role: "user", content: message })
    } else {
      chatMessages.push({ role: "user", content: message })
    }

    const model = hasImages ? getVisionModel(agent.model) : agent.model

    // Update agent status
    await db.agent.update({ where: { id: agentId }, data: { status: "RUNNING" } })

    try {
      const result = await callAI(chatMessages, model, apiKey.keyValue, apiKey.provider)

      // If successful, mark key as ACTIVE (in case it was previously ERROR)
      if (apiKey.status === "ERROR") {
        await db.apiKey.update({ where: { id: apiKey.id }, data: { status: "ACTIVE" } })
      }

      // Calculate cost
      const cost = estimateCost(result.model, result.inputTokens, result.outputTokens)

      // Save assistant message
      const assistantMsg = await db.chatMessage.create({
        data: {
          chatId: chat.id,
          role: "assistant",
          content: result.content,
          metadata: JSON.stringify({
            tokens: { input: result.inputTokens, output: result.outputTokens },
            cost,
            model: result.model,
          }),
        }
      })

      // Log usage
      await db.apiUsageLog.create({
        data: {
          apiKeyId: apiKey.id,
          agentId: agent.id,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost,
        },
      })

      // Update API key spend
      await db.apiKey.update({
        where: { id: apiKey.id },
        data: { currentSpend: apiKey.currentSpend + cost },
      })

      // Update agent status
      await db.agent.update({ where: { id: agentId }, data: { status: "IDLE" } })

      return NextResponse.json({
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost,
        model: result.model,
        chatId: chat.id,
        messageId: assistantMsg.id,
      })
    } catch (apiError: any) {
      await db.agent.update({ where: { id: agentId }, data: { status: "ERROR" } })

      const errorMsg = apiError.message || ""
      if (errorMsg.includes("401") || errorMsg.includes("Unauthorized") || errorMsg.includes("User not found")) {
        await db.apiKey.update({
          where: { id: apiKey.id },
          data: { status: "ERROR" },
        })
        await db.agent.update({
          where: { id: agentId },
          data: { apiKeyId: null },
        })
        return NextResponse.json({
          error: "API key is invalid or expired. Please add a valid API key in Settings > API Keys.",
          chatId: chat.id,
        }, { status: 500 })
      }

      return NextResponse.json({
        error: `AI API error: ${apiError.message}`,
        chatId: chat.id,
      }, { status: 500 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
