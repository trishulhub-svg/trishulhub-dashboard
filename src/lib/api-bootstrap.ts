/**
 * Shared helpers for secure page bootstrap endpoints.
 * Same auth + RBAC as individual APIs — one session check, batched reads.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export type BootstrapSession = {
  user: {
    id: string
    email?: string | null
    name?: string | null
    role: string
  }
}

export async function requireBootstrapSession(
  request: NextRequest,
  keyPrefix = "bootstrap"
): Promise<{ session: BootstrapSession } | { error: NextResponse }> {
  const session = (await getServerSession(authOptions)) as BootstrapSession | null
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const rl = rateLimit(
    `${keyPrefix}-${session.user.id}`,
    RATE_LIMITS.general.limit,
    RATE_LIMITS.general.windowMs
  )
  if (!rl.success) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(),
            "X-RateLimit-Limit": String(RATE_LIMITS.general.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(rl.resetAt).toISOString(),
          },
        }
      ),
    }
  }

  // Keep request referenced so callers can pass it through without unused-arg lint.
  void request
  return { session }
}
