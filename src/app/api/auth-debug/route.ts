import { NextResponse } from "next/server"

// Dedicated auth debug endpoint - tests the exact flow that happens during login
export async function POST(request: Request) {
  const results: Record<string, any> = { step: "init" }

  try {
    // Step 1: Check environment
    results.step = "checking_env"
    if (!process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({
        error: "NEXTAUTH_SECRET is not set!",
        fix: "Add NEXTAUTH_SECRET to your Vercel environment variables",
        currentEnv: {
          NEXTAUTH_SECRET: "MISSING",
          NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET",
          TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
          TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING",
        }
      }, { status: 500 })
    }

    // Step 2: Parse the request body (simulate login)
    results.step = "parsing_body"
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = { email: "test@test.com", password: "test" }
    }

    const { email, password } = body
    if (!email || !password) {
      return NextResponse.json({
        error: "Missing email or password in request body",
        received: { email: !!email, password: !!password }
      }, { status: 400 })
    }

    // Step 3: Test database connection
    results.step = "testing_db"
    const { db } = await import("@/lib/db")

    const user = await db.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json({
        step: "database_lookup",
        status: "USER_NOT_FOUND",
        email,
        hint: "This email doesn't exist in the database. Try taroon@trishulhub.in",
      })
    }

    // Step 4: Test password comparison
    results.step = "testing_password"
    const bcrypt = await import("bcryptjs")
    const passwordValid = await bcrypt.compare(password, user.password)

    if (!passwordValid) {
      return NextResponse.json({
        step: "password_check",
        status: "INVALID_PASSWORD",
        email,
        hint: "Password doesn't match. Default password is password123",
      })
    }

    // Step 5: Success
    return NextResponse.json({
      step: "complete",
      status: "AUTH_WOULD_SUCCEED",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
      env: {
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET (trustHost handles this)",
        TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
        TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING",
      }
    })

  } catch (error: any) {
    return NextResponse.json({
      step: results.step,
      error: error.message,
      stack: error.stack?.substring(0, 1000),
      env: {
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET",
        TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
        TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING",
      }
    }, { status: 500 })
  }
}

// GET version for quick browser testing
export async function GET() {
  const envCheck = {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET (trustHost handles this)",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? "SET" : "MISSING",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING",
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL || "NOT_SET",
  }

  let dbStatus = "NOT_TESTED"
  let userCount = 0
  try {
    const { db } = await import("@/lib/db")
    userCount = await db.user.count()
    dbStatus = "CONNECTED"
  } catch (err: any) {
    dbStatus = `ERROR: ${err.message}`
  }

  return NextResponse.json({
    status: "Auth Debug Endpoint",
    environment: envCheck,
    database: { status: dbStatus, userCount },
    fixes: {
      if_NEXTAUTH_SECRET_MISSING: "Add a random string as NEXTAUTH_SECRET in Vercel env vars",
      if_NEXTAUTH_URL_WRONG: "Should be https://trishulhub.com (with https:// protocol)",
      if_TURSO_MISSING: "Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel env vars",
    },
    testLogin: "POST to /api/auth-debug with { email: 'taroon@trishulhub.in', password: 'password123' }"
  })
}
