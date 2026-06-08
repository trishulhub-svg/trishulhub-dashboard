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
    } catch {
      // Fail silently — in-memory cache is the primary store
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
} as const
