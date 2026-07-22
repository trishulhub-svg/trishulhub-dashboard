import { db } from "@/lib/db"
import { randomUUID } from "crypto"

// ━━ Session Management Utilities ━━
// Handles multi-device login enforcement (max 2 devices per user).
// When a 3rd device logs in, the 1st (oldest) device is kicked.
// No inactivity auto-logout.
//
// Uses an ActiveSession table to track valid session tokens per user.
// The sessionToken field stores a JSON array of up to 2 tokens (FIFO order).

const MAX_SESSIONS = 2

// In-memory cache for session validation (best-effort on Vercel serverless)
const sessionCache = new Map<string, { tokens: string[]; checkedAt: number }>()
const CACHE_TTL = 90 * 1000 // 90s — amortize ActiveSession checks across parallel API calls

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

let sessionTableChecked = false
let sessionTableExists = false

async function ensureActiveSessionTable() {
  if (sessionTableChecked && sessionTableExists) return true

  try {
    await db.activeSession.findFirst({ select: { id: true } })
    sessionTableChecked = true
    sessionTableExists = true
    return true
  } catch (error) {
    console.warn("[session] ActiveSession table not found. Auto-migrate should have created it.")
    sessionTableChecked = true
    sessionTableExists = false
    return false
  }
}

function parseTokens(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((t: unknown) => typeof t === "string")
    if (typeof parsed === "string") return [parsed]
    return []
  } catch {
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
 * Throws if the write cannot be completed — callers must not put the token
 * on the JWT unless this resolves successfully.
 */
export async function setSessionToken(
  userId: string,
  token: string
): Promise<void> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) {
    throw new Error("[session] Cannot set session token - ActiveSession table not available")
  }

  const updatedTokens = await Promise.race([
    (async () => {
      const existing = await db.activeSession.findUnique({ where: { userId } })
      const currentTokens = existing ? parseTokens(existing.sessionToken) : []

      // Deduplicate + append, enforce max sessions (FIFO — remove oldest)
      const withoutDup = currentTokens.filter((t) => t !== token)
      const next = [...withoutDup, token]
      if (next.length > MAX_SESSIONS) {
        next.splice(0, next.length - MAX_SESSIONS)
      }

      await db.activeSession.upsert({
        where: { userId },
        update: { sessionToken: serializeTokens(next), updatedAt: new Date() },
        create: { id: randomUUID(), userId, sessionToken: serializeTokens(next) },
      })
      return next
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("[session] setSessionToken timed out (5s)")), 5000)
    ),
  ])

  // Cache must mirror DB (never append onto a stale cache list)
  sessionCache.set(userId, { tokens: updatedTokens, checkedAt: Date.now() })
  evictExpiredCacheEntries()
}

/**
 * Validate a session token against the database.
 * Fail-open on DB errors/timeouts.
 * Self-heal: if the ActiveSession row is missing but we have a JWT token,
 * re-register it instead of kicking (avoids instant logout after login races).
 */
export async function validateSessionToken(
  userId: string,
  token: string
): Promise<boolean> {
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

  // No row / empty token list — self-heal instead of kicking
  // (login upsert race or prior silent write failure). Do NOT self-heal when
  // other device tokens exist but this one was FIFO-evicted.
  if (!session || tokens.length === 0) {
    try {
      await setSessionToken(userId, token)
      return true
    } catch (err) {
      console.warn("[session] Self-heal setSessionToken failed — fail-open:", err instanceof Error ? err.message : String(err))
      return true
    }
  }

  const isValid = tokens.includes(token)
  sessionCache.set(userId, { tokens, checkedAt: Date.now() })
  evictExpiredCacheEntries()

  return isValid
}

/**
 * Invalidate ALL sessions for a user by replacing tokens with a new random one.
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
 * Remove ALL session records for a user.
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
