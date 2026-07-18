import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { logAudit, buildDescription } from "@/lib/audit-log"
import { removeSessionToken } from "@/lib/session-manager"

// NextAuth v4 with App Router - trustHost handles URL detection
const baseEvents = (authOptions as { events?: Record<string, unknown> }).events || {}

const handler = NextAuth({
  ...authOptions,
  events: {
    ...baseEvents,
    async signIn({ user }) {
      void logAudit({
        userId: user.id || "unknown",
        userName: user.name || "unknown",
        userRole: String((user as { role?: string }).role || "unknown"),
        department: "SYSTEM",
        page: "login",
        action: "LOGIN",
        description: buildDescription("LOGIN", "session"),
        status: "SUCCESS",
      })
    },
    async signOut(message) {
      // Preserve multi-device cleanup from authOptions (must not be dropped)
      const token = (message as { token?: { id?: string; sessionToken?: string } }).token
      const userId = token?.id
      const sessionToken = token?.sessionToken
      if (userId && sessionToken) {
        try {
          await removeSessionToken(userId, sessionToken)
        } catch (err) {
          console.error("[auth] Failed to remove session token on signout:", err)
        }
      }

      const sessionUser = (message as { session?: { user?: { id?: string; name?: string | null; role?: string } } }).session?.user
      void logAudit({
        userId: sessionUser?.id || userId || "unknown",
        userName: sessionUser?.name || "unknown",
        userRole: String(sessionUser?.role || "unknown"),
        department: "SYSTEM",
        page: "login",
        action: "LOGOUT",
        description: buildDescription("LOGOUT", "session"),
        status: "SUCCESS",
      })
    },
  },
})

export { handler as GET, handler as POST }
