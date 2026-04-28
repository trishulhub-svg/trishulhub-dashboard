import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// This middleware auto-detects the correct NEXTAUTH_URL from request headers
// On Hostinger, the app runs behind a reverse proxy (Nginx/Apache → Node.js)
// Without this, NEXTAUTH_URL stays as localhost:3000 which breaks auth redirects
export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto")
  const host = request.headers.get("host")

  // Auto-detect the real domain from proxy headers
  if (forwardedHost || host) {
    const realHost = forwardedHost || host || "localhost:3000"
    const realProto = forwardedProto
      ? (forwardedProto.includes("https") ? "https" : "http")
      : (realHost.includes("localhost") ? "http" : "https")
    const detectedUrl = `${realProto}://${realHost}`

    // Update NEXTAUTH_URL at runtime
    if (process.env.NEXTAUTH_URL !== detectedUrl) {
      process.env.NEXTAUTH_URL = detectedUrl
    }
  }

  return NextResponse.next()
}

// Run on all API routes and dashboard pages
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
}
