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

    // Parse features from role config
    let features: Record<string, boolean> = {}
    try {
      if (agent.roleConfig?.features) {
        features = JSON.parse(agent.roleConfig.features)
      }
    } catch {}

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

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string | any[] }> = [
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
      const contentParts: any[] = [{ type: "text", text: message }]
      if (fileUrls) {
        for (const url of fileUrls) {
          contentParts.push({ type: "image_url", image_url: { url } })
        }
      }
      chatMessages.push({ role: "user", content: contentParts })
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

      // Check if this response should create an approval request
      let approvalId: string | null = null
      if (features.approvalRequired) {
        // Check if the response contains deliverable content (invoices, emails, code, etc.)
        const needsApproval = isApprovalWorthy(agent.type, message, result.content)
        if (needsApproval) {
          const approval = await db.approval.create({
            data: {
              type: getApprovalType(agent.type),
              requesterType: "AI",
              requesterId: agentId,
              agentId,
              title: `${agent.name} - ${getApprovalType(agent.type)}`,
              description: `AI-generated content requiring approval`,
              data: JSON.stringify({
                chatId: chat.id,
                userMessage: message.substring(0, 200),
                aiResponse: result.content.substring(0, 500),
                model: result.model,
              }),
              status: "PENDING",
            }
          })
          approvalId = approval.id

          // Notify users with approval access
          const approvers = await db.userAgentAccess.findMany({
            where: { agentId, canApprove: true },
          })
          for (const approver of approvers) {
            await db.notification.create({
              data: {
                userId: approver.userId,
                title: "Approval Required",
                message: `${agent.name} generated content that needs your approval.`,
                type: "APPROVAL",
                link: `/dashboard/approvals`,
                metadata: JSON.stringify({ approvalId: approval.id }),
              },
            })
          }
        }
      }

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
            approvalId,
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

      // Check for inter-agent automation triggers
      await checkAutomationTriggers(agent, message, result.content, chat.id)

      return NextResponse.json({
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost,
        model: result.model,
        chatId: chat.id,
        messageId: assistantMsg.id,
        approvalId,
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

// ━━ Helper: Determine if AI response needs approval ━━
function isApprovalWorthy(agentType: string, userMessage: string, aiResponse: string): boolean {
  const lowerMsg = userMessage.toLowerCase()
  const lowerResp = aiResponse.toLowerCase()

  switch (agentType) {
    case "FINANCE":
      return lowerMsg.includes("invoice") || lowerMsg.includes("quotation") || lowerMsg.includes("estimate") ||
             lowerResp.includes("invoice number") || lowerResp.includes("quotation") || lowerResp.includes("total:")
    case "CLIENT_HUNTER":
      return lowerMsg.includes("email") || lowerMsg.includes("outreach") || lowerMsg.includes("cold") ||
             lowerResp.includes("dear ") || lowerResp.includes("subject:")
    case "CONTENT":
      return lowerMsg.includes("publish") || lowerMsg.includes("post") || lowerMsg.includes("blog") ||
             lowerResp.includes("# ") || lowerResp.length > 1000
    case "DEV":
      return lowerMsg.includes("deploy") || lowerMsg.includes("production") ||
             lowerResp.includes("```") && lowerResp.length > 500
    case "PROJECT_MANAGER":
      return lowerMsg.includes("plan") || lowerMsg.includes("assign") ||
             lowerResp.includes("milestone") || lowerResp.includes("phase")
    default:
      return false
  }
}

// ━━ Helper: Get approval type based on agent type ━━
function getApprovalType(agentType: string): string {
  const map: Record<string, string> = {
    FINANCE: "INVOICE",
    CLIENT_HUNTER: "LEAD_OUTREACH",
    CONTENT: "CONTENT_PIECE",
    DEV: "CODE_REVIEW",
    PROJECT_MANAGER: "PROJECT_PLAN",
    HR: "TASK",
    SUPPORT: "TASK",
  }
  return map[agentType] || "TASK"
}

// ━━ Inter-Agent Automation Pipeline ━━
async function checkAutomationTriggers(
  agent: { id: string; type: string; name: string },
  userMessage: string,
  aiResponse: string,
  chatId: string
) {
  try {
    const lowerMsg = userMessage.toLowerCase()
    const lowerResp = aiResponse.toLowerCase()

    // CLIENT_HUNTER finds a lead → Notify Finance Agent
    if (agent.type === "CLIENT_HUNTER" &&
        (lowerMsg.includes("find") || lowerMsg.includes("search") || lowerMsg.includes("client")) &&
        (lowerResp.includes("potential client") || lowerResp.includes("lead") || lowerResp.includes("business"))) {
      const financeAgent = await db.agent.findFirst({ where: { type: "FINANCE" } })
      if (financeAgent) {
        await db.crossAgentMessage.create({
          data: {
            fromAgentId: agent.id,
            toAgentId: financeAgent.id,
            chatId,
            message: `New lead found by Client Hunter. Please prepare a cost estimation and quotation. Summary: ${aiResponse.substring(0, 300)}`,
            type: "REQUEST",
            status: "PENDING",
          }
        })
        // Notify users with Finance access
        const financeUsers = await db.userAgentAccess.findMany({
          where: { agentId: financeAgent.id, canView: true },
        })
        for (const u of financeUsers) {
          await db.notification.create({
            data: {
              userId: u.userId,
              title: "New Lead - Finance Review Needed",
              message: `Client Hunter found a new lead. Finance Agent has been notified to prepare a quotation.`,
              type: "AGENT",
              link: `/dashboard/agents/${financeAgent.id}`,
            },
          })
        }
      }
    }

    // PROJECT_MANAGER assigns work → Notify Dev Agent
    if (agent.type === "PROJECT_MANAGER" &&
        (lowerResp.includes("assign") || lowerResp.includes("task") || lowerResp.includes("phase"))) {
      const devAgent = await db.agent.findFirst({ where: { type: "DEV" } })
      if (devAgent && lowerResp.includes("develop")) {
        await db.crossAgentMessage.create({
          data: {
            fromAgentId: agent.id,
            toAgentId: devAgent.id,
            chatId,
            message: `New development task assigned by PM. Details: ${aiResponse.substring(0, 300)}`,
            type: "REQUEST",
            status: "PENDING",
          }
        })
      }
    }

    // SUPPORT escalates → Notify Dev Agent
    if (agent.type === "SUPPORT" && lowerResp.includes("escalat")) {
      const devAgent = await db.agent.findFirst({ where: { type: "DEV" } })
      if (devAgent) {
        await db.crossAgentMessage.create({
          data: {
            fromAgentId: agent.id,
            toAgentId: devAgent.id,
            chatId,
            message: `Support ticket escalated. Issue: ${aiResponse.substring(0, 300)}`,
            type: "ALERT",
            status: "PENDING",
          }
        })
      }
    }

    // HR workload check → Notify Project Manager
    if (agent.type === "HR" && (lowerResp.includes("overwork") || lowerResp.includes("capacity"))) {
      const pmAgent = await db.agent.findFirst({ where: { type: "PROJECT_MANAGER" } })
      if (pmAgent) {
        await db.crossAgentMessage.create({
          data: {
            fromAgentId: agent.id,
            toAgentId: pmAgent.id,
            chatId,
            message: `HR workload alert: ${aiResponse.substring(0, 300)}`,
            type: "ALERT",
            status: "PENDING",
          }
        })
      }
    }
  } catch (err) {
    // Don't fail the main request if automation triggers fail
    console.error("[automation] Trigger error:", err)
  }
}
