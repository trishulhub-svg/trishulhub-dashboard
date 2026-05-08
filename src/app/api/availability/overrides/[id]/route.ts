import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"

// PATCH /api/availability/overrides/[id] - Update override
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable("AvailabilityOverride")
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { id } = await params
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    const existing = await db.availabilityOverride.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Availability override not found" }, { status: 404 })
    }

    const data: any = {}
    if (body.date !== undefined) data.date = new Date(body.date)
    if (body.startTime !== undefined) data.startTime = body.startTime
    if (body.endTime !== undefined) data.endTime = body.endTime
    if (body.isAvailable !== undefined) data.isAvailable = body.isAvailable
    if (body.reason !== undefined) data.reason = body.reason

    const override = await db.availabilityOverride.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json(override)
  } catch (error: any) {
    console.error("[availability/overrides] PATCH error:", error.message)
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

    const { id } = await params

    const existing = await db.availabilityOverride.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Availability override not found" }, { status: 404 })
    }

    await db.availabilityOverride.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[availability/overrides] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
