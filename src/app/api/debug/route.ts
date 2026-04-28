import { NextResponse } from "next/server"

// Debug endpoint to check Vercel environment
export async function GET() {
  const results: Record<string, any> = {}

  // Check env vars
  results.env = {
    DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
    DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL ? "SET" : "MISSING",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? "SET (length: " + process.env.TURSO_AUTH_TOKEN.length + ")" : "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT SET",
    NODE_ENV: process.env.NODE_ENV,
  }

  // Test database connection
  try {
    const { db } = await import("@/lib/db")
    const userCount = await db.user.count()
    results.database = { status: "CONNECTED", userCount }
  } catch (err: any) {
    results.database = { status: "ERROR", error: err.message, stack: err.stack?.substring(0, 500) }
  }

  // Test bcrypt
  try {
    const bcrypt = await import("bcryptjs")
    const hash = await bcrypt.hash("test", 4)
    const valid = await bcrypt.compare("test", hash)
    results.bcrypt = { status: "OK", canHash: true, canCompare: valid }
  } catch (err: any) {
    results.bcrypt = { status: "ERROR", error: err.message }
  }

  // Test NextAuth config
  try {
    const { authOptions } = await import("@/lib/auth")
    results.nextauth = {
      hasTrustHost: (authOptions as any).trustHost === true,
      hasSecret: !!authOptions.secret,
      hasProviders: authOptions.providers?.length > 0,
      strategy: authOptions.session?.strategy,
    }
  } catch (err: any) {
    results.nextauth = { status: "ERROR", error: err.message }
  }

  return NextResponse.json(results, { status: 200 })
}
