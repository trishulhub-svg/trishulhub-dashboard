import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAllTables } from "@/lib/auto-migrate"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/notification-preferences
export async function GET() {
  try {
    await ensureAllTables()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // C23: Use upsert instead of find-then-create to prevent race condition
    const prefs = await db.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: {},
    })

    return NextResponse.json(prefs)
  } catch (error: unknown) {
    console.error("[notification-preferences] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 })
  }
}

// PATCH /api/notification-preferences
export async function PATCH(req: NextRequest) {
  try {
    await ensureAllTables()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limit preference updates
    const rl = rateLimit(`notif-prefs-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // Only allow specific fields
    const allowedFields = [
      "emailNotifications", "budgetAlerts", "meetingReminders",
      "taskReminders", "approvalAlerts", "invoiceReminders",
      "quietHoursEnabled", "quietHoursStart", "quietHoursEnd",
    ]

    // HH:mm time format regex for quiet hours
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

    // W29: removed updatedAt — Prisma @updatedAt handles it
    const updateData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (key in body) {
        // W27: Explicit type validation — reject non-boolean/non-string values
        if (typeof body[key] !== "boolean" && typeof body[key] !== "string") {
          return NextResponse.json({ error: `"${key}" must be a boolean or string` }, { status: 400 })
        }
        if (typeof body[key] === "boolean") {
          updateData[key] = body[key]
        } else if (typeof body[key] === "string") {
          // Validate time format for quiet hours fields
          if ((key === "quietHoursStart" || key === "quietHoursEnd") && body[key] !== "") {
            if (!timeRegex.test(body[key] as string)) {
              return NextResponse.json({ error: `${key} must be in HH:mm format (e.g. 22:00)` }, { status: 400 })
            }
          }
          updateData[key] = body[key]
        }
      }
    }

    // W28: Validate quiet hours consistency when enabled
    if (updateData.quietHoursEnabled === true) {
      if (!updateData.quietHoursStart || !updateData.quietHoursEnd) {
        return NextResponse.json({ error: "Both start and end times required when quiet hours enabled" }, { status: 400 })
      }
    }

    const prefs = await db.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...updateData },
      update: updateData,
    })

    return NextResponse.json(prefs)
  } catch (error: unknown) {
    console.error("[notification-preferences] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 })
  }
}
