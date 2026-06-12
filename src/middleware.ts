import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Paths where middleware doesn't enforce auth (route handlers may have their own auth)
// /api/setup must remain public — its own auth logic handles first-time seeding (SETUP_TOKEN) and requires SUPER_ADMIN when users exist.
const publicPaths = ["/login", "/api/auth", "/api/health", "/api/setup", "/reset-password", "/api/password-reset", "/api/protocol-auth", "/api/protocol", "/api/lark/webhook"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return addSecurityHeaders(request, NextResponse.next())
  }

  // Decode JWT token to check session validity
  // Wrap in try/catch: if NEXTAUTH_SECRET is missing, getToken() throws
  // instead of returning null, which would crash ALL matched routes.
  let token: { error?: string; role?: string; [key: string]: unknown } | null = null
  try {
    token = await getToken({ req: request })
  } catch (err) {
    // Degrade gracefully — treat as unauthenticated
    console.error("[middleware] getToken failed:", err instanceof Error ? err.message : err)
  }

    // No valid token — handle unauthenticated requests.
    // Public paths (publicPaths array) have already been filtered above.
  if (!token) {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return addSecurityHeaders(request, NextResponse.redirect(loginUrl))
    }
    // Block non-public API routes — publicPaths already filtered above,
    // so any /api/ route reaching here requires authentication.
    if (pathname.startsWith("/api/")) {
      return addSecurityHeaders(request, NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ))
    }
  }

  // Check for session errors set by the JWT callback
  // SessionKicked = another device logged in, email changed, or session invalidated
  if (token?.error === "SessionKicked") {
    // For pages: redirect to login with kicked reason
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("reason", "kicked")
      const response = NextResponse.redirect(loginUrl)
      response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" })
      response.cookies.set("__Secure-next-auth.session-token", "", { maxAge: 0, path: "/" })
      return addSecurityHeaders(request, response)
    }
    // For API routes: return 401 with kicked reason and clear cookies
    // so the client can detect and handle the session invalidation
    if (pathname.startsWith("/api/")) {
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
    const adminOnlyRoutes = [
      "/dashboard/api-keys",
      "/dashboard/finance",
      "/dashboard/crm",
      "/dashboard/clients",
      "/dashboard/availability",
      "/dashboard/team",
      "/dashboard/training",
      "/dashboard/leaves",
      "/dashboard/my-training",
      "/dashboard/approvals",
      "/dashboard/settings",
      "/dashboard/credentials",
      "/dashboard/lark",
    ]
    const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

    if (!isAdmin && adminOnlyRoutes.some(route => pathname.startsWith(route))) {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
    }
  }

  // FIX: Verify CLIENT role for portal routes at middleware level
  // Prevents non-CLIENT users from accessing portal pages directly
  if (pathname.startsWith("/portal") && token?.role !== undefined && token.role !== "CLIENT") {
    return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
  }

  return addSecurityHeaders(request, NextResponse.next())
}

/**
 * Add security headers to all responses.
 * Prevents clickjacking, MIME sniffing, and protocol downgrade attacks.
 */
function addSecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl
  // Always skip _next static assets
  if (pathname.startsWith("/_next/")) {
    return response
  }

  // Add security headers to API responses (SEC-016, P11-MW-02)
  if (pathname.startsWith("/api/")) {
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("X-Frame-Options", "DENY")
    response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    return response
  }

  // Prevent framing (clickjacking protection)
  response.headers.set("X-Frame-Options", "DENY")
  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff")
  // Enforce HTTPS for all subdomains for 1 year
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  // XSS protection (P11-MW-06)
  response.headers.set("X-XSS-Protection", "1; mode=block")
  // Restrict browser features that this app doesn't need
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
  // Referrer policy — send origin only on cross-origin
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  // Content Security Policy — REPORT-ONLY to start (won't break anything, just reports violations)
  // Upgrade to enforce after reviewing violation reports in production.
  response.headers.set("Content-Security-Policy-Report-Only",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://api.openai.com https://*.turso.tech; " +
    "frame-ancestors 'none'"
  )
  return response
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/portal/:path*",
    "/api/:path*",
    "/login",
    "/reset-password",
  ],
}
