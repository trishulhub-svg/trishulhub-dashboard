import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

// Debug: Log auth configuration on module load
console.log("[auth] Module loaded")
console.log("[auth] NEXTAUTH_URL:", process.env.NEXTAUTH_URL || "NOT SET (trustHost will auto-detect)")
console.log("[auth] NEXTAUTH_SECRET:", process.env.NEXTAUTH_SECRET ? "SET" : "MISSING!")
console.log("[auth] TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "SET" : "MISSING!")
console.log("[auth] TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING!")

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("[auth] Authorize called for:", credentials?.email)

        if (!credentials?.email || !credentials?.password) {
          console.log("[auth] Missing email or password")
          return null
        }

        try {
          // Test database connection first
          console.log("[auth] Attempting database lookup...")
          const user = await db.user.findUnique({
            where: { email: credentials.email },
          })

          console.log("[auth] User found:", user ? `id=${user.id}, role=${user.role}, active=${user.isActive}` : "NOT FOUND")

          if (!user) {
            console.log("[auth] No user found with email:", credentials.email)
            return null
          }

          if (!user.isActive) {
            console.log("[auth] User account is deactivated:", credentials.email)
            return null
          }

          console.log("[auth] Comparing passwords...")
          const isValid = await bcrypt.compare(credentials.password, user.password)
          console.log("[auth] Password valid:", isValid)

          if (!isValid) {
            console.log("[auth] Invalid password for:", credentials.email)
            return null
          }

          console.log("[auth] Authorization successful for:", credentials.email)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        } catch (error: any) {
          console.error("[auth] Authorize error:", error.message)
          console.error("[auth] Error stack:", error.stack?.substring(0, 500))
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
    async signIn({ user }) {
      console.log("[auth] signIn callback - user:", user?.email)
      return true
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  // Required for Vercel - auto-detects the host from request headers
  // This eliminates the need for NEXTAUTH_URL
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
} as NextAuthOptions

export default NextAuth(authOptions)
