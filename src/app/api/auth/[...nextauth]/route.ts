import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { logAudit, buildDescription } from "@/lib/audit-log"

// NextAuth v4 with App Router - trustHost handles URL detection
const handler = NextAuth({
  ...authOptions,
  events: {
    ...(authOptions as any).events,
    async signIn({ user }) {
      void logAudit({
        userId: user.id || "unknown",
        userName: user.name || "unknown",
        userRole: String((user as any).role || "unknown"),
        department: "SYSTEM",
        page: "login",
        action: "LOGIN",
        description: buildDescription("LOGIN", "session"),
        status: "SUCCESS",
      })
    },
    async signOut({ session }) {
      const u = session?.user
      void logAudit({
        userId: u?.id || "unknown",
        userName: u?.name || "unknown",
        userRole: String((u as any)?.role || "unknown"),
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
