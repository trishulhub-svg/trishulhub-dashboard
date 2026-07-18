import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { type UserRole } from "@/lib/types"
import {
  generateSessionToken,
  setSessionToken,
  validateSessionToken,
  removeSessionToken,
} from "@/lib/session-manager"
import { checkDbRateLimit, peekDbRateLimit } from "@/lib/rate-limit"
import { normalizePageAccessMode, parsePageAccessPages } from "@/lib/nav-pages"

const isDev = process.env.NODE_ENV === "development"
const log = isDev ? console.log.bind(console) : () => {}
const logError = console.error.bind(console) // always log errors

/** DB-backed login throttle — survives Vercel cold starts. Peek does not increment. */
async function isLoginRateLimited(email: string): Promise<boolean> {
  const key = `login-fail:${email.toLowerCase()}`
  const soft = await peekDbRateLimit(key + ":soft", 5, 30_000)
  if (!soft.allowed) {
    if (isDev) console.warn(`[auth] Rate limited (soft 5/30s): ${email}`)
    return true
  }
  const hard = await peekDbRateLimit(key + ":hard", 20, 5 * 60_000)
  if (!hard.allowed) {
    if (isDev) console.warn(`[auth] Rate limited (hard 20/5min): ${email}`)
    return true
  }
  return false
}

async function trackFailedLogin(email: string): Promise<void> {
  const key = `login-fail:${email.toLowerCase()}`
  await Promise.all([
    checkDbRateLimit(key + ":soft", 5, 30_000),
    checkDbRateLimit(key + ":hard", 20, 5 * 60_000),
  ])
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

        // ── Brute-force / rate limiting (DB-backed) ──
        if (await isLoginRateLimited(email)) {
          return null
        }

        try {
          log("[auth] Attempting database lookup...")
          // Prefer lean select so missing optional columns don't break login.
          // Fall back to a minimal select if page-access columns are not migrated yet.
          let user: {
            id: string
            email: string
            name: string
            role: string
            department: string | null
            password: string
            isActive: boolean
            pageAccessMode?: string | null
            pageAccessPages?: string | null
          } | null = null

          try {
            user = await db.user.findUnique({
              where: { email },
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                department: true,
                password: true,
                isActive: true,
                pageAccessMode: true,
                pageAccessPages: true,
              },
            })
          } catch (colErr) {
            logError("[auth] pageAccess columns unavailable, using minimal user select:", colErr)
            user = await db.user.findUnique({
              where: { email },
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                department: true,
                password: true,
                isActive: true,
              },
            })
          }

          log("[auth] User found:", user ? `id=${user.id}, role=${user.role}, active=${user.isActive}` : "NOT FOUND")

          if (!user) {
            log("[auth] No user found with email:", email)
            await trackFailedLogin(email)
            return null
          }

          if (!user.isActive) {
            log("[auth] User account is deactivated:", email)
            await trackFailedLogin(email)
            return null
          }

          if (user.role === "VIEWER") {
            log("[auth] VIEWER role removed — blocking login:", email)
            await trackFailedLogin(email)
            return null
          }

          log("[auth] Comparing passwords...")
          const isValid = await bcrypt.compare(credentials.password, user.password)
          log("[auth] Password valid:", isValid)

          if (!isValid) {
            log("[auth] Invalid password for:", email)
            await trackFailedLogin(email)
            return null
          }

          log("[auth] Authorization successful for:", email)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as UserRole,
            department: user.department || undefined,
            pageAccessMode: normalizePageAccessMode(user.pageAccessMode),
            pageAccessPages: parsePageAccessPages(user.pageAccessPages),
          }
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error)
          logError(`[auth] Authorize error for ${email}: ${errMsg}`)
          await trackFailedLogin(email)
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
        token.department = user.department
        token.pageAccessMode = user.pageAccessMode ?? "OFF"
        token.pageAccessPages = user.pageAccessPages ?? []
        // Critical: clear any prior SessionKicked flag from a previous cookie/JWT merge
        delete token.error

        // Generate and store session token for multi-device enforcement (max 2).
        // If 2 sessions already exist, the oldest is removed (FIFO — 1st device kicked).
        const sessionToken = generateSessionToken()

        try {
          await setSessionToken(user.id, sessionToken)
          token.sessionToken = sessionToken
          token.pageAccessAt = Date.now()
          log("[auth] Session token stored for user:", user.id)
        } catch (err) {
          logError("[auth] Failed to store session token for user", user.id, "— multi-device enforcement DEGRADED:", err)
          // Do NOT attach a phantom sessionToken — validation would treat a missing
          // ActiveSession row as kicked and instantly log the user out.
          delete token.sessionToken
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
            let freshUser: {
              name: string
              email: string
              role: string
              department: string | null
              pageAccessMode?: string | null
              pageAccessPages?: string | null
            } | null = null
            try {
              freshUser = await db.user.findUnique({
                where: { id: userId },
                select: {
                  name: true,
                  email: true,
                  role: true,
                  department: true,
                  pageAccessMode: true,
                  pageAccessPages: true,
                },
              })
            } catch {
              freshUser = await db.user.findUnique({
                where: { id: userId },
                select: { name: true, email: true, role: true, department: true },
              })
            }
            if (freshUser) {
              token.name = freshUser.name
              token.email = freshUser.email
              token.role = freshUser.role as UserRole
              token.department = freshUser.department || undefined
              token.pageAccessMode = normalizePageAccessMode(freshUser.pageAccessMode)
              token.pageAccessPages = parsePageAccessPages(freshUser.pageAccessPages)
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
      // multi-device login (max 2 devices). If the token doesn't match,
      // it means this device was kicked (3rd device logged in, oldest evicted),
      // email was changed, or session was invalidated by an admin.

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

      // Refresh page-access ACL from DB (throttled) so admin changes apply without re-login
      const lastAccessAt = typeof token.pageAccessAt === "number" ? token.pageAccessAt : 0
      if (userId && trigger !== "update" && Date.now() - lastAccessAt > 60_000) {
        try {
          const access = await db.user.findUnique({
            where: { id: userId },
            select: { pageAccessMode: true, pageAccessPages: true },
          })
          if (access) {
            token.pageAccessMode = normalizePageAccessMode(access.pageAccessMode)
            token.pageAccessPages = parsePageAccessPages(access.pageAccessPages)
            token.pageAccessAt = Date.now()
          }
        } catch (err) {
          // Columns may not exist yet on first boot — keep token defaults
          logError("[auth] Failed to refresh page access:", err)
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
        session.user.department = token.department
        session.user.pageAccessMode = token.pageAccessMode ?? "OFF"
        session.user.pageAccessPages = token.pageAccessPages ?? []
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
    // Remove only this device's session token on sign-out (other devices stay logged in)
    async signOut({ token }) {
      const userId = token?.id
      const sessionToken = token?.sessionToken
      if (userId && sessionToken) {
        try {
          await removeSessionToken(userId, sessionToken)
          log("[auth] Session token removed on signout for user:", userId)
        } catch (err) {
          logError("[auth] Failed to remove session token on signout:", err)
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
