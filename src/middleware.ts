import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Paths that don't require authentication
const publicPaths = ["/login", "/api/auth", "/api/health", "/api/setup", "/reset-password", "/api/password-reset"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return addSecurityHeaders(request, NextResponse.next())
  }

  // Decode JWT token to check session validity
  const token = await getToken({ req: request })

  // No valid token — redirect to login
  if (!token) {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return addSecurityHeaders(request, NextResponse.redirect(loginUrl))
    }
    if (pathname.startsWith("/api/")) {
      return addSecurityHeaders(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }
  }

  // Check for session errors set by the JWT callback
  // SessionKicked = another device logged in, email changed, or session invalidated
  if (token?.error === "SessionKicked") {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("reason", "kicked")
      // Clear the session cookie
      const response = NextResponse.redirect(loginUrl)
      response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" })
      response.cookies.set("__Secure-next-auth.session-token", "", { maxAge: 0, path: "/" })
      return addSecurityHeaders(request, response)
    }
    if (pathname.startsWith("/api/")) {
      // FIX: Also clear cookies for API routes with kicked sessions
      // so the client can detect and handle the session invalidation
      const response = NextResponse.json(
        { error: "Session invalidated. Please log in again.", reason: "kicked" },
        { status: 401 }
      )
      response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" })
      response.cookies.set("__Secure-next-auth.session-token", "", { maxAge: 0, path: "/" })
      return addSecurityHeaders(request, response)
    }
  }

  // Role-based access control
  if (pathname.startsWith("/dashboard")) {
    const role = token?.role

    // CLIENT users cannot access dashboard at all
    if (role === "CLIENT") {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/portal", request.url)))
    }

    // Admin-only routes
    const adminOnlyRoutes = ["/dashboard/api-keys", "/dashboard/finance", "/dashboard/crm", "/dashboard/clients", "/dashboard/availability", "/dashboard/team", "/dashboard/training"]
    const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

    if (!isAdmin && adminOnlyRoutes.some(route => pathname.startsWith(route))) {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
    }
  }

  // FIX: Verify CLIENT role for portal routes at middleware level
  // Prevents non-CLIENT users from accessing portal pages directly
  if (pathname.startsWith("/portal") && token?.role && token.role !== "CLIENT") {
    return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
  }

  return addSecurityHeaders(request, NextResponse.next())
}

/**
 * Add security headers to all responses.
 * Prevents clickjacking, MIME sniffing, and protocol downgrade attacks.
 */
function addSecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
  // Only set security headers for page requests (not API or _next static assets)
  const { pathname } = request.nextUrl
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return response
  }

  // Prevent framing (clickjacking protection)
  response.headers.set("X-Frame-Options", "DENY")
  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff")
  // XSS protection (legacy browsers)
  response.headers.set("X-XSS-Protection", "1; mode=block")
  // Referrer policy — send origin only on cross-origin
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  return response
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/portal/:path*",
    "/api/:path*",
  ],
}
