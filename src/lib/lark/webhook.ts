// ━━ Lark Webhook Handler ━━

import type { LarkWebhookPayload } from "./types"
import { handleLarkWebhookEvent } from "./sync"
import { getLarkConfig } from "./auth"
import { createHmac, createHash } from "crypto"

/**
 * Verify Lark webhook signature.
 * Lark signs webhook payloads with the encrypt key.
 */
export function verifyWebhookSignature(payload: string, signature: string, encryptKey: string): boolean {
  try {
    const hmac = createHmac("sha256", encryptKey)
    hmac.update(payload)
    const computed = hmac.digest("base64")
    return computed === signature
  } catch {
    return false
  }
}

/**
 * Process an incoming Lark webhook event.
 * Returns the response body to send back to Lark.
 */
export async function processWebhook(payload: LarkWebhookPayload): Promise<{ code: number; msg?: string }> {
  // Handle URL verification challenge (first-time setup)
  if (payload.type === "url_verification" && payload.challenge) {
    return { code: 0 }
  }

  const eventType = payload.header?.event_type
  const eventData = payload.event

  if (!eventType || !eventData?.task_id) {
    console.warn("[lark/webhook] Invalid payload: missing event_type or task_id")
    return { code: 1, msg: "Invalid payload" }
  }

  console.log(`[lark/webhook] Processing event: ${eventType} for task: ${eventData.task_id}`)

  const result = await handleLarkWebhookEvent(eventType, {
    task_id: eventData.task_id,
    tasklist_id: eventData.tasklist_id,
    operator: eventData.operator as { open_id: string } | undefined,
  })

  if (result.success) {
    return { code: 0 }
  } else {
    console.error("[lark/webhook] Event handling failed:", result.message)
    return { code: 1, msg: result.message }
  }
}