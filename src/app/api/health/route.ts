import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const diagnostics: Record<string, any> = {}

  try {
    // Verify database connectivity with a simple query
    const userCount = await db.user.count({ take: 1 })
    const totalUsers = await db.user.count()
    diagnostics.database = "connected"
    diagnostics.totalUsers = totalUsers
    diagnostics.nextAuthSecret = process.env.NEXTAUTH_SECRET ? "SET" : "MISSING"
    diagnostics.tursoUrl = process.env.TURSO_DATABASE_URL ? "SET" : "MISSING"
    diagnostics.tursoAuthToken = process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING"

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "TrishulHub AI Agent Dashboard",
      diagnostics,
    })
  } catch (error: any) {
    diagnostics.database = "disconnected"
    diagnostics.nextAuthSecret = process.env.NEXTAUTH_SECRET ? "SET" : "MISSING"
    diagnostics.tursoUrl = process.env.TURSO_DATABASE_URL ? "SET" : "MISSING"
    diagnostics.tursoAuthToken = process.env.TURSO_AUTH_TOKEN ? "SET" : "MISSING"
    diagnostics.error = error.message

    return NextResponse.json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      service: "TrishulHub AI Agent Dashboard",
      diagnostics,
    }, { status: 503 })
  }
}
