import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  try {
    // Verify database connectivity with a simple query
    await db.user.count({ take: 1 })
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "TrishulHub AI Agent Dashboard",
      database: "connected",
    })
  } catch (error: any) {
    return NextResponse.json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      service: "TrishulHub AI Agent Dashboard",
      database: "disconnected",
      error: "Database connection failed",
    }, { status: 503 })
  }
}
