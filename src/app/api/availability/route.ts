import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"

// GET /api/availability - List availability entries
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const where: any = {}

    const userId = searchParams.get("userId")
    if (userId) where.userId = userId

    const dayOfWeek = searchParams.get("dayOfWeek")
    if (dayOfWeek !== null) where.dayOfWeek = parseInt(dayOfWeek)

    const availabilities = await db.availability.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    })

    return NextResponse.json(availabilities)
  } catch (error: any) {
    console.error("[availability] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/availability - Create availability entry
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { userId, dayOfWeek, startTime, endTime, isAvailable } = await req.json()

    if (!userId || dayOfWeek === undefined || dayOfWeek === null || !startTime || !endTime) {
      return NextResponse.json({ error: "User ID, day of week, start time, and end time are required" }, { status: 400 })
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: "Day of week must be 0-6 (Sunday=0)" }, { status: 400 })
    }

    const availability = await db.availability.create({
      data: {
        userId,
        dayOfWeek: parseInt(dayOfWeek),
        startTime,
        endTime,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json(availability, { status: 201 })
  } catch (error: any) {
    console.error("[availability] POST error:", error.message)
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Duplicate availability entry for this user, day, and time slot" }, { status: 409 })
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
