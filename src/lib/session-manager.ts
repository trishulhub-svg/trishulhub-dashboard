import { db } from "@/lib/db"
import { randomUUID } from "crypto"

// ━━ Session Management Utilities ━━
// Handles single-device login enforcement and session invalidation.
// Uses an ActiveSession table to track the current valid session token per user.

// In-memory cache for session validation (60s TTL to reduce DB queries)
const sessionCache = new Map<string, { token: string; checkedAt: number }>()
const CACHE_TTL = 60 * 1000 // 60 seconds

// Auto-migrate: ensure ActiveSession table exists
let sessionTableChecked = false
let sessionTableExists = false

async function ensureActiveSessionTable(): Promise<boolean> {
  if (sessionTableChecked && sessionTableExists) return true

  try {
    await (db as any).activeSession.count({ take: 1 })
    sessionTableChecked = true
    sessionTableExists = true
    return true
  } catch {
    console.log("[session] ActiveSession table not found, auto-creating...")
  }

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ActiveSession" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "userId" TEXT NOT NULL UNIQUE,
        "sessionToken" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "ActiveSession_userId_idx" ON "ActiveSession"("userId")`
      )
    } catch {}
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "ActiveSession_sessionToken_idx" ON "ActiveSession"("sessionToken")`
      )
    } catch {}
    console.log("[session] ActiveSession table created successfully")
  } catch (err: any) {
    console.error("[session] Failed to create ActiveSession table:", err.message)
    sessionTableChecked = false
    sessionTableExists = false
    return false
  }

  try {
    await (db as any).activeSession.count({ take: 1 })
    sessionTableChecked = true
    sessionTableExists = true
    return true
  } catch (err: any) {
    console.error("[session] ActiveSession table verification failed:", err.message)
    sessionTableChecked = false
    sessionTableExists = false
    return false
  }
}

/**
 * Generate a new unique session token (UUID v4)
 */
export function generateSessionToken(): string {
  return randomUUID()
}

/**
 * Store or update the session token for a user.
 * Called on login to register the new session.
 * This overwrites any existing session token, effectively
 * invalidating sessions on other devices.
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

  await (db as any).activeSession.upsert({
    where: { userId },
    update: { sessionToken: token, updatedAt: new Date() },
    create: { id: randomUUID(), userId, sessionToken: token },
  })

  // Update cache immediately
  sessionCache.set(userId, { token, checkedAt: Date.now() })
  console.log(`[session] Session token set for user ${userId}`)
}

/**
 * Validate a session token against the database.
 * Uses in-memory cache with 60s TTL to reduce DB queries.
 *
 * Returns true if the token matches the current valid session.
 * Returns false if the token is stale (user logged in elsewhere,
 * email changed, or session invalidated).
 */
export async function validateSessionToken(
  userId: string,
  token: string
): Promise<boolean> {
  // Check cache first (fast path)
  const cached = sessionCache.get(userId)
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return cached.token === token
  }

  // Cache miss or expired - check DB
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) {
    // Graceful degradation: if table doesn't exist, allow session
    console.warn("[session] ActiveSession table not available, allowing session")
    return true
  }

  try {
    const session = await (db as any).activeSession.findUnique({
      where: { userId },
    })

    const isValid = session?.sessionToken === token

    // Update cache
    if (session) {
      sessionCache.set(userId, {
        token: session.sessionToken,
        checkedAt: Date.now(),
      })
    }

    return isValid
  } catch (err: any) {
    // Graceful degradation: if DB check fails, allow session
    console.warn("[session] Session token validation DB error:", err.message)
    return true
  }
}

/**
 * Invalidate a user's current session by generating a new token.
 * The old token in existing JWTs will no longer match,
 * causing "SessionKicked" on next validation.
 *
 * Used for:
 * - Email change (force re-login with new email)
 * - Password change (force re-login)
 * - Admin-triggered session invalidation
 *
 * Returns the new session token.
 */
export async function invalidateSession(userId: string): Promise<string> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) {
    console.error(
      "[session] Cannot invalidate session - table not available"
    )
    return generateSessionToken()
  }

  const newToken = generateSessionToken()

  await (db as any).activeSession.upsert({
    where: { userId },
    update: { sessionToken: newToken, updatedAt: new Date() },
    create: { id: randomUUID(), userId, sessionToken: newToken },
  })

  // Update cache immediately
  sessionCache.set(userId, { token: newToken, checkedAt: Date.now() })
  console.log(`[session] Session invalidated for user ${userId}`)

  return newToken
}

/**
 * Remove a user's session record from the database.
 * Called on explicit sign-out to clean up.
 */
export async function removeSession(userId: string): Promise<void> {
  const tableReady = await ensureActiveSessionTable()
  if (!tableReady) return

  try {
    await (db as any).activeSession.deleteMany({ where: { userId } })
    sessionCache.delete(userId)
    console.log(`[session] Session removed for user ${userId}`)
  } catch (err: any) {
    console.warn("[session] Failed to remove session:", err.message)
  }
}
