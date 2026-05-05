import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { callAIWithFailover, AllKeysExhaustedError, APIKeyExhaustedError, APIKeyInvalidError, getModelForProvider, getVisionModel, translateZaiError } from "@/lib/ai/openrouter"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  let chat: any = null // Declared here so outer catch can access it for lock release
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { agentId, message, chatId, fileUrls } = await req.json()
    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 })
    }

    // Rate limiting for non-agentic chat
    const { success: rateLimitOk } = rateLimit(
      `chat:${userId}:${agentId}`,
      RATE_LIMITS.chat.limit,
      RATE_LIMITS.chat.windowMs
    )
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429 }
      )
    }

    // Validate file attachment limits
    const MAX_FILES = 5
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
    if (fileUrls && Array.isArray(fileUrls)) {
      if (fileUrls.length > MAX_FILES) {
        return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed per message` }, { status: 400 })
      }
      for (let i = 0; i < fileUrls.length; i++) {
        const url = fileUrls[i]
        if (url && url.startsWith("data:")) {
          const base64Part = url.split(",")[1] || ""
          const fileSize = Buffer.byteLength(base64Part, "base64")
          if (fileSize > MAX_FILE_SIZE) {
            return NextResponse.json({ error: `File ${i + 1} exceeds maximum size of 5MB` }, { status: 400 })
          }
        }
      }
    }

    // Check user has access to this agent
    const userRole = session.user.role
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
    const userName = session.user.name || session.user.email || "Unknown"
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

      // Check if chat is locked by another user
      if (chat.lockedBy && chat.lockedBy !== userId) {
        // Admin and Super Admin can bypass locks
        if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
          return NextResponse.json({
            error: `${chat.lockedByName || 'Another user'} is currently working on this chat`,
            lockedBy: chat.lockedBy,
            lockedByName: chat.lockedByName,
          }, { status: 423 })
        }
      }

      // Auto-release lock if chat is ENDED
      if (chat.status === "ENDED" && chat.lockedBy) {
        await db.chat.update({
          where: { id: chatId },
          data: { lockedBy: null, lockedAt: null, lockedByName: null },
        })
        chat.lockedBy = null
      }

      // Auto-acquire lock when user sends message to a chat
      if (!chat.lockedBy) {
        await db.chat.update({
          where: { id: chatId },
          data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
        })
      }
    } else {
      // Create new chat (already locked by creator)
      chat = await db.chat.create({
        data: {
          agentId,
          userId,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
          status: "ACTIVE",
          lockedBy: userId,
          lockedAt: new Date(),
          lockedByName: userName,
        },
        include: { messages: true }
      })
    }

    // Save user message with file attachments metadata
    // For base64 data URLs, store only metadata (name/type) not the full data to keep DB records small
    const messageMetadata = fileUrls && fileUrls.length > 0
      ? JSON.stringify({ attachments: fileUrls.map((url: string, idx: number) => ({
          name: `attachment-${idx + 1}`,
          type: url.startsWith("data:image/") ? "image" : "file",
          // Don't store full base64 in DB - just indicate it was attached
          stored: false,
        })) })
      : undefined

    await db.chatMessage.create({
      data: {
        chatId: chat.id,
        role: "user",
        content: message,
        ...(messageMetadata ? { metadata: messageMetadata } : {}),
      }
    })

    // ━━ Get ALL active API keys for failover ━━
    const allActiveKeys = await db.apiKey.findMany({
      where: {
        OR: [
          { status: "ACTIVE" },
          // Also include ERROR status keys to retry them
          { status: "ERROR" },
        ]
      },
      orderBy: { priority: "asc" },
    })

    // Filter keys that are assigned to this agent type (or assigned to all)
    const eligibleKeys = allActiveKeys.filter((k) => {
      try {
        const assigned = JSON.parse(k.assignedAgents || "[]")
        // Empty array = all agents, or includes this agent type
        return assigned.length === 0 || assigned.includes(agent.type)
      } catch {
        return true // If parsing fails, include the key
      }
    })

    // ── Environment Variable Fallback ──
    // If no NVIDIA keys in DB but NVIDIA_API_KEY is set in env, create a synthetic key entry
    const nvidiaEnvKey = process.env.NVIDIA_API_KEY
    if (nvidiaEnvKey && nvidiaEnvKey.trim() !== "") {
      const hasNvidiaKeyInDb = eligibleKeys.some(k => k.provider === "NVIDIA")
      if (!hasNvidiaKeyInDb) {
        console.log("[chat] No NVIDIA key in DB, using NVIDIA_API_KEY from environment as primary")
        eligibleKeys.unshift({
          id: "env-nvidia-key",
          provider: "NVIDIA",
          keyName: "NVIDIA API Key (from env)",
          keyValue: nvidiaEnvKey.trim(),
          monthlyBudget: 0,
          currentSpend: 0,
          status: "ACTIVE",
          priority: 0,
          assignedAgents: "[]",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      } else {
        eligibleKeys.push({
          id: "env-nvidia-key-fallback",
          provider: "NVIDIA",
          keyName: "NVIDIA API Key (from env, fallback)",
          keyValue: nvidiaEnvKey.trim(),
          monthlyBudget: 0,
          currentSpend: 0,
          status: "ACTIVE",
          priority: 999,
          assignedAgents: "[]",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      }
    }

    // Also add ZAI_API_KEY env fallback
    const zaiEnvKey = process.env.ZAI_API_KEY
    if (zaiEnvKey && zaiEnvKey.trim() !== "") {
      const hasZaiKeyInDb = eligibleKeys.some(k => k.provider === "ZAI")
      if (!hasZaiKeyInDb) {
        console.log("[chat] No Z.ai key in DB, using ZAI_API_KEY from environment as primary")
        eligibleKeys.unshift({
          id: "env-zai-key",
          provider: "ZAI",
          keyName: "Z.ai API Key (from env)",
          keyValue: zaiEnvKey.trim(),
          monthlyBudget: 0,
          currentSpend: 0,
          status: "ACTIVE",
          priority: 0,
          assignedAgents: "[]",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      } else {
        eligibleKeys.push({
          id: "env-zai-key-fallback",
          provider: "ZAI",
          keyName: "Z.ai API Key (from env, fallback)",
          keyValue: zaiEnvKey.trim(),
          monthlyBudget: 0,
          currentSpend: 0,
          status: "ACTIVE",
          priority: 999,
          assignedAgents: "[]",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      }
    }

    if (eligibleKeys.length === 0) {
      return NextResponse.json({
        error: "No active API key available. Please add a valid API key in API Keys page, or set NVIDIA_API_KEY or ZAI_API_KEY in your .env file.",
        chatId: chat.id,
        hint: "Go to Dashboard > API Keys > Add Key. You can add keys from Z.ai, OpenRouter, or Google AI.",
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
    const hasFiles = fileUrls && fileUrls.length > 0
    if (hasFiles) {
      const contentParts: any[] = [{ type: "text", text: message }]
      if (fileUrls) {
        for (const url of fileUrls) {
          if (url.startsWith("data:image/")) {
            contentParts.push({ type: "image_url", image_url: { url } })
          } else {
            // For non-image files (PDF, docs, etc.), use file_url type
            contentParts.push({ type: "file_url", file_url: { url } })
          }
        }
      }
      chatMessages.push({ role: "user", content: contentParts })
    } else {
      chatMessages.push({ role: "user", content: message })
    }

    const model = hasFiles ? getVisionModel(agent.model) : agent.model

    // Mark chat as processing (persists across navigation)
    await db.chat.update({ where: { id: chat.id }, data: { isProcessing: true } }).catch(() => {})

    try {
      // ━━ Call AI with automatic key failover ━━
      const result = await callAIWithFailover(chatMessages, model, eligibleKeys)

      // Mark exhausted/invalid keys based on what was tried
      // (the failover function already tried all keys, so we just need to update statuses)

      // If the used key was previously ERROR, mark it as ACTIVE
      const usedKey = eligibleKeys.find(k => k.id === result.apiKeyId)
      if (usedKey && usedKey.status === "ERROR") {
        await db.apiKey.update({
          where: { id: usedKey.id },
          data: { status: "ACTIVE" }
        })
      }

      // Update agent's preferred key
      if (result.apiKeyId && agent.apiKeyId !== result.apiKeyId) {
        await db.agent.update({
          where: { id: agentId },
          data: { apiKeyId: result.apiKeyId },
        })
      }

      // Check if this response should create an approval request
      let approvalId: string | null = null
      if (features.approvalRequired) {
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
            cost: result.cost,
            model: result.model,
            provider: result.usedProvider,
            apiKeyId: result.apiKeyId,
            approvalId,
          }),
        }
      })

      // Log usage
      await db.apiUsageLog.create({
        data: {
          apiKeyId: result.apiKeyId,
          agentId: agent.id,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: result.cost,
        },
      })

      // Update API key spend
      await db.apiKey.update({
        where: { id: result.apiKeyId },
        data: {
          currentSpend: { increment: result.cost },
          // Check if budget exceeded
          ...(usedKey && usedKey.monthlyBudget > 0 && (usedKey.currentSpend + result.cost) >= usedKey.monthlyBudget
            ? { status: "EXHAUSTED" }
            : {}),
        },
      })

      // Mark chat as no longer processing and release lock
      await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false } }).catch(() => {})
      await db.chat.update({ where: { id: chat.id }, data: { lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})

      // Check for inter-agent automation triggers
      await checkAutomationTriggers(agent, message, result.content, chat.id)

      return NextResponse.json({
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        model: result.model,
        provider: result.usedProvider,
        chatId: chat.id,
        messageId: assistantMsg.id,
        approvalId,
      })
    } catch (apiError: any) {
      // Mark chat as no longer processing and release lock on error
      await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false } }).catch(() => {})
      await db.chat.update({ where: { id: chat.id }, data: { lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})
      // Keep agent ERROR status for visibility
      await db.agent.update({ where: { id: agentId }, data: { status: "ERROR" } })

      // Handle specific error types
      if (apiError instanceof AllKeysExhaustedError) {
        // Check if this was a temporary rate limit (not a permanent exhaustion)
        const isTemporaryRateLimit = apiError.errors.some(e => e.includes("rate limit") || e.includes("too much traffic") || e.includes("访问量过大") || e.includes("try again"))
        const isOnlyRateLimited = isTemporaryRateLimit && !apiError.errors.some(e => e.includes("402") || e.includes("Insufficient balance") || e.includes("insufficient balance") || e.includes("no available resource"))

        // Only mark keys as EXHAUSTED for permanent issues (insufficient balance), NOT temporary rate limits
        if (!isOnlyRateLimited) {
          // Mark exhausted keys in database
          for (const key of eligibleKeys) {
            // Check if this key was mentioned in the error messages
            const keyErrors = apiError.errors.filter(e => e.includes(key.keyName))
            if (keyErrors.length > 0) {
              const isExhausted = keyErrors.some(e => e.includes("402") || e.includes("exhausted") || e.includes("EXHAUSTED") || e.includes("Insufficient balance") || e.includes("insufficient balance") || e.includes("no available resource") || e.includes("Token expired"))
              const isInvalid = keyErrors.some(e => e.includes("401") || e.includes("403") || e.includes("invalid") || e.includes("Unauthorized") || e.includes("Invalid authentication"))

              if (isExhausted) {
                await db.apiKey.update({
                  where: { id: key.id },
                  data: { status: "EXHAUSTED" },
                })
                // Unlink agents from this exhausted key
                await db.agent.updateMany({
                  where: { apiKeyId: key.id },
                  data: { apiKeyId: null },
                })
              } else if (isInvalid) {
                await db.apiKey.update({
                  where: { id: key.id },
                  data: { status: "ERROR" },
                })
                await db.agent.updateMany({
                  where: { apiKeyId: key.id },
                  data: { apiKeyId: null },
                })
              }
            }
          }

          // Create notification for admin
          const admins = await db.user.findMany({
            where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } }
          })
          for (const admin of admins) {
            await db.notification.create({
              data: {
                userId: admin.id,
                title: "API Keys Exhausted",
                message: `All API keys have failed. ${apiError.triedKeys} keys tried. Please add a new API key or add balance to existing ones.`,
                type: "ERROR",
                link: "/dashboard/api-keys",
              }
            })
          }
        } // end if (!isOnlyRateLimited)

        // Return appropriate error message
        if (isOnlyRateLimited) {
          return NextResponse.json({
            error: "AI model is currently busy (rate limited). Please try again in a moment. This is temporary and your API keys are still valid.",
            chatId: chat.id,
            details: apiError.errors,
            hint: "The free model (glm-4.7-flash) can be busy at peak times. Try again in 30-60 seconds, or add a paid model API key for more reliable access.",
          }, { status: 503 })
        }

        return NextResponse.json({
          error: `All API keys exhausted or failed. ${apiError.triedKeys} keys tried. Please add a new API key or add balance to your existing key at Dashboard > API Keys.`,
          chatId: chat.id,
          details: apiError.errors,
          hint: "If your Z.ai key shows 'insufficient balance', recharge at open.bigmodel.cn or add an OpenRouter/Google AI key as backup.",
        }, { status: 500 })
      }

      // Generic error
      return NextResponse.json({
        error: `AI API error: ${apiError.message}`,
        chatId: chat.id,
      }, { status: 500 })
    }
  } catch (error: any) {
    // Release lock + reset isProcessing in case the outer catch fires before the inner try/catch
    if (chat?.id) {
      await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})
    }
    console.error("[chat] Unhandled error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
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
    case "HR":
      return false; // HR actions don't require approval
    case "SUPPORT":
      return false; // Support actions don't require approval
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
    console.error("[automation] Trigger error:", err)
  }
}
