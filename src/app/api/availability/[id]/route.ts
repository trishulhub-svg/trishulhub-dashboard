import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// W32: Standardized time validation regex (validates HH:MM with proper hour/minute ranges)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

// PATCH /api/availability/[id] - Update availability
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureTable("Availability")

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    const data: Record<string, unknown> = {}

    // W38: Validate fields
    if (body.dayOfWeek !== undefined) {
      const dow = parseInt(body.dayOfWeek)
      if (isNaN(dow) || dow < 0 || dow > 6) {
        return NextResponse.json({ error: "Day of week must be a valid number 0-6 (Sunday=0)" }, { status: 400 })
      }
      data.dayOfWeek = dow
    }
    if (body.startTime !== undefined) {
      if (!TIME_REGEX.test(body.startTime)) {
        return NextResponse.json({ error: "Start time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
      }
      data.startTime = body.startTime
    }
    if (body.endTime !== undefined) {
      if (!TIME_REGEX.test(body.endTime)) {
        return NextResponse.json({ error: "End time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
      }
      data.endTime = body.endTime
    }
    if (body.isAvailable !== undefined) {
      if (typeof body.isAvailable !== "boolean") {
        return NextResponse.json({ error: "isAvailable must be a boolean" }, { status: 400 })
      }
      data.isAvailable = body.isAvailable
    }

    const availability = await db.$transaction(async (tx) => {
      const existing = await tx.availability.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("NOT_FOUND")
      }

      // C25: Overlap validation — check if updated times overlap with other entries for the same user
      const checkDow = data.dayOfWeek !== undefined ? data.dayOfWeek as number : existing.dayOfWeek
      const checkStart = data.startTime !== undefined ? data.startTime as string : existing.startTime
      const checkEnd = data.endTime !== undefined ? data.endTime as string : existing.endTime

      // Only check overlap if day/time fields are being updated
      if (data.dayOfWeek !== undefined || data.startTime !== undefined || data.endTime !== undefined) {
        const overlapping = await tx.availability.findFirst({
          where: {
            userId: existing.userId,
            dayOfWeek: checkDow,
            id: { not: id },
            OR: [
              // Overlap: new start falls within existing range
              { startTime: { lt: checkEnd }, endTime: { gt: checkStart } },
            ],
          },
        })
        if (overlapping) {
          throw new Error("OVERLAP")
        }
      }

      return tx.availability.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })
    })

    // Audit: log availability update (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "availability", action: "UPDATE",
      entityType: "Availability", entityId: id,
      description: `Updated availability for user ${availability.user?.name || availability.userId} (fields: ${Object.keys(data).join(", ") || "none"})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json(availability)
  } catch (error: unknown) {
    console.error("[availability] PATCH error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 })
    }
    if (error instanceof Error && error.message === "OVERLAP") {
      return NextResponse.json({ error: "Time slot overlaps with an existing availability entry for this user" }, { status: 409 })
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/[id] - Delete availability
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureTable("Availability")

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params

    // Fetch existing record before deletion (for audit log) — outside the transaction
    // so TypeScript can correctly narrow the type across the async boundary.
    const existingRecord = await db.availability.findUnique({ where: { id } })
    if (!existingRecord) {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 })
    }

    await db.availability.delete({ where: { id } })

    // Audit: log availability deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "availability", action: "DELETE",
      entityType: "Availability", entityId: id,
      description: `Deleted availability for user ${existingRecord.userId}: day ${existingRecord.dayOfWeek}, ${existingRecord.startTime}–${existingRecord.endTime}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[availability] DELETE error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
