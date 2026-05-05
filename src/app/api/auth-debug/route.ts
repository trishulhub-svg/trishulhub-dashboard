import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// SECURITY FIX: Auth debug endpoint is now SUPER_ADMIN only.
// Previously allowed any authenticated user to test credentials (credential oracle attack).
// In development mode, still requires SUPER_ADMIN role.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: SUPER_ADMIN only" }, { status: 403 })
  }

  try {
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

    const { db } = await import("@/lib/db")
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, isActive: true, password: true },
    })

    if (!user) {
      return NextResponse.json({
        step: "database_lookup",
        status: "USER_NOT_FOUND",
        email,
      })
    }

    const bcrypt = await import("bcryptjs")
    const passwordValid = await bcrypt.compare(password, user.password)

    if (!passwordValid) {
      return NextResponse.json({
        step: "password_check",
        status: "INVALID_PASSWORD",
        email,
      })
    }

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
    })

  } catch (error: any) {
    console.error("[auth-debug] POST error:", error.message)
    return NextResponse.json({
      error: "An error occurred during auth check",
    }, { status: 500 })
  }
}

// GET version - SUPER_ADMIN only
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: SUPER_ADMIN only" }, { status: 403 })
  }

  const envCheck = {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT_SET",
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
    dbStatus = "ERROR"
    console.error("[auth-debug] DB error:", err.message)
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
  })
}
