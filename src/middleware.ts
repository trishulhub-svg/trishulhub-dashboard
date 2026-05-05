import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Paths that don't require authentication
const publicPaths = ["/login", "/api/auth", "/api/health", "/api/setup", "/reset-password", "/api/password-reset"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Decode JWT token to check session validity
  const token = await getToken({ req: request })

  // No valid token — redirect to login
  if (!token) {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      return response
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Session invalidated. Please log in again.", reason: "kicked" },
        { status: 401 }
      )
    }
  }

  // Session is valid — check for sessionToken presence
  // If no sessionToken, the session predates the single-device feature
  // and should be allowed (graceful migration)
  if (token && !token.sessionToken) {
    // Old session without sessionToken — allow through
    // The JWT callback will add a sessionToken on next refresh
  }

  // Role-based access control
  if (pathname.startsWith("/dashboard")) {
    const role = token?.role as string | undefined

    // CLIENT users cannot access dashboard at all
    if (role === "CLIENT") {
      return NextResponse.redirect(new URL("/portal", request.url))
    }

    // Admin-only routes
    const adminOnlyRoutes = ["/dashboard/api-keys", "/dashboard/finance", "/dashboard/crm", "/dashboard/clients", "/dashboard/availability", "/dashboard/team"]
    const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

    if (!isAdmin && adminOnlyRoutes.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/portal/:path*",
    "/api/:path*",
  ],
}
