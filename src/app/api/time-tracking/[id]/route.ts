import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { updateTimeEntrySchema, adminUpdateTimeEntrySchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { checkClientClockIntegrity } from "@/lib/clock-integrity"
import {
  isDueOnOrBefore,
  syncProjectProgressFromMilestones,
  todayDateKey,
} from "@/lib/milestones"
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log"

const WORK_NOTES_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * PATCH /api/time-tracking/[id]
 * Stops a timer (clock out) or updates a time entry. Admins can modify clockIn, clockOut, description, projectId.
 * @param req - NextRequest with JSON body containing fields to update
 * @param params - Route params containing the time entry ID
 * @returns Updated time entry, or error with appropriate status code
 */
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

    // Check entry exists and user has access
    const existing = await db.timeEntry.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 })
    }

    if (!isAdmin && existing.userId !== userId) {
      return NextResponse.json({ error: "You can only update your own entries" }, { status: 403 })
    }

    // ── Admin edit path (can modify clockIn, clockOut, description, projectId) ──
    if (isAdmin && (body.clockIn !== undefined || body.clockOut !== undefined || (body.projectId !== undefined && body.status === undefined))) {
      // Check if this is an admin edit request (has clockIn or clockOut fields)
      const isAdminEdit = body.clockIn !== undefined || body.clockOut !== undefined
      if (isAdminEdit) {
        const validation = validateRequest(adminUpdateTimeEntrySchema, { ...body, id })
        if (!validation.success) {
          return NextResponse.json({ error: validation.error }, { status: 400 })
        }

        const { description, projectId, clockIn, clockOut } = validation.data
        const updateData: Prisma.TimeEntryUncheckedUpdateInput = {}

        if (description !== undefined) updateData.description = description
        if (projectId !== undefined) updateData.projectId = projectId || null

        if (clockIn) {
          updateData.clockIn = new Date(clockIn)
          updateData.date = new Date(clockIn)
        }

        if (clockOut !== undefined) {
          if (clockOut === null) {
            // Admin clearing clockOut: set back to ACTIVE
            updateData.clockOut = null
            updateData.status = "ACTIVE"
            updateData.totalHours = null
          } else {
            // Admin setting clockOut: calculate totalHours, set COMPLETED
            updateData.clockOut = new Date(clockOut)
            updateData.status = "COMPLETED"
            const effectiveClockIn = clockIn ? new Date(clockIn) : new Date(existing.clockIn)
            const diffMs = new Date(clockOut).getTime() - effectiveClockIn.getTime()
            if (diffMs < 0) {
              return NextResponse.json({ error: "clockOut cannot be before clockIn" }, { status: 400 })
            }
            updateData.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
          }
        } else if (clockIn && existing.clockOut) {
          // clockIn changed but clockOut unchanged: recalculate totalHours
          const diffMs = new Date(existing.clockOut).getTime() - new Date(clockIn).getTime()
          if (diffMs < 0) {
            return NextResponse.json({ error: "clockOut cannot be before clockIn" }, { status: 400 })
          }
          updateData.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
        }

        const entry = await db.$transaction(async (tx) => {
          const existingInTx = await tx.timeEntry.findUnique({ where: { id } })
          if (!existingInTx) return null
          return await tx.timeEntry.update({
            where: { id },
            data: updateData,
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
              project: { select: { id: true, name: true } },
            },
          })
        })

        if (!entry) {
          return NextResponse.json({ error: "Time entry not found" }, { status: 404 })
        }

        return NextResponse.json(entry)
      }
    }

    // ── Normal update path (wrapped in transaction for atomicity) ──
    const validation = validateRequest(updateTimeEntrySchema, { ...body, id })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { description, projectId, status, clientNow, timezone, acknowledgedMilestoneIds, workNotes } =
      validation.data

    const updateData: Prisma.TimeEntryUncheckedUpdateInput = {}

    if (description !== undefined) updateData.description = description
    if (projectId !== undefined) updateData.projectId = projectId || null

    // Work notes: optional at clock-out; after clock-out, editable only within 24h
    if (workNotes !== undefined && status !== "COMPLETED") {
      if (existing.status !== "COMPLETED" || !existing.clockOut) {
        return NextResponse.json(
          { error: "Work notes can only be edited after clock-out", code: "NOTES_NOT_READY" },
          { status: 400 }
        )
      }
      const elapsed = Date.now() - new Date(existing.clockOut).getTime()
      if (!isAdmin && elapsed > WORK_NOTES_EDIT_WINDOW_MS) {
        return NextResponse.json(
          {
            error: "Work notes can only be edited within 24 hours of clock-out",
            code: "NOTES_EDIT_LOCKED",
          },
          { status: 403 }
        )
      }
      updateData.workNotes = workNotes?.trim() ? workNotes.trim().slice(0, 500) : null
    }

    // [FIX H5: Only allow COMPLETED status on ACTIVE entries — prevent restarting stopped timers]
    let milestonesToComplete: string[] = []
    let projectForProgress: string | null = null

    if (status === "COMPLETED") {
      if (existing.status !== "ACTIVE") {
        return NextResponse.json({ error: "Cannot complete a timer that is not active" }, { status: 400 })
      }

      // Block clock-out when the device clock was manually changed (India/UK OK if accurate)
      const clockCheck = checkClientClockIntegrity({ clientNow, timezone })
      if (!clockCheck.ok) {
        return NextResponse.json(
          { error: clockCheck.error, code: clockCheck.code, details: clockCheck.details },
          { status: clockCheck.status }
        )
      }

      // Gate: ALL open milestones due today/overdue for this project must be ticked.
      // Ticking marks them permanently done and updates project progress.
      const projectForGate = projectId !== undefined ? projectId || null : existing.projectId
      if (projectForGate) {
        try {
          const openMilestones = await db.projectMilestone.findMany({
            where: { projectId: projectForGate, done: false },
            select: { id: true, title: true, dueDate: true },
          })
          const today = todayDateKey(clockCheck.serverNow)
          const blocking = openMilestones.filter(
            (m) => m.dueDate && isDueOnOrBefore(m.dueDate, today)
          )
          const acked = new Set(acknowledgedMilestoneIds || [])
          const missing = blocking.filter((m) => !acked.has(m.id))
          if (missing.length > 0) {
            return NextResponse.json(
              {
                error: `Tick ${missing.length} due milestone${missing.length === 1 ? "" : "s"} before clocking out`,
                code: "MILESTONES_INCOMPLETE",
                milestones: blocking.map((m) => ({
                  id: m.id,
                  title: m.title,
                  dueDate: m.dueDate,
                })),
              },
              { status: 409 }
            )
          }
          milestonesToComplete = blocking.filter((m) => acked.has(m.id)).map((m) => m.id)
          projectForProgress = projectForGate
        } catch (mileErr) {
          // If milestone tables aren't ready, don't block clock-out
          console.warn(
            "[time-tracking] milestone gate skipped:",
            mileErr instanceof Error ? mileErr.message : mileErr
          )
        }
      }

      const now = clockCheck.serverNow
      updateData.clockOut = now
      updateData.status = "COMPLETED"
      const diffMs = now.getTime() - new Date(existing.clockIn).getTime()
      updateData.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
      if (workNotes !== undefined) {
        updateData.workNotes = workNotes?.trim() ? workNotes.trim().slice(0, 500) : null
      }
    }
    // Prevent setting status back to ACTIVE on a completed entry
    if (status === "ACTIVE" && existing.status === "COMPLETED") {
      return NextResponse.json({ error: "Cannot restart a completed time entry. Please start a new timer." }, { status: 400 })
    }

    const entry = await db.$transaction(async (tx) => {
      const fresh = await tx.timeEntry.findUnique({ where: { id } })
      if (!fresh) throw new Error("NOT_FOUND")
      if (!isAdmin && fresh.userId !== userId) throw new Error("FORBIDDEN")

      if (milestonesToComplete.length > 0) {
        await tx.projectMilestone.updateMany({
          where: {
            id: { in: milestonesToComplete },
            done: false,
          },
          data: {
            done: true,
            completedAt: new Date(),
            completedBy: userId,
          },
        })
      }

      return tx.timeEntry.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
          project: { select: { id: true, name: true } },
        },
      })
    })

    if (projectForProgress) {
      try {
        await syncProjectProgressFromMilestones(projectForProgress)
      } catch (syncErr) {
        console.warn(
          "[time-tracking] progress sync failed:",
          syncErr instanceof Error ? syncErr.message : syncErr
        )
      }
    }

    if (status === "COMPLETED") {
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole,
        department: "TEAM_WORK",
        page: "time-tracking",
        action: "STATUS_CHANGE",
        entityType: "TimeEntry",
        entityId: entry.id,
        description: `Clocked out${entry.project?.name ? ` on ${entry.project.name}` : ""} (${entry.totalHours ?? 0}h)${
          milestonesToComplete.length > 0
            ? ` — marked ${milestonesToComplete.length} milestone${milestonesToComplete.length === 1 ? "" : "s"} done`
            : ""
        }`,
        oldValue: JSON.stringify({ status: "ACTIVE" }),
        newValue: JSON.stringify({
          status: "COMPLETED",
          totalHours: entry.totalHours,
          milestonesCompleted: milestonesToComplete.length,
        }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
        metadata: JSON.stringify({
          projectId: entry.projectId,
          milestoneIds: milestonesToComplete,
        }),
      })
    } else if (workNotes !== undefined) {
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole,
        department: "TEAM_WORK",
        page: "time-tracking",
        action: "UPDATE",
        entityType: "TimeEntry",
        entityId: entry.id,
        description: `Updated work notes on time entry`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
    }

    return NextResponse.json(entry)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 })
    }
    console.error("[time-tracking] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

/**
 * DELETE /api/time-tracking/[id]
 * Deletes a time entry. Admins can delete any entry; normal users can only delete their own.
 * @param req - NextRequest
 * @param params - Route params containing the time entry ID
 * @returns Success indicator or error with appropriate status code
 */
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

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "TEAM_WORK",
      page: "time-tracking",
      action: "DELETE",
      entityType: "TimeEntry",
      entityId: id,
      description: buildDescription("DELETE", "time entry", existing.description || id),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({ targetUserId: existing.userId, projectId: existing.projectId }),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[time-tracking] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
