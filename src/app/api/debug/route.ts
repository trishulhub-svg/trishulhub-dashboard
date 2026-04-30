import { NextResponse } from "next/server"

// Debug endpoint - check Vercel environment and database connectivity
export async function GET() {
  const results: Record<string, any> = {}

  // 1. Check ALL environment variables
  results.env = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL || "NOT_SET",
    VERCEL_URL: process.env.VERCEL_URL || "NOT_SET",
    DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
      ? `SET (length: ${process.env.TURSO_AUTH_TOKEN.length})`
      : "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET (trustHost should handle this)",
  }

  // 2. Test database connection
  try {
    const { db } = await import("@/lib/db")
    const userCount = await db.user.count()
    const agentCount = await db.agent.count()
    results.database = {
      status: "CONNECTED",
      userCount,
      agentCount,
    }

    // Test finding a specific user
    const testUser = await db.user.findFirst({
      where: { email: "taroon@trishulhub.in" },
    })
    results.database.testUser = testUser
      ? { id: testUser.id, email: testUser.email, role: testUser.role, isActive: testUser.isActive }
      : "NOT_FOUND"
  } catch (err: any) {
    results.database = {
      status: "ERROR",
      error: err.message,
      stack: err.stack?.substring(0, 800),
    }
  }

  // 3. Test bcrypt
  try {
    const bcrypt = await import("bcryptjs")
    const hash = await bcrypt.hash("test", 4)
    const valid = await bcrypt.compare("test", hash)
    results.bcrypt = { status: "OK", canHash: true, canCompare: valid }
  } catch (err: any) {
    results.bcrypt = { status: "ERROR", error: err.message }
  }

  // 4. Test NextAuth config
  try {
    const { authOptions } = await import("@/lib/auth")
    results.nextauth = {
      hasTrustHost: (authOptions as any).trustHost === true,
      hasSecret: !!authOptions.secret,
      secretValue: authOptions.secret ? "SET" : "MISSING",
      hasProviders: authOptions.providers?.length > 0,
      providerCount: authOptions.providers?.length,
      strategy: authOptions.session?.strategy,
      signInPage: authOptions.pages?.signIn,
      errorPage: authOptions.pages?.error,
    }
  } catch (err: any) {
    results.nextauth = { status: "ERROR", error: err.message, stack: err.stack?.substring(0, 500) }
  }

  // 5. Check headers that Vercel sends
  results.notes = {
    message: "If NEXTAUTH_SECRET is MISSING, that's your 500 error cause. Set it on Vercel.",
    nextauthUrl: "NEXTAUTH_URL should be https://trishulhub.com (with https://)",
    trustHost: "With trustHost:true, NEXTAUTH_URL is auto-detected from headers",
  }

  return NextResponse.json(results, { status: 200 })
}
