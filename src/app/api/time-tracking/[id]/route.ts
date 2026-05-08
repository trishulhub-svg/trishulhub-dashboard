import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateTimeEntrySchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// PATCH /api/time-tracking/[id] - Stop timer (clock out) or update entry
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`time-tracking-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const userId = session.user.id
    const userRole = session.user.role
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    const { id } = await params
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = validateRequest(updateTimeEntrySchema, { ...body, id })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Check entry exists and user has access
    const existing = await db.timeEntry.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 })
    }

    if (!isAdmin && existing.userId !== userId) {
      return NextResponse.json({ error: "You can only update your own entries" }, { status: 403 })
    }

    const { description, projectId, status } = validation.data

    const updateData: Record<string, unknown> = {}

    if (description !== undefined) updateData.description = description
    if (projectId !== undefined) updateData.projectId = projectId || null

    // [FIX H5: Only allow COMPLETED status on ACTIVE entries — prevent restarting stopped timers]
    if (status === "COMPLETED") {
      if (existing.status !== "ACTIVE") {
        return NextResponse.json({ error: "Cannot complete a timer that is not active" }, { status: 400 })
      }
      const now = new Date()
      updateData.clockOut = now
      updateData.status = "COMPLETED"
      const diffMs = now.getTime() - new Date(existing.clockIn).getTime()
      updateData.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
    }
    // Prevent setting status back to ACTIVE on a completed entry
    if (status === "ACTIVE" && existing.status === "COMPLETED") {
      return NextResponse.json({ error: "Cannot restart a completed time entry. Please start a new timer." }, { status: 400 })
    }

    const entry = await db.timeEntry.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(entry)
  } catch (error: unknown) {
    console.error("[time-tracking] PATCH error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/time-tracking/[id] - Delete a time entry
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`time-tracking-del-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const userId = session.user.id
    const userRole = session.user.role
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    const { id } = await params

    const existing = await db.timeEntry.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 })
    }

    if (!isAdmin && existing.userId !== userId) {
      return NextResponse.json({ error: "You can only delete your own entries" }, { status: 403 })
    }

    await db.timeEntry.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[time-tracking] DELETE error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
