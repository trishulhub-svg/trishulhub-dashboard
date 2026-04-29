import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { callAI, getModelForProvider } from "@/lib/ai/openrouter"

// GET /api/api-keys/test?id=xxx — Test an API key by making a small AI call
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ valid: false, error: "Unauthorized" }, { status: 401 })
    }

    const id = req.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ valid: false, error: "API key ID is required" }, { status: 400 })
    }

    // Look up the API key
    const apiKey = await db.apiKey.findUnique({ where: { id } })
    if (!apiKey) {
      return NextResponse.json({ valid: false, error: "API key not found" }, { status: 404 })
    }

    const provider = apiKey.provider.toUpperCase()

    // Choose a model appropriate for the provider
    const testModel = getModelForProvider("glm-4-flash-250414", provider)

    console.log(`[api-keys/test] Testing key "${apiKey.keyName}" (${provider}) with model: ${testModel}`)

    // Make a minimal AI call to test the key
    const result = await callAI(
      [
        { role: "user", content: "Say hello in one word." }
      ],
      testModel,
      apiKey.keyValue,
      provider,
      { maxTokens: 10, temperature: 0.1 }
    )

    // If we got here, the key works
    console.log(`[api-keys/test] Key "${apiKey.keyName}" is VALID. Model: ${result.model}, Tokens: ${result.inputTokens}/${result.outputTokens}`)

    // Update key status to ACTIVE if it was in ERROR state
    if (apiKey.status === "ERROR") {
      await db.apiKey.update({
        where: { id },
        data: { status: "ACTIVE" },
      })
    }

    // Log the test usage
    await db.apiUsageLog.create({
      data: {
        apiKeyId: apiKey.id,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
      },
    })

    // Update spend
    await db.apiKey.update({
      where: { id },
      data: {
        currentSpend: { increment: result.cost },
      },
    })

    return NextResponse.json({
      valid: true,
      provider,
      model: result.model,
      response: result.content.substring(0, 100),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    })
  } catch (error: any) {
    console.error("[api-keys/test] Test failed:", error.message)

    // Determine if the error is an auth issue or rate limit
    const errorMsg = error.message || String(error)
    const isInvalid = errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("invalid")
    const isExhausted = errorMsg.includes("429") || errorMsg.includes("402") || errorMsg.includes("exhausted") || errorMsg.includes("insufficient")

    // Try to update the key status in the database
    try {
      const id = req.nextUrl.searchParams.get("id")
      if (id) {
        if (isInvalid) {
          await db.apiKey.update({ where: { id }, data: { status: "ERROR" } })
        } else if (isExhausted) {
          await db.apiKey.update({ where: { id }, data: { status: "EXHAUSTED" } })
        }
      }
    } catch (dbErr) {
      console.error("[api-keys/test] Failed to update key status:", dbErr)
    }

    let hint = ""
    if (isInvalid) {
      hint = "The API key was rejected. Please check that the key value is correct and has not expired."
    } else if (isExhausted) {
      hint = "This key has reached its rate limit or balance is insufficient. Add balance or wait before retrying."
    }

    return NextResponse.json({
      valid: false,
      error: isInvalid
        ? "Authentication failed — key is invalid or expired"
        : isExhausted
        ? "Rate limited or balance exhausted"
        : `API error: ${errorMsg.substring(0, 200)}`,
      hint,
    })
  }
}
