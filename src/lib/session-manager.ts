import { db } from "@/lib/db"
import { randomUUID } from "crypto"

// ━━ Session Management Utilities ━━
// Handles multi-device login enforcement (max 2 devices per user).
// When a 3rd device logs in, the 1st (oldest) device is kicked.
// No inactivity auto-logout.
//
// Uses an ActiveSession table to track valid session tokens per user.
// The sessionToken field stores a JSON array of up to 2 tokens (FIFO order).
// This avoids schema migrations — the existing column is repurposed.

const MAX_SESSIONS = 2

// In-memory cache for session validation (best-effort, reduced TTL for Vercel serverless)
const sessionCache = new Map<string, { tokens: string[]; checkedAt: number }>()
const CACHE_TTL = 15 * 1000 // 15 seconds

function evictExpiredCacheEntries() {
  if (sessionCache.size > 500) {
    const now = Date.now()
    for (const [key, val] of sessionCache) {
      if (now - val.checkedAt > CACHE_TTL) {
        sessionCache.delete(key)
      }
    }
  }
}

// Auto-migrate: ensure ActiveSession table exists
let sessionTableChecked = false
let sessionTableExists = false

async function ensureActiveSessionTable() {
  if (sessionTableChecked && sessionTableExists) return true

  try {
    const count = await db.activeSession.count({ take: 1 })
    sessionTableChecked = true
    sessionTableExists = true
    return count >= 0
  } catch (error) {
    console.warn("[session] ActiveSession table not found. Auto-migrate should have created it.")
    return false
  }
}

// ── Token Array Helpers ──
// The sessionToken column stores a JSON array of tokens: '["uuid1","uuid2"]'
// Backward compatible: if a single UUID string is found, it's wrapped in an array.

function parseTokens(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((t: unknown) => typeof t === "string")
    if (typeof parsed === "string") return [parsed] // Legacy single-token format
    return []
  } catch {
    // Not JSON — might be a raw UUID string (legacy format)
    if (/^[0-9a-f-]{36}$/i.test(raw)) return [raw]
    return []
  }
}

function serializeTokens(tokens: string[]): string {
  return JSON.stringify(tokens)
}

/**
 * Generate a new unique session token (UUID v4)
 */
export function generateSessionToken(): string {
  return randomUUID()
}

/**
 * Add a session token for a user (max 2 devices).
 * If 2 sessions already exist, the oldest is removed (FIFO).
 * Called on login to register the new session.
 */
export async function setSessionToken(
  userId: string,
  token: string
): Promise<void> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) {
    console.error("[session] Cannot set session token - table not available")
    return
  }

  await Promise.race([
    (async () => {
      // Read existing tokens
      const existing = await db.activeSession.findUnique({ where: { userId } })
      const currentTokens = existing ? parseTokens(existing.sessionToken) : []

      // Add new token, enforce max sessions (FIFO — remove oldest)
      const updatedTokens = [...currentTokens, token]
      if (updatedTokens.length > MAX_SESSIONS) {
        updatedTokens.splice(0, updatedTokens.length - MAX_SESSIONS)
      }

      await db.activeSession.upsert({
        where: { userId },
        update: { sessionToken: serializeTokens(updatedTokens), updatedAt: new Date() },
        create: { id: randomUUID(), userId, sessionToken: serializeTokens([token]) },
      })
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("[session] setSessionToken timed out (5s)")), 5000)
    ),
  ])

  // Update cache
  const cached = sessionCache.get(userId)
  const tokens = cached ? [...cached.tokens, token] : [token]
  if (tokens.length > MAX_SESSIONS) tokens.splice(0, tokens.length - MAX_SESSIONS)
  sessionCache.set(userId, { tokens, checkedAt: Date.now() })
  evictExpiredCacheEntries()
}

/**
 * Validate a session token against the database.
 * Returns true if the token exists in the user's active token list.
 * Returns false if the token was evicted (3rd device logged in, oldest kicked).
 *
 * Fail-open design: DB errors/timeout → returns true (allows session).
 */
export async function validateSessionToken(
  userId: string,
  token: string
): Promise<boolean> {
  // Check cache first (fast path)
  const cached = sessionCache.get(userId)
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return cached.tokens.includes(token)
  }

  try {
    const result = await Promise.race([
      doValidateSession(userId, token),
      new Promise<boolean>((resolve) => setTimeout(() => {
        console.warn("[session] Session validation timed out (5s) — allowing session (fail-open).")
        resolve(true)
      }, 5000)),
    ])
    return result
  } catch (err: unknown) {
    console.warn("[session] Session validation DB error — DEGRADED MODE, allowing session (fail-open):", err instanceof Error ? err.message : String(err))
    return true
  }
}

async function doValidateSession(
  userId: string,
  token: string
): Promise<boolean> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) {
    console.warn("[session] ActiveSession table not available — DEGRADED MODE, allowing session (fail-open)")
    return true
  }

  const session = await db.activeSession.findUnique({ where: { userId } })
  const tokens = session ? parseTokens(session.sessionToken) : []
  const isValid = tokens.includes(token)

  // Update cache
  if (session) {
    sessionCache.set(userId, { tokens, checkedAt: Date.now() })
    evictExpiredCacheEntries()
  }

  return isValid
}

/**
 * Invalidate ALL sessions for a user by replacing tokens with a new random one.
 * Used for password change, email change, admin-forced logout.
 * Returns the new token.
 */
export async function invalidateSession(userId: string): Promise<string | null> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) {
    console.error("[session] Cannot invalidate session - table not available")
    return null
  }

  const newToken = generateSessionToken()

  await Promise.race([
    db.activeSession.upsert({
      where: { userId },
      update: { sessionToken: serializeTokens([newToken]), updatedAt: new Date() },
      create: { id: randomUUID(), userId, sessionToken: serializeTokens([newToken]) },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("[session] invalidateSession timed out (5s)")), 5000)
    ),
  ])

  sessionCache.set(userId, { tokens: [newToken], checkedAt: Date.now() })
  evictExpiredCacheEntries()

  return newToken
}

/**
 * Remove a specific session token for a user (on sign-out of one device).
 * Other devices remain logged in.
 */
export async function removeSessionToken(
  userId: string,
  token: string
): Promise<void> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) return

  try {
    const existing = await db.activeSession.findUnique({ where: { userId } })
    if (!existing) return

    const tokens = parseTokens(existing.sessionToken).filter(t => t !== token)

    if (tokens.length === 0) {
      // No more sessions — clean up
      await db.activeSession.deleteMany({ where: { userId } })
      sessionCache.delete(userId)
    } else {
      await db.activeSession.update({
        where: { userId },
        data: { sessionToken: serializeTokens(tokens), updatedAt: new Date() },
      })
      sessionCache.set(userId, { tokens, checkedAt: Date.now() })
    }
    evictExpiredCacheEntries()
  } catch (err: unknown) {
    console.warn("[session] Failed to remove session token:", err instanceof Error ? err.message : String(err))
  }
}

/**
 * Remove ALL session records for a user (legacy cleanup).
 * Prefer removeSessionToken() for single-device sign-out.
 */
export async function removeSession(userId: string): Promise<void> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) return

  try {
    await db.activeSession.deleteMany({ where: { userId } })
    sessionCache.delete(userId)
  } catch (err: unknown) {
    console.warn("[session] Failed to remove session:", err instanceof Error ? err.message : String(err))
  }
}