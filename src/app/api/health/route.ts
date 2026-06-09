import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  // Public endpoint - only return basic status, no sensitive info
  try {
    await db.user.count({ take: 1 })
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "TrishulHub Dashboard",
    })
  } catch {
    return NextResponse.json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      service: "TrishulHub Dashboard",
    }, { status: 503 })
  }
}

// POST /api/health - Authenticated diagnostics (SUPER_ADMIN only)
export async function POST() {
  const diagnostics: Record<string, any> = {}
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const totalUsers = await db.user.count()
    diagnostics.database = "connected"
    diagnostics.totalUsers = totalUsers
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString(), service: "TrishulHub Dashboard", diagnostics })
  } catch (error: unknown) {
    diagnostics.database = "disconnected"
    diagnostics.error = "Database connection failed"
    return NextResponse.json({ status: "degraded", timestamp: new Date().toISOString(), service: "TrishulHub Dashboard", diagnostics }, { status: 503 })
  }
}
