import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Paths that don't require authentication
const publicPaths = ["/login", "/api/auth", "/api/health"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for session token
  // NextAuth uses different cookie names based on strategy
  const sessionToken =
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value

  if (!sessionToken) {
    // Redirect to login for page routes
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }
    // For API routes, return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/portal/:path*",
    "/api/auth/:path*",
    "/api/health",
  ],
}
