// Agentic Chat API - Multi-agent autonomous execution endpoint
// Supports ALL agent types with role-specific tools, thinking mode, and autonomous loop
// Each agent type gets its own system prompt and tool set
// Supports SSE streaming for real-time step updates
// NVIDIA/Trishul AI: Direct streaming — bypasses agent loop, streams live response

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { runAgentLoop, AgentStep } from "@/lib/ai/agent-loop"
import { getToolsForAgentType } from "@/lib/ai/agent-tools"
import { NVIDIA_API_URL, ZAI_API_URL } from "@/lib/ai/endpoints"
import { generateZaiToken } from "@/lib/ai/jwt-utils"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ── Analyze file attachments with Z.ai Vision API ──
// The agentic model (glm-4.5-flash) is text-only and doesn't support image_url.
// So we first analyze images/files with the vision model, then pass the description as text.
async function analyzeFileAttachments(
  fileUrls: string[],
  apiKey: string
): Promise<string> {
  // Generate JWT token for Z.ai using shared utility
  const token = await generateZaiToken(apiKey)

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
          signal: AbortSignal.timeout(60000), // 60s timeout for vision API
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

// ── NVIDIA Direct Streaming (Trishul AI) ──
// GLM 5.1 handles agentic behavior internally via its thinking/reasoning mode.
// We bypass the agent loop entirely and stream the live response directly.
// This gives users real-time text as the model generates it, just like z.ai.
async function nvidiaDirectStream(
  messages: Array<{ role: string; content: string }>,
  model: string,
  apiKey: string,
  systemPrompt: string | undefined,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<{ fullContent: string; fullReasoning: string; inputTokens: number; outputTokens: number }> {
  // Build messages for NVIDIA API
  const nvidiaMessages: Array<{ role: string; content: string }> = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages,
  ]

  const body = {
    model,
    messages: nvidiaMessages,
    max_tokens: 16384,
    temperature: 0.3,
    top_p: 0.7,
    stream: true, // Enable streaming
    chat_template_kwargs: {
      enable_thinking: true,
      clear_thinking: false,
    },
  }

  console.log(`[nvidia-stream] Starting direct stream with model: ${model}`)

  // Add timeout protection
  const NVIDIA_TIMEOUT_MS = 180000 // 3 minutes max
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), NVIDIA_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status
    console.error(`[nvidia-stream] API error: ${statusCode} - ${errorText.substring(0, 300)}`)
    
    if (statusCode === 429) {
      throw new Error(`NVIDIA rate limit (temporary)`)
    }
    if (statusCode === 401 || statusCode === 403) {
      throw new Error(`NVIDIA API: Invalid authentication`)
    }
    throw new Error(`NVIDIA API error: ${statusCode}`)
  }

  // Parse the SSE stream from NVIDIA
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body from NVIDIA API")

  const decoder = new TextDecoder()
  let buffer = ""
  let fullContent = ""
  let fullReasoning = ""
  let inputTokens = 0
  let outputTokens = 0
  let thinkingIndicatorSent = false

  // Send a "thinking" step so the UI shows something immediately
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
      type: "step",
      step: {
        type: "thinking",
        content: "Trishul AI is thinking...",
        stepNumber: 1,
      }
    })}\n\n`))
  } catch { console.warn('[nvidia-stream] Failed to send thinking step') }

  while (true) {
    let readResult: { done: boolean; value: Uint8Array | undefined }
    try {
      readResult = await new Promise<{ done: boolean; value: Uint8Array | undefined }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Stream read timeout')), 120000)
        reader.read().then(
          (result) => { clearTimeout(timeout); resolve(result as any); },
          (err) => { clearTimeout(timeout); reject(err); }
        )
      })
    } catch (readErr: any) {
      console.warn(`[nvidia-stream] Stream read error: ${readErr.message}`)
      break
    }

    const { done, value } = readResult
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (data === "[DONE]") continue

      try {
        const chunk = JSON.parse(data)
        const delta = chunk.choices?.[0]?.delta
        const usage = chunk.usage

        // Capture token usage from the final chunk
        if (usage) {
          inputTokens = usage.prompt_tokens || 0
          outputTokens = usage.completion_tokens || 0
        }

        if (!delta) continue

        // Handle tool calls in the stream (GLM 5.1 may return tool_calls during agentic work)
        // We show them as step indicators but don't execute them — the model continues its response
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const toolName = tc.function?.name || tc.function?.arguments?.split("(")[0] || "tool"
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "step",
                step: {
                  type: "tool_call",
                  content: `Using ${toolName}...`,
                  toolName,
                  stepNumber: 1,
                }
              })}\n\n`))
            } catch {}
          }
        }

        // Handle reasoning content (thinking)
        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content
          // Send only a generic "thinking" indicator, NOT the actual reasoning content
          if (!thinkingIndicatorSent) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "thinking",
                content: "Analyzing your request...",
              })}\n\n`))
              thinkingIndicatorSent = true
            } catch {}
          }
          // Raw reasoning is accumulated server-side only for debugging
        }

        // Handle actual content (the user-facing response)
        if (delta.content) {
          fullContent += delta.content
          // Send content chunks to frontend for live display
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "chunk",
              content: delta.content,
            })}\n\n`))
          } catch {}
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  }

  // TODO: Extract processSSEChunk shared function — NVIDIA SSE buffer processing logic is duplicated between main loop and remaining buffer
  // Process remaining buffer
  if (buffer.trim()) {
    const remainingLines = buffer.split("\n")
    for (const line of remainingLines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (data === "[DONE]") continue
      try {
        const chunk = JSON.parse(data)
        const delta = chunk.choices?.[0]?.delta
        if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const toolName = tc.function?.name || "tool"
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "step",
                step: {
                  type: "tool_call",
                  content: `Using ${toolName}...`,
                  toolName,
                  stepNumber: 1,
                }
              })}\n\n`))
            } catch {}
          }
        }
        if (delta?.reasoning_content) {
          fullReasoning += delta.reasoning_content
          // Send only a generic "thinking" indicator, NOT the actual reasoning content
          if (!thinkingIndicatorSent) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "thinking",
                content: "Analyzing your request...",
              })}\n\n`))
              thinkingIndicatorSent = true
            } catch {}
          }
          // Raw reasoning is accumulated server-side only for debugging
        }
        if (delta?.content) {
          fullContent += delta.content
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "chunk",
              content: delta.content,
            })}\n\n`))
          } catch {}
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0
          outputTokens = chunk.usage.completion_tokens || 0
        }
      } catch {}
    }
  }

  console.log(`[nvidia-stream] Stream complete: content=${fullContent.length} chars, reasoning=${fullReasoning.length} chars, tokens=${inputTokens}/${outputTokens}`)

  return { fullContent, fullReasoning, inputTokens, outputTokens }
}

export async function POST(req: NextRequest) {
  let chat: any = null // Declared here so outer catch can access it for lock release
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { agentId, message, chatId, stream, fileUrls } = await req.json()
    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 })
    }
    // Validate message length
    if (message.length > 10000) {
      return NextResponse.json({ error: "Message too long (max 10000 characters)" }, { status: 400 })
    }

    // Fix #25: Rate limiting for agentic chat
    const { success: rateLimitOk } = rateLimit(
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
    const userRole = session.user.role
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
    // FIX: Removed `let` to avoid shadowing outer-scope `chat` variable (line 330).
    // The outer variable is needed in the catch block for lock release.
    chat = null
    if (chatId) {
      chat = await db.chat.findUnique({
        where: { id: chatId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
      // FIX: Admin/SuperAdmin can access other users' chats
      const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
      if (!chat || (!isAdminUser && chat.userId !== userId)) {
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
        // Update in-memory object to reflect DB change
        chat = { ...chat, lockedBy: null, lockedAt: null, lockedByName: null }
      }

      // Reject messages to ENDED chats
      if (chat.status === "ENDED") {
        return NextResponse.json({ error: "This chat has ended. Please start a new chat." }, { status: 400 })
      }

      // Auto-acquire lock when user sends first message to a chat
      // CRITICAL FIX: Use atomic updateMany to prevent TOCTOU race condition
      if (!chat.lockedBy) {
        const userName = session.user.name || session.user.email || "Unknown"
        const lockResult = await db.chat.updateMany({
          where: { id: chatId, lockedBy: null },
          data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
        })
        if (lockResult.count === 0) {
          // Lock was acquired by another user between our check and update
          const freshChat = await db.chat.findUnique({ where: { id: chatId }, select: { lockedBy: true, lockedByName: true } })
          if (freshChat?.lockedBy && freshChat.lockedBy !== userId) {
            return NextResponse.json({
              error: `${freshChat.lockedByName || 'Another user'} is currently working on this chat`,
              lockedBy: freshChat.lockedBy,
              lockedByName: freshChat.lockedByName,
            }, { status: 423 })
          }
        }
        chat = { ...chat, lockedBy: userId, lockedAt: new Date(), lockedByName: userName }
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
          lockedByName: session.user.name || session.user.email || "Unknown",
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

    // Always add ZAI_API_KEY env fallback (needed as agent loop fallback when NVIDIA direct stream fails)
    const zaiEnvKey = process.env.ZAI_API_KEY
    if (zaiEnvKey && zaiEnvKey.trim() !== "") {
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
        // FIX: Use Z.ai key for vision analysis (calls glm-4v-flash on Z.ai API), not NVIDIA key
        const zaiKey = eligibleKeys.find(k => k.provider === "ZAI")?.keyValue || eligibleKeys[0].keyValue
        const fileDescriptions = await analyzeFileAttachments(fileUrls, zaiKey)
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
      // Track if client has disconnected so we can stop processing
      let clientDisconnected = false

      const readableStream = new ReadableStream({
        async start(controller) {
          // Listen for client disconnect via req.signal (Next.js provides this)
          // This helps detect when the user navigates away or closes the tab
          req.signal.addEventListener('abort', () => {
            clientDisconnected = true
            console.log(`[agent-chat] Request aborted — client disconnected from chat ${chat.id}`)
          }, { once: true })

          // Wrap the entire stream body in a try-catch to prevent unhandled errors
          // from crashing the stream without sending a proper error event
          try {
          let lastError: Error | null = null
          let success = false

          // ── NVIDIA Direct Streaming (Trishul AI) ──
          // GLM 5.1 handles agentic behavior internally — no need for our agent loop.
          // We stream the live response directly from the NVIDIA API.
          const isNvidiaDirect = isNvidiaModel && eligibleKeys.some(k => k.provider === "NVIDIA")

          if (isNvidiaDirect) {
            // Get NVIDIA keys (prioritized)
            const nvidiaKeys = eligibleKeys.filter(k => k.provider === "NVIDIA")
            const otherKeys = eligibleKeys.filter(k => k.provider !== "NVIDIA")

            // Try NVIDIA keys first, then fallback to other keys with agent loop
            let nvidiaSuccess = false
            for (const key of nvidiaKeys) {
              try {
                // Build messages for the direct API call
                const directMessages = [
                  ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
                  { role: "user" as const, content: enrichedMessage },
                ]

                const streamResult = await nvidiaDirectStream(
                  directMessages,
                  agent.model,
                  key.keyValue,
                  systemPrompt,
                  controller,
                  encoder,
                )

                nvidiaSuccess = true
                success = true

                // If content is empty, use a safe placeholder — never expose reasoning_content to users
                // (Security: agent-loop.ts explicitly avoids promoting reasoning to content)
                let finalContent = streamResult.fullContent
                if (!finalContent || finalContent.trim() === '') {
                  if (streamResult.fullReasoning) {
                    // Log for debugging but don't expose reasoning to users
                    console.log("[agent-chat] NVIDIA stream: content was empty but reasoning exists (length:", streamResult.fullReasoning.length, "). Using placeholder.")
                    finalContent = "I processed your request but couldn't generate a clear response. Please try rephrasing your question."
                  } else {
                    finalContent = "No response received from Trishul AI."
                  }
                }

                // Estimate cost
                const cost = (streamResult.inputTokens * 2.0 + streamResult.outputTokens * 8.0) / 1000000

                // If the used key was previously ERROR, mark it as ACTIVE
                if (key.status === "ERROR" && !key.id.startsWith("env-")) {
                  await db.apiKey.update({ where: { id: key.id }, data: { status: "ACTIVE" } })
                }

                // Update agent's preferred key
                if (agent.apiKeyId !== key.id) {
                  await db.agent.update({ where: { id: agentId }, data: { apiKeyId: key.id } })
                }

                // Build metadata
                const metadata: any = {
                  tokens: { input: streamResult.inputTokens, output: streamResult.outputTokens },
                  cost,
                  model: agent.model,
                  provider: "nvidia",
                  apiKeyId: key.id,
                  agentic: true,
                  agentType: agent.type,
                  totalSteps: 1,
                  usedTools: [],
                  steps: [],
                  isNvidiaDirect: true,
                }

                // Save assistant message to DB
                const assistantMsg = await db.chatMessage.create({
                  data: {
                    chatId: chat.id,
                    role: "assistant",
                    content: finalContent,
                    metadata: JSON.stringify(metadata),
                  },
                })

                // Mark chat as no longer processing
                await db.chat.update({
                  where: { id: chat.id },
                  data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null },
                }).catch(() => {})

                // Log usage
                await db.apiUsageLog.create({
                  data: {
                    apiKeyId: key.id,
                    agentId: agent.id,
                    model: agent.model,
                    inputTokens: streamResult.inputTokens,
                    outputTokens: streamResult.outputTokens,
                    cost,
                  },
                })

                // Update key spend
                if (!key.id.startsWith("env-")) {
                  await db.apiKey.update({
                    where: { id: key.id },
                    data: { currentSpend: { increment: cost } },
                  })
                }

                // Send complete event
                const completeData = {
                  type: "complete",
                  content: finalContent,
                  inputTokens: streamResult.inputTokens,
                  outputTokens: streamResult.outputTokens,
                  cost,
                  model: agent.model,
                  provider: "nvidia",
                  chatId: chat.id,
                  messageId: assistantMsg.id,
                  agentic: true,
                  agentType: agent.type,
                  totalSteps: 1,
                  usedTools: [],
                  steps: [],
                  isNvidiaDirect: true,
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`))
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
                controller.close()
                return
              } catch (err: any) {
                lastError = err
                console.error(`[agent-chat] NVIDIA direct stream key "${key.keyName}" failed:`, err.message)

                if (err.message.includes("Invalid authentication") && !key.id.startsWith("env-")) {
                  await db.apiKey.update({ where: { id: key.id }, data: { status: "ERROR" } }).catch(() => {})
                }
                continue // Try next NVIDIA key
              }
            }

            // If all NVIDIA direct streams failed, try fallback keys with agent loop
            if (!clientDisconnected && !nvidiaSuccess && otherKeys.length > 0) {
              console.log(`[agent-chat] NVIDIA direct stream failed, falling back to agent loop with ${otherKeys.length} keys`)
              // Fall through to the agent loop below with non-NVIDIA keys
              for (const key of otherKeys) {
                try {
                  const result = await runAgentLoop(enrichedMessage, history, key.keyValue, agent.model, {
                    maxSteps: 15,
                    maxTokens: 16384,
                    agentType: agent.type,
                    systemPrompt,
                    tools,
                    provider: key.provider,
                    onStep: (step: AgentStep) => {
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
                      } catch {}
                    },
                  })

                  success = true

                  if (key.status === "ERROR" && !key.id.startsWith("env-")) {
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
                      if (s.type === "tool_call" && s.toolArgs) {
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
                        content: s.type === "thinking" ? s.content.substring(0, 500) : s.type === "tool_result" ? s.content.substring(0, 2000) : s.content.substring(0, 2000),
                        toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : undefined,
                      };
                    }),
                  }
                  // Note: thinkingContent is NOT included in metadata — raw reasoning is server-side only

                  const assistantMsg = await db.chatMessage.create({
                    data: { chatId: chat.id, role: "assistant", content: result.finalResponse, metadata: JSON.stringify(metadata) },
                  })

                  await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})

                  await db.apiUsageLog.create({
                    data: { apiKeyId: key.id, agentId: agent.id, model: result.model, inputTokens: result.totalInputTokens, outputTokens: result.totalOutputTokens, cost: result.cost },
                  })

                  if (!key.id.startsWith("env-")) {
                    await db.apiKey.update({ where: { id: key.id }, data: { currentSpend: { increment: result.cost } } })
                  }

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
                      if (s.type === "tool_call" && s.toolArgs) {
                        const truncatedArgs: Record<string, any> = {};
                        for (const [k, v] of Object.entries(s.toolArgs)) {
                          if (typeof v === 'string' && v.length > 50000) { truncatedArgs[k] = v.substring(0, 50000) + `\n... (truncated)`; }
                          else { truncatedArgs[k] = v; }
                        }
                        return { type: s.type, content: `${s.toolName}(${Object.entries(s.toolArgs).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(", ")})`, toolName: s.toolName, toolArgs: truncatedArgs, stepNumber: s.stepNumber };
                      }
                      return { type: s.type, content: s.type === "thinking" ? s.content.substring(0, 500) : s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : s.content.substring(0, 2000), toolName: s.toolName, toolResult: s.type === "tool_result" ? (s.toolResult || s.content).substring(0, 5000) : undefined, stepNumber: s.stepNumber };
                    }),
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`))
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
                  controller.close()
                  return
                } catch (err: any) {
                  lastError = err
                  console.error(`[agent-chat] Fallback key "${key.keyName}" failed:`, err.message)
                  if (err.message.includes("Insufficient balance") && !key.id.startsWith("env-")) {
                    await db.apiKey.update({ where: { id: key.id }, data: { status: "EXHAUSTED" } })
                  }
                  if ((err.message.includes("Invalid authentication") || err.message.includes("401") || err.message.includes("403")) && !key.id.startsWith("env-")) {
                    await db.apiKey.update({ where: { id: key.id }, data: { status: "ERROR" } }).catch(() => {})
                  }
                  continue
                }
              }
            }

            // All NVIDIA + fallback keys failed
            await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})
            const isRateLimit = lastError?.message?.includes("rate limit") || lastError?.message?.includes("429")
            const isNvidiaAuth = lastError?.message?.includes("NVIDIA API: Invalid authentication")
            let errorMessage = "Trishul AI failed to respond. Please try again."
            if (isRateLimit) {
              errorMessage = "Trishul AI is currently busy. Please try again in a moment."
            } else if (isNvidiaAuth) {
              errorMessage = "Trishul AI (NVIDIA) authentication failed. The NVIDIA API key is invalid or expired."
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: errorMessage, chatId: chat.id })}\n\n`))
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
            controller.close()
            return
          }

          // ── STANDARD AGENT LOOP (Z.ai and non-NVIDIA models) ──
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
            if (clientDisconnected) { console.log("[agent-chat] Client disconnected — stopping agent loop"); break }
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
              if (key.status === "ERROR" && !key.id.startsWith("env-")) {
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

              // Note: thinkingContent is NOT included in metadata — raw reasoning is server-side only

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
                data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null },
              }).catch(() => {})

              // Fix #2, #9, #18: Secure auto-push using GIT_ASKPASS (token never in URL). Commit only — push requires approval.
              if (agent.roleConfig?.autoPushEnabled && agent.roleConfig.githubRepo && agent.roleConfig.githubToken) {
                const hasCodeChanges = result.usedTools.includes('write_file') || result.usedTools.includes('edit_file')
                if (hasCodeChanges) {
                  try {
                    const { execFile } = require("child_process")
                    const { promisify } = require("util")
                    const execFileAsync = promisify(execFile)
                    const fs = require("fs")
                    const path = require("path")
                    const os = require("os")
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
                    // FIX: Use restrictive temp directory instead of world-readable /tmp
                    const askpassId = crypto.randomBytes(8).toString('hex')
                    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-creds-'))
                    const askpassPath = path.join(tmpDir, 'askpass.sh')
                    const credsPath = path.join(tmpDir, 'creds')
                    fs.writeFileSync(askpassPath, `#!/bin/sh\ncat "${credsPath}"\n`, { mode: 0o700 })
                    fs.writeFileSync(credsPath, `protocol=https\nhost=${new URL(repoUrl).hostname}\nusername=TrishulHub\npassword=${token}\n`)
                    fs.chmodSync(credsPath, 0o600)

                    // FIX: Validate projectRoot to prevent command injection
                    if (!/^[a-zA-Z0-9_\-\/\.]+$/.test(projectRoot)) {
                      throw new Error('Invalid project root path')
                    }

                    const gitOpts = { cwd: projectRoot, timeout: 15000, maxBuffer: 1024 * 1024 }

                    try {
                      // Set remote without token (use execFileAsync to avoid shell injection)
                      await execFileAsync('git', ['remote', 'set-url', 'origin', repoUrl], { ...gitOpts, timeout: 10000 }).catch(() => {})
                      await execFileAsync('git', ['add', '-A'], { ...gitOpts, timeout: 15000 }).catch(() => {})
                      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], { ...gitOpts, timeout: 10000 }).catch(() => ({ stdout: '' }))

                      if (statusOut.trim()) {
                        // Sanitize commit message (no shell metacharacters)
                        const rawMsg = `Auto-push by ${agent.name}: ${enrichedMessage.substring(0, 80)}`
                        const safeMessage = rawMsg.replace(/[^a-zA-Z0-9 .,\-_@\/:()]/g, ' ').substring(0, 200)

                        await execFileAsync('git', ['commit', '-m', safeMessage], { ...gitOpts, timeout: 15000 }).catch(() => {})

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
                      // CRITICAL: Always clean up credential files and temp directory
                      try { fs.unlinkSync(askpassPath) } catch {}
                      try { fs.unlinkSync(credsPath) } catch {}
                      try { fs.rmdirSync(tmpDir) } catch {}
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

              // Update key spend (skip env keys — they don't exist in DB)
              if (!key.id.startsWith("env-")) {
                await db.apiKey.update({
                  where: { id: key.id },
                  data: { currentSpend: { increment: result.cost } },
                })
              }

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
          // Note: Do NOT set agent.status = "ERROR" here — agent status should not be global per-chat
          // (consistent with NVIDIA direct stream path which also doesn't set it)
          // Clear processing state on error
          await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})

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
              // Clear processing state and release lock
              await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})
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
        async cancel() {
          // Client disconnected — clear isProcessing to prevent orphaned state
          clientDisconnected = true
          console.log(`[agent-chat] Client disconnected — clearing isProcessing for chat ${chat.id}`)
          // SECURITY: Only clear the lock if it's still held by the current user
          // This prevents one user's disconnect from clearing another user's lock
          await db.chat.updateMany({
            where: { id: chat.id, lockedBy: userId },
            data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null },
          }).catch(() => {})
        },
      })

      return new Response(readableStream, {
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
        // FIX: Only update DB key status for non-env keys (env keys don't exist in DB)
        if (key.status === "ERROR" && !key.id.startsWith("env-")) {
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

        // Note: thinkingContent is NOT included in metadata — raw reasoning is server-side only

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
          data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null },
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

        // FIX: Only update DB key spend for non-env keys (env keys don't exist in DB)
        if (!key.id.startsWith("env-")) {
          await db.apiKey.update({
            where: { id: key.id },
            data: { currentSpend: { increment: result.cost } },
          })
        }

        // TODO: Extract triggerAgentAutomation shared function — cross-agent automation triggers are duplicated across multiple agent type paths
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
        })
      } catch (err: any) {
        lastError = err
        console.error(`[agent-chat] Key "${key.keyName}" failed:`, err.message)

        if (err.message.includes("Insufficient balance") && !key.id.startsWith("env-")) {
          await db.apiKey.update({ where: { id: key.id }, data: { status: "EXHAUSTED" } })
        }
        continue
      }
    }

    // All keys failed
    // Note: Do NOT set agent.status = "ERROR" here — agent status should not be global per-chat
    // (consistent with NVIDIA direct stream path which also doesn't set it)
    // Clear processing state and release lock on error
    await db.chat.update({ where: { id: chat.id }, data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null } }).catch(() => {})

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
    // CRITICAL FIX: Release lock + reset isProcessing in outer catch
    // If error occurs after chat creation/lock (e.g., getToolsForAgentType throws),
    // the chat would be permanently locked and stuck in processing without this.
    if (chat?.id) {
      await db.chat.update({
        where: { id: chat.id },
        data: { isProcessing: false, lockedBy: null, lockedAt: null, lockedByName: null },
      }).catch(() => {})
    }
    console.error("[agent-chat] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
