import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import type { NextApiRequest } from "next"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { type UserRole } from "@/lib/types"
import {
  generateSessionToken,
  setSessionToken,
  validateSessionToken,
  removeSession,
} from "@/lib/session-manager"

const isDev = process.env.NODE_ENV === "development"
const log = isDev ? console.log.bind(console) : () => {}
const logError = console.error.bind(console) // always log errors

// ── In-memory brute-force protection for login attempts ──
// Tracks failed login attempts per email to prevent credential stuffing.
// NOTE: On Vercel serverless, this Map is per-instance and gets reset on cold start.
// For production-scale protection, consider a Redis-based rate limiter.
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>()

const RATE_LIMIT_5_THRESHOLD = 5
const RATE_LIMIT_5_COOLDOWN_MS = 30 * 1000   // 30 seconds
const RATE_LIMIT_20_THRESHOLD = 20
const RATE_LIMIT_20_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
const RATE_LIMIT_CLEANUP_MS = 5 * 60 * 1000     // 5 minutes

function isRateLimited(email: string): boolean {
  const now = Date.now()
  const attempts = failedAttempts.get(email)
  if (!attempts) return false

  const elapsed = now - attempts.lastAttempt

  if (attempts.count >= RATE_LIMIT_20_THRESHOLD && elapsed < RATE_LIMIT_20_COOLDOWN_MS) {
    console.warn(`[auth] Rate limited (${attempts.count} attempts, 5min cooldown): ${email}`)
    return true
  }

  if (attempts.count >= RATE_LIMIT_5_THRESHOLD && elapsed < RATE_LIMIT_5_COOLDOWN_MS) {
    console.warn(`[auth] Rate limited (${attempts.count} attempts, 30s cooldown): ${email}`)
    return true
  }

  return false
}

function trackFailedAttempt(email: string): void {
  const now = Date.now()
  const existing = failedAttempts.get(email) || { count: 0, lastAttempt: 0 }
  existing.count++
  existing.lastAttempt = now
  failedAttempts.set(email, existing)

  // Periodic cleanup of stale entries (probabilistic to avoid overhead)
  if (Math.random() < 0.1) {
    for (const [key, val] of failedAttempts) {
      if (now - val.lastAttempt > RATE_LIMIT_CLEANUP_MS) {
        failedAttempts.delete(key)
      }
    }
  }
}

