import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest } from "next/server"

// Dynamic handler that auto-detects the correct NEXTAUTH_URL from request headers
async function handler(req: NextRequest) {
  // Auto-detect the correct URL from the request
  // Hostinger proxies requests: browser → Nginx/Apache → Node.js
  // The x-forwarded-host and x-forwarded-proto headers tell us the real domain
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("host")

  if (forwardedHost || host) {
    const realHost = forwardedHost || host || "localhost:3000"
    const realProto = forwardedProto.includes("https") ? "https" : "http"
    const detectedUrl = `${realProto}://${realHost}`

    // Only update if different from current setting
    if (process.env.NEXTAUTH_URL !== detectedUrl) {
      process.env.NEXTAUTH_URL = detectedUrl
      console.log(`[auth] NEXTAUTH_URL auto-detected: ${detectedUrl}`)
    }
  }

  // Now let NextAuth handle the request
  const nextAuth = NextAuth(authOptions)
  return nextAuth(req)
}

export { handler as GET, handler as POST }
