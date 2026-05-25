// Simple in-memory rate limiter (no external dependencies)
// Works on Vercel serverless within the same function instance

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Cleanup old entries every 5 minutes
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(key)
    }
  }, 5 * 60 * 1000)
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a user/key
 * @param key - Unique identifier (userId or IP)
 * @param limit - Max requests in window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  entry.count++
  rateLimitMap.set(key, entry)

  if (entry.count > limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

// Predefined limits for different endpoint types
export const RATE_LIMITS = {
  chat: { limit: 20, windowMs: 60 * 1000 },       // 20 per minute
  agentChat: { limit: 10, windowMs: 60 * 1000 },   // 10 per minute
  login: { limit: 5, windowMs: 60 * 1000 },         // 5 per minute
  general: { limit: 60, windowMs: 60 * 1000 },      // 60 per minute
  webhook: { limit: 100, windowMs: 60 * 1000 },     // 100 per minute
  crm: { limit: 30, windowMs: 60 * 1000 },          // 30 per minute for CRM endpoints
  crmWrite: { limit: 10, windowMs: 60 * 1000 },     // 10 per minute for CRM write operations
} as const
