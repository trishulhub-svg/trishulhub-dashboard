import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"

const timeRegex = /^\d{2}:\d{2}$/

// PATCH /api/availability/overrides/[id] - Update override
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureTable("AvailabilityOverride")

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    const data: Record<string, unknown> = {}

    // W38: Validate fields before applying
    if (body.date !== undefined) {
      const parsedDate = new Date(body.date)
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      data.date = new Date(body.date)
    }
    if (body.startTime !== undefined) {
      if (!timeRegex.test(body.startTime)) {
        return NextResponse.json({ error: "Start time must be in HH:MM format" }, { status: 400 })
      }
      data.startTime = body.startTime
    }
    if (body.endTime !== undefined) {
      if (!timeRegex.test(body.endTime)) {
        return NextResponse.json({ error: "End time must be in HH:MM format" }, { status: 400 })
      }
      data.endTime = body.endTime
    }
    if (body.isAvailable !== undefined) {
      if (typeof body.isAvailable !== "boolean") {
        return NextResponse.json({ error: "isAvailable must be a boolean" }, { status: 400 })
      }
      data.isAvailable = body.isAvailable
    }
    if (body.reason !== undefined) data.reason = String(body.reason).slice(0, 200)

    const override = await db.$transaction(async (tx) => {
      const existing = await tx.availabilityOverride.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("NOT_FOUND")
      }

      // W38: Validate startTime < endTime if both provided (cross-field with existing record)
      const effectiveStartTime = data.startTime !== undefined ? data.startTime : existing.startTime
      const effectiveEndTime = data.endTime !== undefined ? data.endTime : existing.endTime
      if (effectiveStartTime && effectiveEndTime && effectiveStartTime >= effectiveEndTime) {
        throw new Error("START_AFTER_END")
      }

      return tx.availabilityOverride.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })
    })

    return NextResponse.json(override)
  } catch (error: unknown) {
    console.error("[availability/overrides] PATCH error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Availability override not found" }, { status: 404 })
    }
    if (error instanceof Error && error.message === "START_AFTER_END") {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/overrides/[id] - Delete override
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params

    const existing = await db.availabilityOverride.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Availability override not found" }, { status: 404 })
    }

    await db.availabilityOverride.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[availability/overrides] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