// Debug: Log auth configuration on module load
log("[auth] Module loaded")
log("[auth] NEXTAUTH_URL:", process.env.NEXTAUTH_URL || "NOT SET (trustHost will auto-detect)")
log("[auth] NEXTAUTH_SECRET:", process.env.NEXTAUTH_SECRET ? "SET" : "MISSING!")
log("[auth] TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "SET" : "MISSING!")
log("[auth] TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING!")

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, _req) {
        log("[auth] Authorize called for:", credentials?.email)

        if (!credentials?.email || !credentials?.password) {
          log("[auth] Missing email or password")
          return null
        }

        const email = credentials.email

        // ── Brute-force / rate limiting check ──
        // Returns null (same as invalid credentials) to avoid revealing rate limiting.
        if (isRateLimited(email)) {
          return null
        }

        try {
          // Test database connection first
          log("[auth] Attempting database lookup...")
          const user = await db.user.findUnique({
            where: { email },
          })

          log("[auth] User found:", user ? `id=${user.id}, role=${user.role}, active=${user.isActive}` : "NOT FOUND")

          if (!user) {
            log("[auth] No user found with email:", email)
            trackFailedAttempt(email)
            return null
          }

          if (!user.isActive) {
            log("[auth] User account is deactivated:", email)
            trackFailedAttempt(email)
            return null
          }

          log("[auth] Comparing passwords...")
          const isValid = await bcrypt.compare(credentials.password, user.password)
          log("[auth] Password valid:", isValid)

          if (!isValid) {
            log("[auth] Invalid password for:", email)
            trackFailedAttempt(email)
            return null
          }

          log("[auth] Authorization successful for:", email)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as UserRole,
          }
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error)
          logError(`[auth] Authorize error for ${email}: ${errMsg}`)
          trackFailedAttempt(email)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // ── On Sign In ──
      // The `user` object is only available on sign-in
      if (user) {
        token.role = user.role
        token.id = user.id

        // Generate and store session token for single-device enforcement.
        // This overwrites any existing session token in the DB,
        // which invalidates any previous device's session.
        const sessionToken = generateSessionToken()

        try {
          await setSessionToken(user.id, sessionToken)
          token.sessionToken = sessionToken
          log("[auth] Session token stored for user:", user.id)
        } catch (err) {
          logError("[auth] Failed to store session token for user", user.id, "— single-device enforcement DEGRADED:", err)
          // Don't set token.sessionToken — single-device enforcement disabled gracefully.
          // The userId && currentToken guard in the JWT callback will skip validation,
          // so the user can still log in but won't have single-device enforcement.
          console.warn(`[auth] Single-device enforcement is DEGRADED for user ${user.id}. Monitor DB health.`)
        }

        return token
      }

      // ── On Session Update (e.g., profile name change) ──
      // When `updateSession()` is called from the client, NextAuth triggers
      // the JWT callback with trigger === "update". We re-read user data from
      // the DB so the token (and therefore the session) reflects the latest
      // values such as an updated name or email.
      if (trigger === "update") {
        const userId = token.id
        if (userId) {
          try {
            const freshUser = await db.user.findUnique({
              where: { id: userId },
              select: { name: true, email: true, role: true },
            })
            if (freshUser) {
              token.name = freshUser.name
              token.email = freshUser.email
              token.role = freshUser.role as UserRole
              log("[auth] Session updated from DB for user:", userId, "name:", freshUser.name)
            }
          } catch (err) {
            logError("[auth] Failed to refresh user data on update:", err)
          }
        }
        // Continue to session token validation below
      }

      // ── On Session Access (read/refresh) ──
      // Validate the session token against the database to enforce
      // single-device login. If the token doesn't match, it means
      // the user logged in from another device, changed their email,
      // or had their session invalidated by an admin.

      const userId = token.id
      const currentToken = token.sessionToken

      if (userId && currentToken) {
        try {
          const isValid = await validateSessionToken(userId, currentToken)
          if (!isValid) {
            // Session was invalidated — another device logged in,
            // email was changed, or admin forced logout
            log("[auth] Session token invalid for user:", userId, "— session kicked")
            token.error = "SessionKicked"
            return token
          }
        } catch (err) {
          // Graceful degradation: if DB check fails, allow session to continue
          logError("[auth] Session token validation failed:", err)
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        // CRITICAL: Propagate updated name/email from JWT token to session.
        // NextAuth v4 builds the `session` param from the OLD decoded JWT cookie,
        // NOT from the updated `token` returned by our JWT callback. Without
        // explicitly copying these values, profile name/email changes never
        // appear in the UI until a full page reload or re-login.
        session.user.name = (token.name as string) ?? session.user.name
        session.user.email = (token.email as string) ?? session.user.email
        session.user.role = token.role
        session.user.id = token.id
      }

      // Pass session errors to client for handling
      // Client will detect these and auto-signout with appropriate message
      if (token.error) {
        session.error = token.error
      }

      return session
    },

    async signIn({ user }) {
      log("[auth] signIn callback - user:", user?.email)
      return true
    },
  },
  events: {
    // Clean up session record on explicit sign-out
    async signOut({ token }) {
      const userId = token?.id
      if (userId) {
        try {
          await removeSession(userId)
          log("[auth] Session record removed on signout for user:", userId)
        } catch (err) {
          logError("[auth] Failed to remove session on signout:", err)
        }
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours absolute max session lifetime
  },
  secret: process.env.NEXTAUTH_SECRET,
  // Required for Vercel - auto-detects the host from request headers
  // This eliminates the need for NEXTAUTH_URL
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
} as NextAuthOptions

export default NextAuth(authOptions)
