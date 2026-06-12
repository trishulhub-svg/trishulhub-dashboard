import { NextRequest, NextResponse } from "next/server"
import { ensureAllTables } from "@/lib/auto-migrate"
import { processWebhook, verifyWebhookSignature } from "@/lib/lark/webhook"
import { getLarkConfig } from "@/lib/lark/auth"
import type { LarkWebhookPayload } from "@/lib/lark/types"

export const maxDuration = 30

// POST — Receive Lark webhook events
export async function POST(req: NextRequest) {
  try {
    await ensureAllTables()

    const rawBody = await req.text()

    // Parse payload early — needed for challenge AND event processing
    let payload: LarkWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ code: 1, msg: "Invalid JSON" })
    }

    // ━━ Handle URL verification challenge FIRST (before any config checks) ━━
    // Lark sends this when you first add the webhook URL.
    // It must respond regardless of whether Lark sync is enabled.
    if (payload.type === "url_verification" && payload.challenge) {
      console.log("[lark/webhook] URL verification challenge received — responding")
      return NextResponse.json({ challenge: payload.challenge })
    }

    // For actual events, check if Lark sync is enabled
    const config = await getLarkConfig()
    if (!config?.enabled) {
      console.warn("[lark/webhook] Received event but Lark sync is disabled")
      return NextResponse.json({ code: 0 })
    }

    // Verify signature if encrypt key is configured
    const signature = req.headers.get("X-Lark-Signature") || ""
    if (config.encryptKey && signature) {
      const valid = verifyWebhookSignature(rawBody, signature, config.encryptKey)
      if (!valid) {
        console.warn("[lark/webhook] Invalid signature")
        return NextResponse.json({ code: 1, msg: "Invalid signature" })
      }
    }

    // Process the webhook event
    const result = await processWebhook(payload)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[lark/webhook] Error:", err)
    return NextResponse.json({ code: 1, msg: "Internal error" })
  }
}

// GET — Health check for webhook endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", service: "lark-webhook" })
}