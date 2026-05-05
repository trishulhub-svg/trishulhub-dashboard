import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Debug endpoint - check Vercel environment and database connectivity
// SECURITY FIX: Disabled by default. Only enabled when ENABLE_DEBUG_API=true is set in environment.
// Even when enabled, requires SUPER_ADMIN authentication.
export async function GET(req: NextRequest) {
  // SECURITY FIX: Block access unless explicitly enabled via environment variable
  if (process.env.ENABLE_DEBUG_API !== 'true') {
    return NextResponse.json({ error: "Not Found" }, { status: 404 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userRole = session.user.role
  // Only SUPER_ADMIN can access debug endpoint (not even in development mode without auth)
  if (userRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: SUPER_ADMIN only" }, { status: 403 })
  }
  
  const results: Record<string, any> = {}

  // 1. Check environment variables (no secret values exposed)
  results.env = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL || "NOT_SET",
    DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET",
  }

  // 2. Test database connection (no user data)
  try {
    const { db } = await import("@/lib/db")
    const userCount = await db.user.count()
    const agentCount = await db.agent.count()
    results.database = {
      status: "CONNECTED",
      userCount,
      agentCount,
    }
  } catch (err: any) {
    results.database = {
      status: "ERROR",
      error: "Database connection failed",
    }
    console.error("[debug] DB error:", err.message)
  }

  // 3. Test bcrypt
  try {
    const bcrypt = await import("bcryptjs")
    const hash = await bcrypt.hash("test", 4)
    const valid = await bcrypt.compare("test", hash)
    results.bcrypt = { status: "OK", canHash: true, canCompare: valid }
  } catch (err: any) {
    results.bcrypt = { status: "ERROR", error: "bcrypt test failed" }
    console.error("[debug] bcrypt error:", err.message)
  }

  // 4. Test NextAuth config (no secret values)
  try {
    const { authOptions } = await import("@/lib/auth")
    results.nextauth = {
      hasTrustHost: (authOptions as any).trustHost === true,
      hasSecret: !!authOptions.secret,
      hasProviders: authOptions.providers?.length > 0,
      providerCount: authOptions.providers?.length,
      strategy: authOptions.session?.strategy,
    }
  } catch (err: any) {
    results.nextauth = { status: "ERROR" }
    console.error("[debug] NextAuth error:", err.message)
  }

  return NextResponse.json(results, { status: 200 })
}
