// Agentic Chat API - Multi-agent autonomous execution endpoint
// Supports ALL agent types with role-specific tools, thinking mode, and autonomous loop
// Each agent type gets its own system prompt and tool set
// Supports SSE streaming for real-time step updates

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { runAgentLoop, AgentStep, AgentLoopResult } from "@/lib/ai/agent-loop"
import { getToolsForAgentType } from "@/lib/ai/agent-tools"
import { callAIWithFailover, AllKeysExhaustedError, getVisionModel } from "@/lib/ai/openrouter"
import { SignJWT } from "jose"

// ── Analyze file attachments with Z.ai Vision API ──
// The agentic model (glm-4.5-flash) is text-only and doesn't support image_url.
// So we first analyze images/files with the vision model, then pass the description as text.
async function analyzeFileAttachments(
  fileUrls: string[],
  apiKey: string
): Promise<string> {
  const ZAI_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

  // Generate JWT token for Z.ai
  let token = apiKey
  if (!apiKey.startsWith("eyJ")) {
    const parts = apiKey.split(".")
    if (parts.length === 2) {
      const [id, secret] = parts
      const secretBytes = new TextEncoder().encode(secret)
      const nowSec = Math.floor(Date.now() / 1000)
      token = await new SignJWT({ api_key: id, timestamp: Date.now(), exp: nowSec + 3600 })
        .setProtectedHeader({ alg: "HS256", sign_type: "SIGN" })
        .sign(secretBytes)
    }
  }

  const descriptions: string[] = []

  for (let i = 0; i < fileUrls.length; i++) {
    const url = fileUrls[i]
    const isImage = url.startsWith("data:image/")

    try {
      if (isImage) {
        // Use Z.ai Vision model to analyze the image
        const body = {
          model: "glm-4v-flash", // Free vision model
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Describe this image in detail. If it's a screenshot of a form, UI, or design, describe every visible element, field, layout, text, and button. Be thorough and specific - this description will be used by an AI agent to implement or work with what's shown." },
              { type: "image_url", image_url: { url } }
            ]
          }],
          max_tokens: 2048,
        }

        const response = await fetch(ZAI_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })

        if (response.ok) {
          const data = await response.json()
          const desc = data.choices?.[0]?.message?.content || "Image could not be analyzed"
          descriptions.push(`[Attachment ${i + 1} - Image]: ${desc}`)
        } else {
          const errorText = await response.text()
          console.error("[agent-chat] Vision API error:", response.status, errorText.substring(0, 200))
          descriptions.push(`[Attachment ${i + 1} - Image]: (Image was attached but vision analysis failed. The user should describe what's in the image.)`)
        }
      } else {
        // For non-image files (PDF, docs, etc.) - note the attachment
        // Z.ai file_url support is limited, so we note the file type
        const mimeMatch = url.match(/^data:([^;]+);/)
        const mimeType = mimeMatch ? mimeMatch[1] : "unknown"
        descriptions.push(`[Attachment ${i + 1} - File (${mimeType})]: A file of type ${mimeType} was attached. The user expects you to work with this file. Ask the user to describe the file contents if needed.`)
      }
    } catch (err: any) {
      console.error("[agent-chat] File analysis error:", err.message)
      descriptions.push(`[Attachment ${i + 1}]: File was attached but analysis failed: ${err.message}`)
    }
  }

  return descriptions.join("\n\n")
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { agentId, message, chatId, stream, fileUrls } = await req.json()
    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 })
    }

    // Check user access
    const userRole = (session.user as any).role
    if (userRole !== "SUPER_ADMIN") {
      const access = await db.userAgentAccess.findFirst({ where: { userId, agentId } })
      if (!access?.canChat) {
        return NextResponse.json({ error: "No access to this agent" }, { status: 403 })
      }
    }

    // Get agent with role config
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { roleConfig: true },
    })
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Get or create chat
    let chat
    if (chatId) {
      chat = await db.chat.findUnique({
        where: { id: chatId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
      if (!chat || chat.userId !== userId) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 })
      }

      // Check if chat is locked by another user (Feature 4: Chat Locking)
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
      }

      // Auto-acquire lock when user sends first message to a chat
      if (!chat.lockedBy) {
        const userName = (session.user as any).name || session.user.email || "Unknown"
        await db.chat.update({
          where: { id: chatId },
          data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
        })
      }
    } else {
      chat = await db.chat.create({
        data: {
          agentId,
          userId,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
          status: "ACTIVE",
          lockedBy: userId,
          lockedAt: new Date(),
          lockedByName: (session.user as any).name || session.user.email || "Unknown",
        },
        include: { messages: true },
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
      },
    })

    // Get Z.ai API key (agentic mode requires Z.ai for function calling)
    const zaiKeys = await db.apiKey.findMany({
      where: {
        provider: "ZAI",
        status: { in: ["ACTIVE", "ERROR"] },
      },
      orderBy: { priority: "asc" },
    })

    // Filter keys assigned to this agent type
    const eligibleKeys = zaiKeys.filter((k) => {
      try {
        const assigned = JSON.parse(k.assignedAgents || "[]")
        return assigned.length === 0 || assigned.includes(agent.type)
      } catch { return true }
    })

    if (eligibleKeys.length === 0) {
      return NextResponse.json({
        error: "No active Z.ai API key available for agentic mode. Agentic agents require a Z.ai API key with GLM-4.5-Flash or GLM-5.1. Please add one in API Keys page.",
        chatId: chat.id,
      }, { status: 400 })
    }

    // Feature 6: Don't update agent.status to RUNNING per-chat.
    // Agent status should not be global - each chat is independent.
    // We track activity at the chat level, not the agent level.

    // Build conversation history from chat messages
    const history = chat.messages
      .slice(-20)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))

    // Build system prompt from agent's role config
    const systemPrompt = agent.roleConfig?.rolePrompt || agent.systemPrompt || undefined

    // Get agent-specific tools
    const tools = getToolsForAgentType(agent.type)

    // ── Pre-process file attachments ──
    // The agentic model (glm-4.5-flash) is text-only, so we analyze images with
    // the Z.ai Vision model first, then inject the description as text context.
    let enrichedMessage = message
    if (fileUrls && fileUrls.length > 0 && eligibleKeys.length > 0) {
      try {
        const fileDescriptions = await analyzeFileAttachments(fileUrls, eligibleKeys[0].keyValue)
        if (fileDescriptions) {
          enrichedMessage = `${message}\n\n--- User's File Attachments (analyzed via vision) ---\n${fileDescriptions}\n--- End of attachments ---`
        }
      } catch (err: any) {
        console.error("[agent-chat] File pre-processing failed:", err.message)
        // Continue without file descriptions
      }
    }

    // ── STREAMING MODE ──
    if (stream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let lastError: Error | null = null
          let success = false

          // Send "analyzing files" step if attachments are present
          if (fileUrls && fileUrls.length > 0) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "step",
                step: {
                  type: "tool_call",
                  content: "Analyzing file attachments...",
                  toolName: "vision_analysis",
                  stepNumber: 0,
                }
              })}\n\n`))
            } catch {}
          }

          for (const key of eligibleKeys) {
            try {
              const result = await runAgentLoop(enrichedMessage, history, key.keyValue, agent.model, {
                maxSteps: 15,
                maxTokens: 8192,
                agentType: agent.type,
                systemPrompt,
                tools,
                onStep: (step: AgentStep) => {
                  // Send each step as SSE event
                  try {
                    const stepData = {
                      type: "step",
                      step: {
                        type: step.type,
                        content: step.type === "thinking"
                          ? step.content.substring(0, 500)
                          : step.type === "tool_result"
                            ? (step.toolResult || step.content).substring(0, 2000)
                            : step.type === "tool_call"
                              ? `${step.toolName}(${Object.entries(step.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`
                              : step.content.substring(0, 2000),
                        toolName: step.toolName,
                        toolArgs: step.toolArgs,
                        toolResult: step.type === "tool_result" ? (step.toolResult || step.content).substring(0, 2000) : undefined,
                        stepNumber: step.stepNumber,
                      }
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(stepData)}\n\n`))
                  } catch {
                    // Stream may have closed
                  }
                },
              })

              // Success! 
              success = true

              // If the used key was previously ERROR, mark it as ACTIVE
              if (key.status === "ERROR") {
                await db.apiKey.update({ where: { id: key.id }, data: { status: "ACTIVE" } })
              }

              // Update agent's preferred key
              if (agent.apiKeyId !== key.id) {
                await db.agent.update({ where: { id: agentId }, data: { apiKeyId: key.id } })
              }

              // Build rich metadata with agent steps
              const metadata: any = {
                tokens: { input: result.totalInputTokens, output: result.totalOutputTokens },
                cost: result.cost,
                model: result.model,
                provider: result.provider,
                apiKeyId: key.id,
                agentic: true,
                agentType: agent.type,
                totalSteps: result.totalSteps,
                usedTools: result.usedTools,
                steps: result.steps.map(s => ({
                  type: s.type,
                  toolName: s.toolName,
                  content: s.type === "thinking"
                    ? s.content.substring(0, 500)
                    : s.type === "tool_result"
                      ? s.content.substring(0, 2000)
                      : s.type === "tool_call"
                        ? `${s.toolName}(${Object.entries(s.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`
                        : s.content.substring(0, 2000),
                  toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 2000) : undefined,
                  toolArgs: s.type === "tool_call" ? s.toolArgs : undefined,
                })),
              }

              if (result.thinkingContent) {
                metadata.thinkingPreview = result.thinkingContent.substring(0, 300)
              }

              // Save assistant message
              const assistantMsg = await db.chatMessage.create({
                data: {
                  chatId: chat.id,
                  role: "assistant",
                  content: result.finalResponse,
                  metadata: JSON.stringify(metadata),
                },
              })

              // Log usage
              await db.apiUsageLog.create({
                data: {
                  apiKeyId: key.id,
                  agentId: agent.id,
                  model: result.model,
                  inputTokens: result.totalInputTokens,
                  outputTokens: result.totalOutputTokens,
                  cost: result.cost,
                },
              })

              // Update key spend
              await db.apiKey.update({
                where: { id: key.id },
                data: { currentSpend: { increment: result.cost } },
              })

              // Feature 6: Don't set agent status back to IDLE after each chat
              // This was causing interference when multiple users work on different chats
              // Agent status will be managed separately if needed

              // Send complete event
              const completeData = {
                type: "complete",
                content: result.finalResponse,
                inputTokens: result.totalInputTokens,
                outputTokens: result.totalOutputTokens,
                cost: result.cost,
                model: result.model,
                provider: result.provider,
                chatId: chat.id,
                messageId: assistantMsg.id,
                agentic: true,
                agentType: agent.type,
                totalSteps: result.totalSteps,
                usedTools: result.usedTools,
                steps: result.steps.map(s => ({
                  type: s.type,
                  content: s.type === "thinking"
                    ? s.content.substring(0, 500)
                    : s.type === "tool_result"
                      ? (s.toolResult || s.content).substring(0, 2000)
                      : s.type === "tool_call"
                        ? `${s.toolName}(${Object.entries(s.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`
                        : s.content.substring(0, 2000),
                  toolName: s.toolName,
                  toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 2000) : undefined,
                  toolArgs: s.type === "tool_call" ? s.toolArgs : undefined,
                  stepNumber: s.stepNumber,
                })),
                thinkingPreview: result.thinkingContent?.substring(0, 500),
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`))
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
              controller.close()
              return
            } catch (err: any) {
              lastError = err
              console.error(`[agent-chat] Key "${key.keyName}" failed:`, err.message)

              if (err.message.includes("Insufficient balance")) {
                await db.apiKey.update({ where: { id: key.id }, data: { status: "EXHAUSTED" } })
              }
              continue // Try next key
            }
          }

          // All keys failed
          await db.agent.update({ where: { id: agentId }, data: { status: "ERROR" } })

          const isRateLimit = lastError?.message?.includes("rate limit") || lastError?.message?.includes("429")
          const errorData = {
            type: "error",
            message: isRateLimit
              ? "AI model is currently busy. Please try again in a moment."
              : `Agentic execution failed: ${lastError?.message || "All API keys failed"}. Please check your Z.ai API key.`,
            chatId: chat.id,
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      })
    }

    // ── NON-STREAMING MODE (original behavior) ──
    const allSteps: AgentStep[] = []
    let lastError: Error | null = null

    for (const key of eligibleKeys) {
      try {
        const result = await runAgentLoop(enrichedMessage, history, key.keyValue, agent.model, {
          maxSteps: 15,
          maxTokens: 8192,
          agentType: agent.type,
          systemPrompt,
          tools,
          onStep: (step) => {
            allSteps.push(step)
          },
        })

        // Success!
        if (key.status === "ERROR") {
          await db.apiKey.update({ where: { id: key.id }, data: { status: "ACTIVE" } })
        }

        if (agent.apiKeyId !== key.id) {
          await db.agent.update({ where: { id: agentId }, data: { apiKeyId: key.id } })
        }

        const metadata: any = {
          tokens: { input: result.totalInputTokens, output: result.totalOutputTokens },
          cost: result.cost,
          model: result.model,
          provider: result.provider,
          apiKeyId: key.id,
          agentic: true,
          agentType: agent.type,
          totalSteps: result.totalSteps,
          usedTools: result.usedTools,
          steps: result.steps.map(s => ({
            type: s.type,
            toolName: s.toolName,
            content: s.type === "thinking"
              ? s.content.substring(0, 500)
              : s.type === "tool_result"
                ? s.content.substring(0, 2000)
                : s.type === "tool_call"
                  ? `${s.toolName}(${Object.entries(s.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`
                  : s.content.substring(0, 2000),
            toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 2000) : undefined,
            toolArgs: s.type === "tool_call" ? s.toolArgs : undefined,
          })),
        }

        if (result.thinkingContent) {
          metadata.thinkingPreview = result.thinkingContent.substring(0, 500)
        }

        const assistantMsg = await db.chatMessage.create({
          data: {
            chatId: chat.id,
            role: "assistant",
            content: result.finalResponse,
            metadata: JSON.stringify(metadata),
          },
        })

        await db.apiUsageLog.create({
          data: {
            apiKeyId: key.id,
            agentId: agent.id,
            model: result.model,
            inputTokens: result.totalInputTokens,
            outputTokens: result.totalOutputTokens,
            cost: result.cost,
          },
        })

        await db.apiKey.update({
          where: { id: key.id },
          data: { currentSpend: { increment: result.cost } },
        })

        // Feature 6: Don't set agent status back to IDLE (per-chat independence)

        return NextResponse.json({
          content: result.finalResponse,
          inputTokens: result.totalInputTokens,
          outputTokens: result.totalOutputTokens,
          cost: result.cost,
          model: result.model,
          provider: result.provider,
          chatId: chat.id,
          messageId: assistantMsg.id,
          agentic: true,
          agentType: agent.type,
          totalSteps: result.totalSteps,
          usedTools: result.usedTools,
          steps: result.steps.map(s => ({
            type: s.type,
            content: s.type === "thinking"
              ? s.content.substring(0, 500)
              : s.type === "tool_result"
                ? (s.toolResult || s.content).substring(0, 2000)
                : s.type === "tool_call"
                  ? `${s.toolName}(${Object.entries(s.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`
                  : s.content.substring(0, 2000),
            toolName: s.toolName,
            toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 2000) : undefined,
            toolArgs: s.type === "tool_call" ? s.toolArgs : undefined,
            stepNumber: s.stepNumber,
          })),
          thinkingPreview: result.thinkingContent?.substring(0, 500),
        })
      } catch (err: any) {
        lastError = err
        console.error(`[agent-chat] Key "${key.keyName}" failed:`, err.message)

        if (err.message.includes("Insufficient balance")) {
          await db.apiKey.update({ where: { id: key.id }, data: { status: "EXHAUSTED" } })
        }
        continue
      }
    }

    // All keys failed
    await db.agent.update({ where: { id: agentId }, data: { status: "ERROR" } })

    const isRateLimit = lastError?.message?.includes("rate limit") || lastError?.message?.includes("429")
    return NextResponse.json({
      error: isRateLimit
        ? "AI model is currently busy. Please try again in a moment."
        : `Agentic execution failed: ${lastError?.message || "All API keys failed"}. Please check your Z.ai API key.`,
      chatId: chat.id,
      steps: allSteps.map(s => ({
        type: s.type,
        content: s.content.substring(0, 300),
        toolName: s.toolName,
        stepNumber: s.stepNumber,
      })),
    }, { status: isRateLimit ? 503 : 500 })

  } catch (error: any) {
    console.error("[agent-chat] Unhandled error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
