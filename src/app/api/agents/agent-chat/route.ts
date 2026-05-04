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
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

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
      descriptions.push(`[Attachment ${i + 1}]: File was attached but analysis failed`)
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

    // Fix #25: Rate limiting for agentic chat
    const { success: rateLimitOk, remaining } = rateLimit(
      `agent-chat:${userId}:${agentId}`,
      RATE_LIMITS.agentChat.limit,
      RATE_LIMITS.agentChat.windowMs
    )
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429 }
      )
    }

    // Fix #17: Validate file attachment limits
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

    // Get API keys for agentic mode (Z.ai for function calling, or NVIDIA for Trishul AI)
    const isNvidiaModel = agent.model?.startsWith("z-ai/") || agent.model?.includes("nvidia")
    
    // For NVIDIA models, look for NVIDIA keys; otherwise, look for Z.ai keys
    // Also allow cross-provider: if the model is NVIDIA but no NVIDIA keys exist, fall back to Z.ai
    const nvidiaKeys = isNvidiaModel ? await db.apiKey.findMany({
      where: {
        provider: "NVIDIA",
        status: { in: ["ACTIVE", "ERROR"] },
      },
      orderBy: { priority: "asc" },
    }) : []

    const zaiKeys = await db.apiKey.findMany({
      where: {
        provider: "ZAI",
        status: { in: ["ACTIVE", "ERROR"] },
      },
      orderBy: { priority: "asc" },
    })

    // Combine keys: NVIDIA first (if model is NVIDIA), then Z.ai as fallback
    const allAgenticKeys = isNvidiaModel ? [...nvidiaKeys, ...zaiKeys] : [...zaiKeys, ...nvidiaKeys]

    // Filter keys assigned to this agent type
    let eligibleKeys = allAgenticKeys.filter((k) => {
      try {
        const assigned = JSON.parse(k.assignedAgents || "[]")
        return assigned.length === 0 || assigned.includes(agent.type)
      } catch { return true }
    })

    // ── Environment Variable Fallback ──
    // If no NVIDIA keys in DB but NVIDIA_API_KEY is set in env, create a synthetic key entry
    // Also add as last-resort fallback when DB NVIDIA keys are invalid
    // This allows Trishul AI to work even when the user hasn't manually added the key via the dashboard
    const nvidiaEnvKey = process.env.NVIDIA_API_KEY
    if (isNvidiaModel && nvidiaEnvKey && nvidiaEnvKey.trim() !== "") {
      const hasNvidiaKeyInDb = eligibleKeys.some(k => k.provider === "NVIDIA")
      if (!hasNvidiaKeyInDb) {
        console.log("[agent-chat] No NVIDIA key in DB, using NVIDIA_API_KEY from environment as primary")
        eligibleKeys.unshift({
          id: "env-nvidia-key",
          provider: "NVIDIA",
          keyName: "NVIDIA API Key (from env)",
          keyValue: nvidiaEnvKey.trim(),
          monthlyBudget: 0,
          currentSpend: 0,
          status: "ACTIVE",
          priority: 0, // Highest priority
          assignedAgents: "[]",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      } else {
        // DB has NVIDIA keys — add env key as last-resort fallback (in case DB keys are invalid)
        eligibleKeys.push({
          id: "env-nvidia-key-fallback",
          provider: "NVIDIA",
          keyName: "NVIDIA API Key (from env, fallback)",
          keyValue: nvidiaEnvKey.trim(),
          monthlyBudget: 0,
          currentSpend: 0,
          status: "ACTIVE",
          priority: 999, // Lowest priority (tried last)
          assignedAgents: "[]",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      }
    }

    // Also add ZAI_API_KEY env fallback for non-NVIDIA models
    const zaiEnvKey = process.env.ZAI_API_KEY
    if (!isNvidiaModel && zaiEnvKey && zaiEnvKey.trim() !== "") {
      const hasZaiKeyInDb = eligibleKeys.some(k => k.provider === "ZAI")
      if (!hasZaiKeyInDb) {
        console.log("[agent-chat] No Z.ai key in DB, using ZAI_API_KEY from environment as primary")
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
        // DB has Z.ai keys — add env key as last-resort fallback
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
        error: isNvidiaModel
          ? "No active NVIDIA API key available for Trishul AI. Please add an NVIDIA API key in API Keys page, set NVIDIA_API_KEY in your .env file, or add a Z.ai key as fallback."
          : "No active Z.ai API key available for agentic mode. Agentic agents require a Z.ai API key with GLM-4.5-Flash or GLM-5.1, or an NVIDIA key with Trishul AI. Please add one in API Keys page or set ZAI_API_KEY in your .env file.",
        chatId: chat.id,
      }, { status: 400 })
    }

    // Feature 6: Don't update agent.status to RUNNING per-chat.
    // Agent status should not be global - each chat is independent.
    // We track activity at the chat level, not the agent level.

    // Mark chat as processing (persists across navigation)
    await db.chat.update({
      where: { id: chat.id },
      data: { isProcessing: true },
    }).catch(() => {})

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
          // Wrap the entire stream body in a try-catch to prevent unhandled errors
          // from crashing the stream without sending a proper error event
          try {
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
                maxTokens: 16384,
                agentType: agent.type,
                systemPrompt,
                tools,
                provider: key.provider,
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
                steps: result.steps.map(s => {
                  // BUG FIX: For tool_call steps, preserve full toolArgs so the frontend
                  // Code Generated section can show actual code content from toolArgs.content
                  // For write_file/edit_file, toolArgs.content contains the actual code
                  if (s.type === "tool_call" && s.toolArgs) {
                    // Smart truncation: keep path/description full, truncate content to 50KB
                    const truncatedArgs: Record<string, any> = {};
                    for (const [k, v] of Object.entries(s.toolArgs)) {
                      if (typeof v === 'string' && v.length > 50000) {
                        truncatedArgs[k] = v.substring(0, 50000) + `\n... (truncated ${v.length - 50000} chars)`;
                      } else {
                        truncatedArgs[k] = v;
                      }
                    }
                    return {
                      type: s.type,
                      toolName: s.toolName,
                      content: `${s.toolName}(${Object.entries(s.toolArgs).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`,
                      toolArgs: truncatedArgs,
                    };
                  }
                  return {
                    type: s.type,
                    toolName: s.toolName,
                    content: s.type === "thinking"
                      ? s.content.substring(0, 500)
                      : s.type === "tool_result"
                        ? s.content.substring(0, 2000)
                        : s.content.substring(0, 2000),
                    toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : undefined,
                  };
                }),
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

              // Mark chat as no longer processing
              await db.chat.update({
                where: { id: chat.id },
                data: { isProcessing: false },
              }).catch(() => {})

              // Fix #2, #9, #18: Secure auto-push using GIT_ASKPASS (token never in URL). Commit only — push requires approval.
              if (agent.roleConfig?.autoPushEnabled && agent.roleConfig.githubRepo && agent.roleConfig.githubToken) {
                const hasCodeChanges = result.usedTools.includes('write_file') || result.usedTools.includes('edit_file')
                if (hasCodeChanges) {
                  try {
                    const { exec } = require("child_process")
                    const { promisify } = require("util")
                    const execAsync = promisify(exec)
                    const fs = require("fs")
                    const path = require("path")
                    const crypto = require("crypto")
                    let projectRoot = process.cwd()
                    try {
                      const testFile = path.join(projectRoot, '.write-test-' + Date.now())
                      fs.writeFileSync(testFile, 'test', 'utf-8')
                      fs.unlinkSync(testFile)
                    } catch {
                      projectRoot = '/tmp/agent-workspace'
                      try {
                        if (!fs.existsSync(projectRoot)) fs.mkdirSync(projectRoot, { recursive: true })
                      } catch {}
                    }

                    // Set remote URL WITHOUT token
                    const repoUrl = agent.roleConfig.githubRepo
                    const token = agent.roleConfig.githubToken

                    // SECURITY FIX: Validate repoUrl is a valid HTTPS Git URL to prevent command injection
                    const validGitUrlRegex = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}[a-zA-Z0-9\-._\/]*$/
                    if (!validGitUrlRegex.test(repoUrl)) {
                      console.error(`[agent-chat] Invalid GitHub repo URL rejected: ${repoUrl}`)
                      throw new Error('Invalid repository URL format')
                    }

                    // Create a temporary GIT_ASKPASS script that provides the token
                    const askpassId = crypto.randomBytes(8).toString('hex')
                    const askpassPath = `/tmp/git-askpass-${askpassId}.sh`
                    const credsPath = `/tmp/git-creds-${askpassId}`
                    fs.writeFileSync(askpassPath, `#!/bin/sh\ncat ${credsPath}\n`, { mode: 0o755 })
                    fs.writeFileSync(credsPath, `protocol=https\nhost=${new URL(repoUrl).hostname}\nusername=TrishulHub\npassword=${token}\n`)

                    try {
                      // Set remote without token
                      await execAsync(`git -C "${projectRoot}" remote set-url origin ${repoUrl}`, { timeout: 10000 }).catch(() => {})
                      await execAsync(`git -C "${projectRoot}" add -A`, { timeout: 15000 }).catch(() => {})
                      const { stdout: statusOut } = await execAsync(`git -C "${projectRoot}" status --porcelain`, { timeout: 10000 }).catch(() => ({ stdout: '' }))

                      if (statusOut.trim()) {
                        // Sanitize commit message (no shell metacharacters)
                        const rawMsg = `Auto-push by ${agent.name}: ${enrichedMessage.substring(0, 80)}`
                        const safeMessage = rawMsg.replace(/[^a-zA-Z0-9 .,\-_@\/:()]/g, ' ').substring(0, 200)

                        await execAsync(`git -C "${projectRoot}" commit -m "${safeMessage}"`, { timeout: 15000 }).catch(() => {})

                        // Fix #18: Commit but do NOT auto-push. Notify admin instead.
                        console.log(`[agent-chat] Code committed by ${agent.name}, push requires approval`)

                        // Notify admin about pending push
                        await db.notification.create({
                          data: {
                            userId,
                            title: `Code ready to push - ${agent.name}`,
                            message: `${agent.name} has committed code changes. Review and push when ready. Commit: "${safeMessage}"`,
                            type: "AGENT",
                            link: `/dashboard/agents/${agent.id}`,
                            metadata: JSON.stringify({ agentId: agent.id, autoPush: true, commitMessage: safeMessage }),
                          },
                        }).catch(() => {})
                      }
                    } finally {
                      // CRITICAL: Always clean up credential files
                      try { fs.unlinkSync(askpassPath) } catch {}
                      try { fs.unlinkSync(credsPath) } catch {}
                    }
                  } catch (gitErr: any) {
                    console.error(`[agent-chat] Auto-push failed:`, gitErr.message)
                  }
                }
              }

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

              // Cross-agent automation: check triggers after successful agentic response
              try {
                const lowerMsg = enrichedMessage.toLowerCase()
                const lowerResp = result.finalResponse.toLowerCase()

                // CLIENT_HUNTER finds lead → Notify Finance
                if (agent.type === "CLIENT_HUNTER" &&
                    (lowerMsg.includes("find") || lowerMsg.includes("search") || lowerMsg.includes("client")) &&
                    (lowerResp.includes("potential client") || lowerResp.includes("lead") || lowerResp.includes("business"))) {
                  const financeAgent = await db.agent.findFirst({ where: { type: "FINANCE" } })
                  if (financeAgent) {
                    await db.crossAgentMessage.create({
                      data: {
                        fromAgentId: agent.id, toAgentId: financeAgent.id, chatId: chat.id,
                        message: `New lead found by Client Hunter. Please prepare cost estimation. Summary: ${result.finalResponse.substring(0, 300)}`,
                        type: "REQUEST", status: "PENDING",
                      }
                    })
                  }
                }

                // PROJECT_MANAGER assigns dev work → Notify Dev Agent
                if (agent.type === "PROJECT_MANAGER" &&
                    (lowerResp.includes("assign") || lowerResp.includes("task") || lowerResp.includes("phase")) &&
                    lowerResp.includes("develop")) {
                  const devAgent = await db.agent.findFirst({ where: { type: "DEV" } })
                  if (devAgent) {
                    await db.crossAgentMessage.create({
                      data: {
                        fromAgentId: agent.id, toAgentId: devAgent.id, chatId: chat.id,
                        message: `New development task assigned by PM. Details: ${result.finalResponse.substring(0, 300)}`,
                        type: "REQUEST", status: "PENDING",
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
                        fromAgentId: agent.id, toAgentId: devAgent.id, chatId: chat.id,
                        message: `Support ticket escalated. Issue: ${result.finalResponse.substring(0, 300)}`,
                        type: "ALERT", status: "PENDING",
                      }
                    })
                  }
                }

                // HR workload alert → Notify PM
                if (agent.type === "HR" && (lowerResp.includes("overwork") || lowerResp.includes("capacity"))) {
                  const pmAgent = await db.agent.findFirst({ where: { type: "PROJECT_MANAGER" } })
                  if (pmAgent) {
                    await db.crossAgentMessage.create({
                      data: {
                        fromAgentId: agent.id, toAgentId: pmAgent.id, chatId: chat.id,
                        message: `HR workload alert: ${result.finalResponse.substring(0, 300)}`,
                        type: "ALERT", status: "PENDING",
                      }
                    })
                  }
                }
              } catch (automationErr: any) {
                console.error("[agent-chat] Automation trigger error:", automationErr.message)
              }

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
                steps: result.steps.map(s => {
                  // BUG FIX: Preserve full toolArgs in SSE complete event for frontend code display
                  if (s.type === "tool_call" && s.toolArgs) {
                    const truncatedArgs: Record<string, any> = {};
                    for (const [k, v] of Object.entries(s.toolArgs)) {
                      if (typeof v === 'string' && v.length > 50000) {
                        truncatedArgs[k] = v.substring(0, 50000) + `\n... (truncated)`;
                      } else {
                        truncatedArgs[k] = v;
                      }
                    }
                    return {
                      type: s.type,
                      content: `${s.toolName}(${Object.entries(s.toolArgs).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`,
                      toolName: s.toolName,
                      toolArgs: truncatedArgs,
                      stepNumber: s.stepNumber,
                    };
                  }
                  return {
                    type: s.type,
                    content: s.type === "thinking"
                      ? s.content.substring(0, 500)
                      : s.type === "tool_result"
                        ? (s.toolResult || s.content).substring(0, 5000)
                        : s.content.substring(0, 2000),
                    toolName: s.toolName,
                    toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : undefined,
                    stepNumber: s.stepNumber,
                  };
                }),
                thinkingPreview: result.thinkingContent?.substring(0, 500),
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`))
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
              controller.close()
              return
            } catch (err: any) {
              lastError = err
              console.error(`[agent-chat] Key "${key.keyName}" failed:`, err.message)

              if (err.message.includes("Insufficient balance") && !key.id.startsWith("env-")) {
                await db.apiKey.update({ where: { id: key.id }, data: { status: "EXHAUSTED" } })
              }
              // Mark invalid DB keys as ERROR so they get skipped next time
              if ((err.message.includes("Invalid authentication") || err.message.includes("401") || err.message.includes("403")) && !key.id.startsWith("env-")) {
                await db.apiKey.update({ where: { id: key.id }, data: { status: "ERROR" } }).catch(() => {})
              }
              continue // Try next key
            }
          }

          // All keys failed
          await db.agent.update({ where: { id: agentId }, data: { status: "ERROR" } })
          // Clear processing state on error
          await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false } }).catch(() => {})

          const isRateLimit = lastError?.message?.includes("rate limit") || lastError?.message?.includes("429")
          const isNvidiaAuth = lastError?.message?.includes("NVIDIA API: Invalid authentication")
          console.error("[agent-chat] All keys failed:", lastError?.message)

          let errorMessage = "Agentic execution failed. Please check your API keys."
          if (isRateLimit) {
            errorMessage = "AI model is currently busy. Please try again in a moment."
          } else if (isNvidiaAuth) {
            errorMessage = "Trishul AI (NVIDIA) authentication failed. The NVIDIA API key is invalid or expired. Please update it in the API Keys page or set a valid NVIDIA_API_KEY in your .env file."
          }

          const errorData = {
            type: "error",
            message: errorMessage,
            chatId: chat.id,
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()

          } catch (streamErr: any) {
            // Outer catch: handle any unhandled errors in the stream
            console.error("[agent-chat] Unhandled stream error:", streamErr.message)
            try {
              // Clear processing state
              await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false } }).catch(() => {})
              // Try to send an error event before closing
              const errData = {
                type: "error",
                message: "An agent chat error occurred. Please try again.",
                chatId: chat.id,
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errData)}\n\n`))
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
            } catch {
              // If we can't send error event, just close
              try { controller.close() } catch {}
            }
          }
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
          provider: key.provider,
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
          steps: result.steps.map(s => {
            // BUG FIX: Preserve full toolArgs in non-streaming path too
            if (s.type === "tool_call" && s.toolArgs) {
              const truncatedArgs: Record<string, any> = {};
              for (const [k, v] of Object.entries(s.toolArgs)) {
                if (typeof v === 'string' && v.length > 50000) {
                  truncatedArgs[k] = v.substring(0, 50000) + `\n... (truncated)`;
                } else {
                  truncatedArgs[k] = v;
                }
              }
              return {
                type: s.type,
                toolName: s.toolName,
                content: `${s.toolName}(${Object.entries(s.toolArgs).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`,
                toolArgs: truncatedArgs,
              };
            }
            return {
              type: s.type,
              toolName: s.toolName,
              content: s.type === "thinking"
                ? s.content.substring(0, 500)
                : s.type === "tool_result"
                  ? s.content.substring(0, 2000)
                  : s.content.substring(0, 2000),
              toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : undefined,
            };
          }),
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

        // Mark chat as no longer processing
        await db.chat.update({
          where: { id: chat.id },
          data: { isProcessing: false },
        }).catch(() => {})

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

        // Cross-agent automation triggers (same as streaming path)
        try {
          const lowerMsg = enrichedMessage.toLowerCase()
          const lowerResp = result.finalResponse.toLowerCase()

          if (agent.type === "CLIENT_HUNTER" && (lowerMsg.includes("find") || lowerMsg.includes("search") || lowerMsg.includes("client")) && (lowerResp.includes("lead") || lowerResp.includes("business"))) {
            const financeAgent = await db.agent.findFirst({ where: { type: "FINANCE" } })
            if (financeAgent) await db.crossAgentMessage.create({ data: { fromAgentId: agent.id, toAgentId: financeAgent.id, chatId: chat.id, message: `New lead found. Prepare cost estimation: ${result.finalResponse.substring(0, 300)}`, type: "REQUEST", status: "PENDING" } })
          }
          if (agent.type === "PROJECT_MANAGER" && lowerResp.includes("assign") && lowerResp.includes("develop")) {
            const devAgent = await db.agent.findFirst({ where: { type: "DEV" } })
            if (devAgent) await db.crossAgentMessage.create({ data: { fromAgentId: agent.id, toAgentId: devAgent.id, chatId: chat.id, message: `Dev task assigned: ${result.finalResponse.substring(0, 300)}`, type: "REQUEST", status: "PENDING" } })
          }
          if (agent.type === "SUPPORT" && lowerResp.includes("escalat")) {
            const devAgent = await db.agent.findFirst({ where: { type: "DEV" } })
            if (devAgent) await db.crossAgentMessage.create({ data: { fromAgentId: agent.id, toAgentId: devAgent.id, chatId: chat.id, message: `Support escalation: ${result.finalResponse.substring(0, 300)}`, type: "ALERT", status: "PENDING" } })
          }
          if (agent.type === "HR" && (lowerResp.includes("overwork") || lowerResp.includes("capacity"))) {
            const pmAgent = await db.agent.findFirst({ where: { type: "PROJECT_MANAGER" } })
            if (pmAgent) await db.crossAgentMessage.create({ data: { fromAgentId: agent.id, toAgentId: pmAgent.id, chatId: chat.id, message: `HR workload alert: ${result.finalResponse.substring(0, 300)}`, type: "ALERT", status: "PENDING" } })
          }
        } catch (automationErr: any) {
          console.error("[agent-chat] Automation trigger error:", automationErr.message)
        }

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
          steps: result.steps.map(s => {
            if (s.type === "tool_call" && s.toolArgs) {
              const truncatedArgs: Record<string, any> = {};
              for (const [k, v] of Object.entries(s.toolArgs)) {
                if (typeof v === 'string' && v.length > 50000) {
                  truncatedArgs[k] = v.substring(0, 50000) + `\n... (truncated)`;
                } else {
                  truncatedArgs[k] = v;
                }
              }
              return {
                type: s.type,
                content: `${s.toolName}(${Object.entries(s.toolArgs).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`,
                toolName: s.toolName,
                toolArgs: truncatedArgs,
                stepNumber: s.stepNumber,
              };
            }
            return {
              type: s.type,
              content: s.type === "thinking"
                ? s.content.substring(0, 500)
                : s.type === "tool_result"
                  ? (s.toolResult || s.content).substring(0, 5000)
                  : s.content.substring(0, 2000),
              toolName: s.toolName,
              toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : undefined,
              stepNumber: s.stepNumber,
            };
          }),
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
    // Clear processing state on error
    await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false } }).catch(() => {})

    const isRateLimit = lastError?.message?.includes("rate limit") || lastError?.message?.includes("429")
    console.error("[agent-chat] All keys failed:", lastError?.message)
    return NextResponse.json({
      error: isRateLimit
        ? "AI model is currently busy. Please try again in a moment."
        : "Agentic execution failed. Please check your Z.ai API key.",
      chatId: chat.id,
      steps: allSteps.map(s => ({
        type: s.type,
        content: s.content.substring(0, 300),
        toolName: s.toolName,
        stepNumber: s.stepNumber,
      })),
    }, { status: isRateLimit ? 503 : 500 })

  } catch (error: any) {
    console.error("[agent-chat] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
