import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { callAI, estimateCost } from "@/lib/ai/openrouter"
import { isAdmin } from "@/lib/rbac"

// GET /api/cross-agent - Get cross-agent messages (filtered by user's agent access)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = session.user.role
    const userId = session.user.id

    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")
    const direction = searchParams.get("direction") || "incoming" // incoming or outgoing
    // FIX: Validate direction parameter
    if (direction && !['incoming', 'outgoing'].includes(direction)) {
      return NextResponse.json({ error: "Invalid direction parameter. Must be 'incoming' or 'outgoing'." }, { status: 400 })
    }
    const status = searchParams.get("status")

    const where: any = {}
    
    // Non-admins only see messages for agents they have access to
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      const userAgents = await db.userAgentAccess.findMany({
        where: { userId, canView: true },
        select: { agentId: true },
      })
      const accessibleAgentIds = userAgents.map(a => a.agentId)
      
      where.OR = [
        { fromAgentId: { in: accessibleAgentIds } },
        { toAgentId: { in: accessibleAgentIds } },
      ]
    }
    
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
    console.error("[cross-agent] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/cross-agent - Send a message from one agent to another
// Supports linkedChatId for chat-to-chat data sharing and shareFullChat
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { fromAgentId, toAgentId, message, type, chatId, linkedChatId, shareFullChat } = await req.json()

    if (!fromAgentId || !toAgentId || !message) {
      return NextResponse.json({ error: "From agent, to agent, and message are required" }, { status: 400 })
    }

    // Prevent self-messaging
    if (fromAgentId === toAgentId) {
      return NextResponse.json({ error: "Cannot send message to self" }, { status: 400 })
    }

    // Validate message type
    const validTypes = ["INFO", "REQUEST", "RESULT", "ALERT"]
    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid message type" }, { status: 400 })
    }

    // Validate message length
    if (message && message.length > 10000) {
      return NextResponse.json({ error: "Message too long (max 10000 characters)" }, { status: 400 })
    }

    // SECURITY: Verify user has access to both agents
    const userRole = session.user.role
    const userId = session.user.id
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      const [fromAccess, toAccess] = await Promise.all([
        db.userAgentAccess.findFirst({ where: { userId, agentId: fromAgentId, canChat: true } }),
        db.userAgentAccess.findFirst({ where: { userId, agentId: toAgentId, canView: true } }),
      ])
      if (!fromAccess) {
        return NextResponse.json({ error: "You do not have chat access to the source agent" }, { status: 403 })
      }
      if (!toAccess) {
        return NextResponse.json({ error: "You do not have access to the target agent" }, { status: 403 })
      }
    }

    // Verify both agents exist
    const [fromAgent, toAgent] = await Promise.all([
      db.agent.findUnique({ where: { id: fromAgentId } }),
      db.agent.findUnique({ where: { id: toAgentId } }),
    ])

    if (!fromAgent || !toAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // If linking a chat from the receiving agent, verify it exists AND user has access
    let linkedChatContext = ""
    if (linkedChatId) {
      const linkedChat = await db.chat.findUnique({
        where: { id: linkedChatId },
        include: {
          agent: { select: { id: true, name: true, type: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
      if (!linkedChat) {
        return NextResponse.json({ error: "Linked chat not found" }, { status: 404 })
      }
      // SECURITY: Verify access - user must own the chat or have canView on the agent that owns it
      if (linkedChat.userId !== userId) {
        const access = await db.userAgentAccess.findFirst({
          where: { userId, agentId: linkedChat.agentId, canView: true }
        })
        if (!access && !isAdmin(userRole)) {
          return NextResponse.json({ error: "Access denied to linked chat" }, { status: 403 })
        }
      }
      if (shareFullChat) {
        // Share full chat context with the receiving agent
        const chatMessages = linkedChat.messages
          .filter((m: any) => m.role === "user" || m.role === "assistant")
          .map((m: any) => `${m.role === "user" ? "User" : linkedChat.agent?.name || "Assistant"}: ${m.content}`)
          .join("\n")
        // Limit shared chat context to prevent excessive data transfer
        if (chatMessages.length > 50000) {
          linkedChatContext = `\n\n[Shared Chat Context from "${linkedChat.title}" (truncated)]:\n${chatMessages.substring(0, 50000)}\n... (truncated)`
        } else {
          linkedChatContext = `\n\n[Shared Chat Context from "${linkedChat.title}"]:\n${chatMessages}`
        }
      } else {
        // Share just a summary
        linkedChatContext = `\n\n[Referenced Chat: "${linkedChat.title}" with ${linkedChat.messages.length} messages]`
      }
    }

    // Create the cross-agent message
    // Use try/catch for linkedChatId in case the column doesn't exist in production DB yet
    let crossMsg;
    try {
      crossMsg = await db.crossAgentMessage.create({
        data: {
          fromAgentId,
          toAgentId,
          chatId: chatId || null,
          linkedChatId: linkedChatId || null,
          message,
          type: type || "INFO",
          status: "PENDING",
          shareFullChat: shareFullChat || false,
        },
        include: {
          fromAgent: { select: { id: true, name: true, type: true } },
          toAgent: { select: { id: true, name: true, type: true } },
        }
      });
    } catch (createError: any) {
      // SECURITY FIX: Removed auto-migration ($executeRawUnsafe ALTER TABLE) from request handler.
      // Schema migrations should only happen during deployment via /api/setup (SUPER_ADMIN only).
      // If linkedChatId or shareFullChat columns don't exist, try without them.
      if (createError.message?.includes("linkedChatId") || createError.message?.includes("shareFullChat") || createError.message?.includes("no column") || createError.message?.includes("Unknown column") || createError.message?.includes("no such column")) {
        try {
          crossMsg = await db.crossAgentMessage.create({
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
          });
        } catch (fallbackError: any) {
          console.error("[cross-agent] Fallback create also failed:", fallbackError.message);
          return NextResponse.json({ error: "Failed to create cross-agent message. Run /api/setup PATCH to migrate schema." }, { status: 500 });
        }
      } else {
        console.error("[cross-agent] Create error:", createError.message);
        return NextResponse.json({ error: "Failed to create cross-agent message" }, { status: 500 });
      }
    }

    // Process the message - have the receiving agent acknowledge/act on it
    try {
      const toAgentConfig = await db.agentRoleConfig.findUnique({
        where: { agentId: toAgentId }
      })

      const systemPrompt = toAgentConfig?.rolePrompt || toAgent.systemPrompt
      const contextMessage = `[Cross-Agent Message from ${fromAgent.name}]: ${message}${linkedChatContext}\n\nBriefly acknowledge this message and describe how you will act on it.`

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
      let hasApiKey = false
      if (apiKey) {
        hasApiKey = true
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

      // FIX: If no API key exists, set status to PENDING instead of PROCESSED
      // A message with no AI response should not be marked as PROCESSED
      const msgStatus = hasApiKey ? "PROCESSED" : "PENDING"

      // Update cross-agent message status
      await db.crossAgentMessage.update({
        where: { id: crossMsg.id },
        data: { status: msgStatus },
      })

      // If there's a linked chat, add the cross-agent message + shared context to it
      // FIX: Validate that the chatId belongs to the user or agent before injecting system messages
      if (chatId) {
        const chatExists = await db.chat.findFirst({
          where: {
            id: chatId,
            OR: [
              { userId },
              { agentId: fromAgentId },
            ],
          },
        })
        if (!chatExists) {
          return NextResponse.json({ error: "Invalid chatId: chat does not belong to this user or agent" }, { status: 400 })
        }
        const contextNote = linkedChatId 
          ? `\n\n🔗 This message includes context from another agent's chat.`
          : ""
        await db.chatMessage.create({
          data: {
            chatId,
            role: "system",
            content: `[${fromAgent.name} → ${toAgent.name}]: ${message}${contextNote}\n\n${toAgent.name}'s Response: ${aiResponse}`,
          }
        })
      }

      // Notify relevant users
      const usersWithAccess = await db.userAgentAccess.findMany({
        where: { agentId: toAgentId, canView: true },
      })

      try {
        if (usersWithAccess.length > 0) {
          await db.notification.createMany({
            data: usersWithAccess.map(access => ({
              userId: access.userId,
              title: `Cross-Agent: ${fromAgent.name} → ${toAgent.name}`,
              message: `${fromAgent.name} sent a message to ${toAgent.name}: ${message.substring(0, 100)}...`,
              type: "AGENT",
              link: `/dashboard/agents/${toAgentId}`,
              metadata: JSON.stringify({ crossAgentMessageId: crossMsg.id }),
            })),
          })
        }
      } catch (notifyErr: any) {
        console.error("[cross-agent] notification error (non-blocking):", notifyErr?.message)
      }

      return NextResponse.json({
        ...crossMsg,
        aiResponse,
      })
    } catch (aiError: any) {
      // Still record the message even if AI processing fails
      console.error("[cross-agent] AI processing error:", aiError.message);
      await db.crossAgentMessage.update({
        where: { id: crossMsg.id },
        data: { status: "FAILED" },
      }).catch((dbErr: any) => console.error("[cross-agent] Failed to update message status:", dbErr.message))

      return NextResponse.json({
        ...crossMsg,
        aiResponse: "Message delivered but AI processing failed. The agent will process it later.",
      })
    }
  } catch (error: any) {
    console.error("[cross-agent] POST error:", error.message)
    // Provide more specific error messages for common failures
    if (error.message?.includes("JSON")) {
      return NextResponse.json({ error: "Invalid request format. Please check your input." }, { status: 400 })
    }
    return NextResponse.json({ error: "An error occurred while processing the cross-agent message" }, { status: 500 })
  }
}

// DELETE /api/cross-agent - Delete a cross-agent message/connection
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 })
    }

    const msg = await db.crossAgentMessage.findUnique({ where: { id } })
    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    // FIX: Only allow SUPER_ADMIN or the agent's assigned admin to delete messages
    // canChat is too permissive — any user with chat access could delete any message
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can delete cross-agent messages" }, { status: 403 })
    }

    await db.crossAgentMessage.delete({ where: { id } })

    return NextResponse.json({ success: true, message: "Cross-agent connection deleted" })
  } catch (error: any) {
    console.error("[cross-agent] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
