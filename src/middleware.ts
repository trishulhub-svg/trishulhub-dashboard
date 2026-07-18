import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import {
  isPageAccessAllowed,
  normalizePageAccessMode,
  parsePageAccessPages,
} from "@/lib/nav-pages"

// Paths where middleware doesn't enforce auth (route handlers may have their own auth)
// /api/setup must remain public — its own auth logic handles first-time seeding (SETUP_TOKEN) and requires SUPER_ADMIN when users exist.
const publicPaths = ["/login", "/api/auth", "/api/health", "/api/setup", "/reset-password", "/api/password-reset"]

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
  // SessionKicked = another device logged in (max 2 exceeded, oldest kicked), email changed, or session invalidated
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

    // Legacy training setup bookmark
    if (pathname.startsWith("/dashboard/training/setup")) {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard/training/my", request.url)))
    }
    // Old Agent OS routes — gone (P3). Send anyone with a bookmark to Workspace.
    if (pathname.startsWith("/dashboard/agents") || pathname.startsWith("/api/agents")) {
      if (pathname.startsWith("/api/")) {
        return addSecurityHeaders(request, NextResponse.json({ error: "Removed" }, { status: 410 }))
      }
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard/workspace", request.url)))
    }

    // Granular role-based route protection.
    //
    // PROJECT_MANAGER is a tier between ADMIN and DEVELOPER. It can access
    // project/client/credential/approval management (admin-like) but is
    // excluded from finance, CRM, team, audit trail, and API keys vault.
    // Availability: PM has read-only access (UI + API mutations require ADMIN).
    // Access Hub: open to DEVELOPER for "My Credentials" (API scopes own rows).
    //
    // Super admin only routes — strictly SUPER_ADMIN.
    const superAdminOnlyRoutes: string[] = [
      "/dashboard/email-logs",
    ]

    // Admin only routes — NOT accessible to PROJECT_MANAGER.
    const adminOnlyRoutes = [
      "/dashboard/finance",
      "/dashboard/crm",
      "/dashboard/team",
      "/dashboard/audit-trail",
      "/dashboard/api-keys",
      // Assign training is Admin / Super Admin only (staff use /dashboard/training/my)
      "/dashboard/training/assign",
    ]

    // Admin OR Project Manager routes — Developers/viewers are redirected away
    // (except Access Hub, which is open to DEVELOPER via nav + credentials API).
    const adminOrPmRoutes = [
      "/dashboard/clients",
      "/dashboard/projects",
      "/dashboard/demo",
      "/dashboard/approvals",
      "/dashboard/support",
      "/dashboard/capacity",
      "/dashboard/availability", // PM read-only — mutations require isAdmin in API
    ]

    const isSuperAdmin = role === "SUPER_ADMIN"
    const isAdminRole = role === "SUPER_ADMIN" || role === "ADMIN"
    const isAdminOrPm = role === "SUPER_ADMIN" || role === "ADMIN" || role === "PROJECT_MANAGER"

    // Check super admin only routes
    if (!isSuperAdmin && superAdminOnlyRoutes.some(route => pathname.startsWith(route))) {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
    }

    // Check admin only routes (excludes PROJECT_MANAGER)
    if (!isAdminRole && adminOnlyRoutes.some(route => pathname.startsWith(route))) {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
    }

    // Check admin or PM routes
    if (!isAdminOrPm && adminOrPmRoutes.some(route => pathname.startsWith(route))) {
      return addSecurityHeaders(request, NextResponse.redirect(new URL("/dashboard", request.url)))
    }

    // Per-user page access ACL (Allow / Restrict) — SUPER_ADMIN bypasses in helper
    const pageMode = normalizePageAccessMode(token?.pageAccessMode)
    const pagePages = parsePageAccessPages(token?.pageAccessPages)
    if (!isPageAccessAllowed(pathname, role, pageMode, pagePages)) {
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

  // Prevent framing (clickjacking protection) — allow same-origin for floating task boards
  response.headers.set("X-Frame-Options", "SAMEORIGIN")
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
  // Enforcing CSP (Next.js still needs unsafe-inline/eval for runtime; tighten further later).
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.turso.tech https://*.vercel.app https://vercel.live",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ")
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
