import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"

const timeRegex = /^\d{2}:\d{2}$/

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

    const availability = await db.$transaction(async (tx) => {
      const existing = await tx.availability.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("NOT_FOUND")
      }
      return tx.availability.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })
    })

    return NextResponse.json(availability)
  } catch (error: unknown) {
    console.error("[availability] PATCH error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 })
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

    await db.$transaction(async (tx) => {
      const existing = await tx.availability.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("NOT_FOUND")
      }
      await tx.availability.delete({ where: { id } })
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
