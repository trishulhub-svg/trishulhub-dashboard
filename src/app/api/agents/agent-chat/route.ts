// Agentic Chat API - Streaming endpoint with multi-step autonomous execution
// Supports: Function calling, thinking mode, tool execution, step-by-step streaming

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { runAgentLoop, AgentStep, AgentLoopResult } from "@/lib/ai/agent-loop"
import { callAIWithFailover, AllKeysExhaustedError, getVisionModel } from "@/lib/ai/openrouter"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { agentId, message, chatId } = await req.json()
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

    // Get agent
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { roleConfig: true },
    })
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Only DEV agent supports agentic mode for now
    if (agent.type !== "DEV") {
      // Fall back to regular chat for non-DEV agents
      return NextResponse.json({ error: "Agentic mode is only available for Dev Agent. Use regular chat for other agents." }, { status: 400 })
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
    } else {
      chat = await db.chat.create({
        data: {
          agentId,
          userId,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
          status: "ACTIVE",
        },
        include: { messages: true },
      })
    }

    // Save user message
    await db.chatMessage.create({
      data: { chatId: chat.id, role: "user", content: message },
    })

    // Get Z.ai API key (agentic mode requires Z.ai for function calling)
    const zaiKeys = await db.apiKey.findMany({
      where: {
        provider: "ZAI",
        status: "ACTIVE",
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
        error: "No active Z.ai API key available for agentic mode. Agentic Dev requires a Z.ai API key with GLM-4.5-Flash or GLM-5.1. Please add one in API Keys page.",
        chatId: chat.id,
      }, { status: 400 })
    }

    // Update agent status
    await db.agent.update({ where: { id: agentId }, data: { status: "RUNNING" } })

    // Build conversation history from chat messages
    const history = chat.messages
      .slice(-20)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))

    // Collect steps for streaming
    const allSteps: AgentStep[] = []

    // Try each key
    let lastError: Error | null = null
    for (const key of eligibleKeys) {
      try {
        const result = await runAgentLoop(message, history, key.keyValue, agent.model, {
          maxSteps: 15,
          maxTokens: 8192,
          onStep: (step) => {
            allSteps.push(step)
          },
        })

        // Success! Save the results

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
          totalSteps: result.totalSteps,
          usedTools: result.usedTools,
          steps: result.steps.map(s => ({
            type: s.type,
            toolName: s.toolName,
            content: s.type === "thinking"
              ? s.content.substring(0, 200) // Truncate thinking for storage
              : s.type === "tool_result"
                ? s.content.substring(0, 500)
                : s.content.substring(0, 500),
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

        // Update agent status
        await db.agent.update({ where: { id: agentId }, data: { status: "IDLE" } })

        // Return the result with all steps
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
          totalSteps: result.totalSteps,
          usedTools: result.usedTools,
          steps: result.steps.map(s => ({
            type: s.type,
            content: s.type === "thinking"
              ? s.content.substring(0, 300)
              : s.type === "tool_result"
                ? (s.toolResult || s.content).substring(0, 500)
                : s.type === "tool_call"
                  ? `${s.toolName}(${Object.entries(s.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 50)}`).join(", ")})`
                  : s.content.substring(0, 500),
            toolName: s.toolName,
            stepNumber: s.stepNumber,
          })),
          thinkingPreview: result.thinkingContent?.substring(0, 300),
        })
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
