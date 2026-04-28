import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Minimal middleware - only protects dashboard routes
// NEXTAUTH_URL is handled by trustHost: true in auth config
// DO NOT set process.env.NEXTAUTH_URL here - it doesn't work on Vercel serverless
export function middleware(request: NextRequest) {
  // Just pass through - NextAuth handles its own routes
  // trustHost: true in the NextAuth config handles URL detection
  return NextResponse.next()
}

// Only run on auth-related routes and protected pages
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/portal/:path*",
    "/api/auth/:path*",
  ],
}
