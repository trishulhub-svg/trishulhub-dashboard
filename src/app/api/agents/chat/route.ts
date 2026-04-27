import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { callOpenRouter, estimateCost, getVisionModel } from "@/lib/ai/openrouter"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { agentId, message, fileUrls } = await req.json()
    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 })
    }

    // Get agent
    const agent = await db.agent.findUnique({ where: { id: agentId } })
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Get active API key - check agent's assigned key first
    let apiKey = agent.apiKeyId
      ? await db.apiKey.findUnique({ where: { id: agent.apiKeyId } })
      : null

    // If no key assigned, or key is not active, find any active key
    if (!apiKey || apiKey.status !== "ACTIVE") {
      // Try to find a key that is active AND assigned to this agent type
      const allActiveKeys = await db.apiKey.findMany({
        where: { status: "ACTIVE" },
        orderBy: { priority: "asc" },
      })

      // First try: find a key specifically assigned to this agent type
      apiKey = allActiveKeys.find((k) => {
        try {
          const assigned = JSON.parse(k.assignedAgents || "[]")
          return assigned.length === 0 || assigned.includes(agent.type)
        } catch {
          return true // If parse fails, consider it available for all
        }
      }) || null

      // Auto-assign this key to the agent for future requests
      if (apiKey) {
        await db.agent.update({
          where: { id: agentId },
          data: { apiKeyId: apiKey.id },
        })
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "No active API key available. Please add a valid API key in Settings > API Keys." }, { status: 400 })
    }

    // Build messages
    const contentParts: any[] = [{ type: "text", text: message }]
    if (fileUrls && fileUrls.length > 0) {
      for (const url of fileUrls) {
        contentParts.push({ type: "image_url", image_url: { url } })
      }
    }

    const hasImages = fileUrls && fileUrls.length > 0
    const model = hasImages ? getVisionModel(agent.model) : agent.model

    const chatMessages = [
      { role: "system" as const, content: agent.systemPrompt },
      { role: "user" as const, content: hasImages ? contentParts : message },
    ]

    // Update agent status
    await db.agent.update({ where: { id: agentId }, data: { status: "RUNNING" } })

    try {
      const result = await callOpenRouter(chatMessages, model, apiKey.keyValue)

      // If successful, mark key as ACTIVE (in case it was previously ERROR)
      if (apiKey.status === "ERROR") {
        await db.apiKey.update({ where: { id: apiKey.id }, data: { status: "ACTIVE" } })
      }

      // Calculate cost
      const cost = estimateCost(model, result.inputTokens, result.outputTokens)

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
      })
    } catch (apiError: any) {
      await db.agent.update({ where: { id: agentId }, data: { status: "ERROR" } })

      // If it's an auth error, mark the API key as ERROR status
      const errorMsg = apiError.message || ""
      if (errorMsg.includes("401") || errorMsg.includes("Unauthorized") || errorMsg.includes("User not found")) {
        await db.apiKey.update({
          where: { id: apiKey.id },
          data: { status: "ERROR" },
        })
        // Unlink agent from this key so it finds a new one next time
        await db.agent.update({
          where: { id: agentId },
          data: { apiKeyId: null },
        })
        return NextResponse.json({
          error: "API key is invalid or expired. The key has been marked as ERROR. Please add a valid API key in Settings > API Keys and try again."
        }, { status: 500 })
      }

      return NextResponse.json({ error: `AI API error: ${apiError.message}` }, { status: 500 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
