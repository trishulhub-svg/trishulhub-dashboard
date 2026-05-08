import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"

// PATCH /api/availability/[id] - Update availability
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable("Availability")
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { id } = await params
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    const existing = await db.availability.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 })
    }

    const data: any = {}
    if (body.dayOfWeek !== undefined) data.dayOfWeek = parseInt(body.dayOfWeek)
    if (body.startTime !== undefined) data.startTime = body.startTime
    if (body.endTime !== undefined) data.endTime = body.endTime
    if (body.isAvailable !== undefined) data.isAvailable = body.isAvailable

    const availability = await db.availability.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json(availability)
  } catch (error: any) {
    console.error("[availability] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/[id] - Delete availability
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable("Availability")
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { id } = await params

    const existing = await db.availability.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 })
    }

    await db.availability.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[availability] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
