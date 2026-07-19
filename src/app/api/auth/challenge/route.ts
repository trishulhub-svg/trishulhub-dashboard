import { NextRequest, NextResponse } from "next/server"
import { peekDbRateLimit } from "@/lib/rate-limit"
import {
  getClientIp,
  isTurnstileConfigured,
  isTurnstileSiteKeyConfigured,
} from "@/lib/auth-security"

/**
 * GET /api/auth/challenge
 * Returns whether CAPTCHA is required for this IP (no email oracle).
 * Same JSON shape always.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const configured = isTurnstileConfigured() && isTurnstileSiteKeyConfigured()

  let captchaRequired = false
  if (configured) {
    const lock = await peekDbRateLimit(`auth:login:lock:${ip}:_`, 8, 15 * 60_000)
    const soft = await peekDbRateLimit(`auth:login:soft:${ip}`, 5, 30_000)
    // Soft overage on IP alone — do not peek email-scoped keys (would need email)
    captchaRequired = !lock.allowed || !soft.allowed
  }

  return NextResponse.json({
    captchaConfigured: configured,
    captchaRequired,
    siteKey: configured ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : null,
  })
}
