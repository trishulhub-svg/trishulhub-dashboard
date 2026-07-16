import { randomUUID } from "crypto"
import { db } from "@/lib/db"

// NOTE: In-memory rate limiting has inherent burst bypass risk in serverless.
// Accept as known limitation. The DB-backed persistence helps mitigate this.

// ── In-memory hot cache ──
// Serves as the primary read/write path for speed.
// Survives within the same serverless function instance.
// On cold starts, is populated from DB (async, non-blocking).
const rateLimitMap = new Map<string, { count: number; resetAt: number; windowMs: number }>()

// ── DB backing store ──
// Provides persistence across Vercel cold starts and deploys.
// Table is created lazily on first use (matching app's auto-migrate pattern).
let _dbTableEnsured = false
let _dbInitPromise: Promise<void> | null = null

async function ensureRateLimitTable(): Promise<void> {
  if (_dbTableEnsured) return
  if (_dbInitPromise) return _dbInitPromise

  _dbInitPromise = (async () => {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "key" TEXT NOT NULL UNIQUE,
          "count" INTEGER NOT NULL DEFAULT 0,
          "windowStart" TEXT NOT NULL,
          "windowMs" INTEGER NOT NULL DEFAULT 60000,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      try {
        await db.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "RateLimitEntry_key_idx" ON "RateLimitEntry"("key")`
        )
      } catch {
        // Index may already exist — non-fatal
      }
      _dbTableEnsured = true
    } catch (e) {
      // Only log if it's not "already exists"
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes("already exists")) {
        console.error("[rate-limit] Failed to ensure RateLimitEntry table:", msg)
      }
      // Allow retry on next call
      _dbTableEnsured = false
      _dbInitPromise = null
    }
  })()

  return _dbInitPromise
}

// ── Preload from DB into in-memory cache ──
// Runs once per cold start (non-blocking). Populates the in-memory
// cache with active entries from the database.
// NOTE: On cold starts, first request always passes (fail-open) because preload is async.
// The DB-backed persistence mitigates this on subsequent cold starts by preserving counters.
let _preloadAttempted = false

async function preloadFromDb(): Promise<void> {
  if (_preloadAttempted) return
  _preloadAttempted = true

  try {
    await ensureRateLimitTable()
    if (!_dbTableEnsured) return

    type DbRow = { key: string; count: number; windowStart: string; windowMs: number }
    const rows: DbRow[] = await db.$queryRawUnsafe(
      `SELECT "key", "count", "windowStart", "windowMs" FROM "RateLimitEntry"`
    )

    const now = Date.now()
    for (const row of rows) {
      const resetAt = new Date(row.windowStart).getTime() + row.windowMs
      if (resetAt > now) {
        // Don't overwrite if cache already has a newer entry
        const existing = rateLimitMap.get(row.key)
        if (!existing || existing.resetAt < resetAt) {
          rateLimitMap.set(row.key, { count: row.count, resetAt, windowMs: row.windowMs })
        }
      }
    }
  } catch {
    // Fail silently — in-memory cache stays empty, rate limits reset on cold start
  }
}

// Trigger preload (non-blocking)
preloadFromDb()

// ── Async persist to DB (fire-and-forget) ──
let _persistFailCount = 0
function persistToDb(key: string, count: number, windowStart: string, windowMs: number): void {
  ensureRateLimitTable().then(async () => {
    if (!_dbTableEnsured) return
    try {
      const now = new Date().toISOString()
      const id = randomUUID()

      await db.$executeRawUnsafe(
        'INSERT INTO "RateLimitEntry" ("id", "key", "count", "windowStart", "windowMs", "createdAt") VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT("key") DO UPDATE SET "count" = ?, "windowStart" = ?, "windowMs" = ?',
        id, key, count, windowStart, windowMs, now, count, windowStart, windowMs
      )

      // Cleanup: delete entries where window expired (older than 2x the window duration)
      const cutoff = new Date(Date.now() - 2 * windowMs).toISOString()
      await db.$executeRawUnsafe(
        'DELETE FROM "RateLimitEntry" WHERE "windowStart" < ?', cutoff
      )

      // Reset failure counter on success
      _persistFailCount = 0
    } catch (err) {
      _persistFailCount++
      if (_persistFailCount === 1 || _persistFailCount % 50 === 0) {
        console.warn(
          `[rate-limit] persistToDb failed ${_persistFailCount} time(s) — in-memory cache is primary store:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }
  })
}

