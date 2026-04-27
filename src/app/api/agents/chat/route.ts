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

    // Get active API key
    let apiKey = agent.apiKeyId
      ? await db.apiKey.findUnique({ where: { id: agent.apiKeyId } })
      : null

    if (!apiKey || apiKey.status !== "ACTIVE") {
      // Try to find any active API key
      apiKey = await db.apiKey.findFirst({ where: { status: "ACTIVE" }, orderBy: { priority: "asc" } })
    }

    if (!apiKey) {
      return NextResponse.json({ error: "No active API key available. Please add an API key in Settings." }, { status: 400 })
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
      return NextResponse.json({ error: `AI API error: ${apiError.message}` }, { status: 500 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
