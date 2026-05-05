import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"

// GET /api/availability/overrides - List overrides
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any).role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const where: any = {}

    const userId = searchParams.get("userId")
    if (userId) where.userId = userId

    const date = searchParams.get("date")
    if (date) {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)
      where.date = { gte: startOfDay, lte: endOfDay }
    }

    const overrides = await db.availabilityOverride.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { date: "asc" },
    })

    return NextResponse.json(overrides)
  } catch (error: any) {
    console.error("[availability/overrides] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/availability/overrides - Create override
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any).role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { userId, date, startTime, endTime, isAvailable, reason } = await req.json()

    if (!userId || !date) {
      return NextResponse.json({ error: "User ID and date are required" }, { status: 400 })
    }

    const override = await db.availabilityOverride.create({
      data: {
        userId,
        date: new Date(date),
        startTime: startTime || null,
        endTime: endTime || null,
        isAvailable: isAvailable !== undefined ? isAvailable : false,
        reason: reason || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json(override, { status: 201 })
  } catch (error: any) {
    console.error("[availability/overrides] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/overrides - Delete override
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })
    
    const existing = await db.availabilityOverride.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Override not found" }, { status: 404 })
    
    await db.availabilityOverride.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[availability/overrides] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
