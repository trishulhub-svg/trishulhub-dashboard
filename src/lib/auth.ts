import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.isActive) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
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
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
    // Fix NEXTAUTH_URL mismatch - redirect to the correct domain
    async redirect({ url, baseUrl }) {
      // If the url is relative, prepend the baseUrl
      if (url.startsWith("/")) return baseUrl + url
      // If the url is on the same domain, allow it
      try {
        const urlObj = new URL(url)
        const baseObj = new URL(baseUrl)
        if (urlObj.hostname === baseObj.hostname) return url
      } catch {}
      // If url is on a different domain (e.g., localhost vs actual domain),
      // redirect to the same path on the actual domain
      try {
        const urlObj = new URL(url)
        const baseObj = new URL(baseUrl)
        // Replace the origin but keep the path
        return baseObj.origin + urlObj.pathname + urlObj.search
      } catch {
        return baseUrl
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "trishulhub-secret-key-change-in-production",
  // Trust the proxy - required for Vercel and reverse proxy deployments
  // This ensures NextAuth sees the correct https:// protocol
  trustHost: true,
} as NextAuthOptions

export default NextAuth(authOptions)