// ── In-memory cleanup (runs periodically) ──
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
 * Uses in-memory Map as hot cache, backed by database for persistence.
 * On cold starts: cache starts empty (fail-open), DB is preloaded async.
 *
 * @param key - Unique identifier (userId or IP)
 * @param limit - Max requests in window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    const windowStart = new Date(now).toISOString()
    const resetAt = now + windowMs
    rateLimitMap.set(key, { count: 1, resetAt, windowMs })
    persistToDb(key, 1, windowStart, windowMs)
    return { success: true, remaining: limit - 1, resetAt }
  }

  entry.count++
  rateLimitMap.set(key, entry)

  // Persist updated count to DB
  const windowStart = new Date(entry.resetAt - entry.windowMs).toISOString()
  persistToDb(key, entry.count, windowStart, windowMs)

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
  finance: { limit: 30, windowMs: 60 * 1000 },       // 30 per minute for finance endpoints
  financeWrite: { limit: 10, windowMs: 60 * 1000 },  // 10 per minute for finance write operations
  invoiceSend: { limit: 5, windowMs: 60 * 1000 },    // 5 per minute for invoice send operations
} as const

// HR rate limits (convenience wrappers using the existing rateLimit function)
export function hrRateLimit(key: string): RateLimitResult {
  return rateLimit(key, 60, 60_000)
}

export function leaveRateLimit(key: string): RateLimitResult {
  return rateLimit(key, 30, 60_000)
}

export function attendanceRateLimit(key: string): RateLimitResult {
  return rateLimit(key, 60, 60_000)
}

export function approvalRateLimit(key: string): RateLimitResult {
  return rateLimit(key, 30, 60_000)
}

export function trainingRateLimit(key: string): RateLimitResult {
  return rateLimit(key, 30, 60_000)
}

export function availabilityRateLimit(key: string): RateLimitResult {
  return rateLimit(key, 60, 60_000)
}

// Phase 8 — Rate limit constants for new modules
export const apiKeyRateLimit = { max: 3, windowMs: 60_000 } // 3 per minute
export const supportTicketRateLimit = { max: 15, windowMs: 60_000 } // 15 per minute
export const notificationRateLimit = { max: 30, windowMs: 60_000 } // 30 per minute

// Phase 8 — Convenience wrappers for new modules
export function apiKeyLimit(key: string): RateLimitResult {
  return rateLimit(key, apiKeyRateLimit.max, apiKeyRateLimit.windowMs)
}

export function supportTicketLimit(key: string): RateLimitResult {
  return rateLimit(key, supportTicketRateLimit.max, supportTicketRateLimit.windowMs)
}

export function notificationLimit(key: string): RateLimitResult {
  return rateLimit(key, notificationRateLimit.max, notificationRateLimit.windowMs)
}

/**
 * DB-backed atomic rate limiter for cross-instance persistence.
 * Uses the RateLimitEntry table (created in auto-migrate).
 * Thread-safe via raw SQL — no separate DB calls needed.
 *
 * @param key - Unique identifier (userId, email, IP, etc.)
 * @param maxAttempts - Max allowed attempts in the window
 * @param windowMs - Window duration in milliseconds
 * @returns Whether the request is allowed and remaining attempts
 */
export async function checkDbRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number }> {
  await ensureRateLimitTable()

  const windowStart = new Date(Date.now() - windowMs).toISOString()

  try {
    // Atomic upsert: increment count if within window, else reset to 1
    const rows: Array<{ count: number }> = await db.$queryRawUnsafe(
      `INSERT INTO "RateLimitEntry" ("id", "key", "count", "windowStart", "windowMs", "createdAt")
       VALUES (?, ?, 1, ?, ?, datetime('now'))
       ON CONFLICT("key") DO UPDATE SET
         "count" = CASE
           WHEN "RateLimitEntry"."windowStart" > ? THEN "RateLimitEntry"."count" + 1
           ELSE 1
         END,
         "windowStart" = CASE
           WHEN "RateLimitEntry"."windowStart" > ? THEN "RateLimitEntry"."windowStart"
           ELSE ?
         END,
         "windowMs" = ?
       RETURNING "count"`,
      randomUUID(),
      key,
      new Date().toISOString(),
      windowMs,
      windowStart,
      windowStart,
      new Date().toISOString(),
      windowMs
    )

    const count = rows[0]?.count ?? 1
    const remaining = Math.max(0, maxAttempts - count)

    return { allowed: count <= maxAttempts, remaining }
  } catch {
    // Fail-open on DB errors — don't block legitimate requests
    return { allowed: true, remaining: maxAttempts }
  }
}
