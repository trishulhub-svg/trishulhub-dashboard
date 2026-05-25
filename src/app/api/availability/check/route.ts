import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"

// GET /api/availability/check - Check who is available on a given date/time
export async function GET(req: NextRequest) {
  try {
    await ensureTable("Availability")
    await ensureTable("AvailabilityOverride")
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get("date")

    if (!dateStr) {
      return NextResponse.json({ error: "Date parameter is required" }, { status: 400 })
    }

    const date = new Date(dateStr)
    const dayOfWeek = date.getDay() // 0=Sunday, 6=Saturday
    const startTime = searchParams.get("startTime")
    const endTime = searchParams.get("endTime")

    // Get all non-client, active users
    const users = await db.user.findMany({
      where: { role: { not: "CLIENT" }, isActive: true },
      select: { id: true, name: true, email: true, role: true, department: true, avatar: true },
      orderBy: { name: "asc" },
    })

    // Get approved leaves overlapping with the date
    const startOfDay = new Date(dateStr)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(dateStr)
    endOfDay.setHours(23, 59, 59, 999)

    const approvedLeaves = await db.leave.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    // Get availability schedules for the day of week
    const availabilities = await db.availability.findMany({
      where: { dayOfWeek },
    })

    // Get overrides for the specific date
    const overrides = await db.availabilityOverride.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
    })

    // Build response for each user
    const results = users.map((user) => {
      // Check if user has an approved leave
      const userLeave = approvedLeaves.find((l) => l.userId === user.id)
      const isOnLeave = !!userLeave

      // Check for overrides
      const userOverrides = overrides.filter((o) => o.userId === user.id)
      const hasOverride = userOverrides.length > 0
      const allDayOverride = userOverrides.find((o) => !o.startTime && !o.endTime)
      const isAllDayUnavailable = allDayOverride ? !allDayOverride.isAvailable : false

      // Check weekly availability
      const userAvailability = availabilities.filter((a) => a.userId === user.id)
      const isNormallyAvailable = userAvailability.length > 0 ? userAvailability.some((a) => a.isAvailable) : true // Default to available if no schedule set

      // Determine availability status
      let status: "AVAILABLE" | "ON_LEAVE" | "UNAVAILABLE" | "LIMITED" = "AVAILABLE"
      let leaveInfo: { leaveType: string; startDate: string; endDate: string } | null = null
      let availabilityInfo: { timeSlots: string[] } | null = null

      if (isOnLeave) {
        status = "ON_LEAVE"
        leaveInfo = {
          leaveType: userLeave.leaveType,
          startDate: userLeave.startDate.toISOString(),
          endDate: userLeave.endDate.toISOString(),
        }
      } else if (isAllDayUnavailable) {
        status = "UNAVAILABLE"
      } else if (hasOverride) {
        // Check if any override makes them unavailable during the requested time
        const unavailableOverrides = userOverrides.filter((o) => !o.isAvailable)
        if (unavailableOverrides.length > 0) {
          status = "LIMITED"
        }
      } else if (userAvailability.length > 0) {
        const availableSlots = userAvailability
          .filter((a) => a.isAvailable)
          .map((a) => `${a.startTime}-${a.endTime}`)
        if (availableSlots.length === 0) {
          status = "UNAVAILABLE"
        } else {
          availabilityInfo = { timeSlots: availableSlots }
          if (startTime && endTime) {
            // Check if the requested time falls within any available slot
            const isAvailableDuringRequestedTime = userAvailability.some(
              (a) => a.isAvailable && a.startTime <= startTime && a.endTime >= endTime
            )
            if (!isAvailableDuringRequestedTime) {
              status = "LIMITED"
            }
          }
        }
      }

      if (!isNormallyAvailable && !isOnLeave && !hasOverride) {
        status = "UNAVAILABLE"
      }

      return {
        user,
        status,
        leaveInfo,
        availabilityInfo,
        overrides: userOverrides,
      }
    })

    return NextResponse.json(results)
  } catch (error: any) {
    console.error("[availability/check] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
