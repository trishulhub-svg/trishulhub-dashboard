import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { VALID_DEPARTMENT_VALUES } from "@/lib/types"

// [T4/T6] Valid role values
const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "DEVELOPER", "VIEWER", "CLIENT"] as const

// GET /api/team - List team data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-get-' + session.user.id, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    if (type === "users") {
      // SUPER_ADMIN and ADMIN: list all users for team management
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      const users = await db.user.findMany({
        where: { role: { not: "CLIENT" } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          isActive: true,
          avatar: true, // [T7] Add avatar to user list
          createdAt: true,
        },
        orderBy: { name: "asc" },
      })
      return NextResponse.json(JSON.parse(JSON.stringify(users)))
    }

    if (type === "attendance") {
      // Admin-only: computed attendance from Time Tracking + Availability + Leaves
      const userRole = session.user.role
      if (!isAdmin(userRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }

      const dateFromStr = searchParams.get("from")
      const dateToStr = searchParams.get("to")

      // Default: last 30 days
      const today = new Date()
      const dateFrom = dateFromStr ? new Date(dateFromStr) : new Date(today)
      dateFrom.setDate(dateFrom.getDate() - 30)
      if (dateFromStr) dateFrom.setHours(0, 0, 0, 0)

      const dateTo = dateToStr ? new Date(dateToStr) : new Date(today)
      dateTo.setHours(23, 59, 59, 999)

      // 1. Fetch all active non-CLIENT users
      const activeUsers = await db.user.findMany({
        where: { role: { not: "CLIENT" }, isActive: true },
        select: { id: true, name: true, email: true, role: true, avatar: true },
        orderBy: { name: "asc" },
      })

      // 2. Fetch all availability schedules for these users
      const allAvailability = await db.availability.findMany({
        where: { userId: { in: activeUsers.map(u => u.id) }, isAvailable: true },
      })

      // 3. Fetch all approved leaves (both LeaveRequest and Leave models) overlapping the date range
      const leaveRequests = await db.leaveRequest.findMany({
        where: {
          userId: { in: activeUsers.map(u => u.id) },
          status: "APPROVED",
          startDate: { lte: dateTo },
          endDate: { gte: dateFrom },
        },
      })

      const leaves = await db.leave.findMany({
        where: {
          userId: { in: activeUsers.map(u => u.id) },
          status: "APPROVED",
          startDate: { lte: dateTo },
          endDate: { gte: dateFrom },
        },
      })

      // 4. Fetch all COMPLETED time entries in the date range
      const timeEntries = await db.timeEntry.findMany({
        where: {
          userId: { in: activeUsers.map(u => u.id) },
          status: "COMPLETED",
          clockIn: { gte: dateFrom, lt: new Date(dateTo.getTime() + 86400000) },
        },
        select: { id: true, userId: true, clockIn: true, clockOut: true, totalHours: true, date: true },
      })

      // 5. Fetch existing manual attendance records
      const manualAttendance = await db.attendance.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
        },
      })

      // 6. Build lookup maps
      const availByUserDay = new Map<string, { startTime: string; endTime: string }[]>()
      for (const a of allAvailability) {
        const key = `${a.userId}-${a.dayOfWeek}`
        const existing = availByUserDay.get(key) || []
        existing.push({ startTime: a.startTime, endTime: a.endTime })
        availByUserDay.set(key, existing)
      }

      const leaveDaysByUser = new Map<string, Set<string>>()
      for (const lr of leaveRequests) {
        const key = lr.userId
        const set = leaveDaysByUser.get(key) || new Set<string>()
        const start = new Date(lr.startDate)
        const end = new Date(lr.endDate)
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          set.add(d.toISOString().split("T")[0])
        }
        leaveDaysByUser.set(key, set)
      }
      for (const l of leaves) {
        const key = l.userId
        const set = leaveDaysByUser.get(key) || new Set<string>()
        const start = new Date(l.startDate)
        const end = new Date(l.endDate)
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          set.add(d.toISOString().split("T")[0])
        }
        leaveDaysByUser.set(key, set)
      }

      // Group time entries by userId + date string
      const timeByUserDay = new Map<string, { totalHours: number; clockIn: Date | null; clockOut: Date | null; entryCount: number }>()
      for (const te of timeEntries) {
        const dayStr = new Date(te.date).toISOString().split("T")[0]
        const key = `${te.userId}-${dayStr}`
        const existing = timeByUserDay.get(key) || { totalHours: 0, clockIn: null as Date | null, clockOut: null as Date | null, entryCount: 0 }
        existing.totalHours += te.totalHours || 0
        existing.entryCount++
        // Track earliest clock-in and latest clock-out
        if (!existing.clockIn || te.clockIn < existing.clockIn) existing.clockIn = te.clockIn
        if (!existing.clockOut || (te.clockOut && te.clockOut > existing.clockOut)) existing.clockOut = te.clockOut
        timeByUserDay.set(key, existing)
      }

      // Manual attendance override map: "userId-dateStr" -> Attendance record
      const manualByUserDay = new Map<string, typeof manualAttendance[0]>()
      for (const ma of manualAttendance) {
        const dayStr = new Date(ma.date).toISOString().split("T")[0]
        manualByUserDay.set(`${ma.userId}-${dayStr}`, ma)
      }

      // Helper: calculate required hours for a user on a given day of week
      function getRequiredHours(userId: string, dayOfWeek: number): number {
        const slots = availByUserDay.get(`${userId}-${dayOfWeek}`)
        if (!slots || slots.length === 0) return 0 // No schedule = not required
        let totalMinutes = 0
        for (const slot of slots) {
          const [sh, sm] = slot.startTime.split(":").map(Number)
          const [eh, em] = slot.endTime.split(":").map(Number)
          let diff = (eh * 60 + em) - (sh * 60 + sm)
          if (diff < 0) diff += 24 * 60 // Overnight shift (e.g. 19:59 - 23:59)
          totalMinutes += diff
        }
        return totalMinutes / 60
      }

      // 7. Generate computed attendance records for each day × each user
      const records: Record<string, unknown>[] = []
      const dayMs = 86400000

      for (let d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().split("T")[0]
        const dow = d.getDay()

        for (const user of activeUsers) {
          // Check manual override first
          const manualRecord = manualByUserDay.get(`${user.id}-${dayStr}`)
          if (manualRecord) {
            records.push({
              id: manualRecord.id,
              userId: user.id,
              date: manualRecord.date.toISOString(),
              checkIn: manualRecord.checkIn?.toISOString() || null,
              checkOut: manualRecord.checkOut?.toISOString() || null,
              status: manualRecord.status,
              notes: manualRecord.notes,
              isManual: true,
              requiredHours: null,
              workedHours: null,
              user,
            })
            continue
          }

          // Skip Sundays (day 0) — no work expected
          if (dow === 0) continue

          // Check if on approved leave
          const userLeaveDays = leaveDaysByUser.get(user.id)
          if (userLeaveDays && userLeaveDays.has(dayStr)) {
            records.push({
              id: `computed-${user.id}-${dayStr}`,
              userId: user.id,
              date: d.toISOString(),
              checkIn: null,
              checkOut: null,
              status: "LEAVE",
              notes: "Auto-detected from approved leave",
              isManual: false,
              requiredHours: getRequiredHours(user.id, dow),
              workedHours: 0,
              user,
            })
            continue
          }

          // Check time tracking data
          const timeData = timeByUserDay.get(`${user.id}-${dayStr}`)
          const requiredHours = getRequiredHours(user.id, dow)
          const workedHours = timeData?.totalHours || 0

          // Determine status
          let status: string
          if (requiredHours === 0) {
            // No availability schedule for this day — skip if no time entries
            if (workedHours === 0) continue
            // Has time entries but no schedule — still mark PRESENT (they worked anyway)
            status = "PRESENT"
          } else if (workedHours >= requiredHours) {
            status = "PRESENT"
          } else if (workedHours >= requiredHours * 0.5) {
            status = "HALF_DAY"
          } else if (workedHours > 0) {
            status = "HALF_DAY"
          } else {
            status = "ABSENT"
          }

          records.push({
            id: `computed-${user.id}-${dayStr}`,
            userId: user.id,
            date: d.toISOString(),
            checkIn: timeData?.clockIn?.toISOString() || null,
            checkOut: timeData?.clockOut?.toISOString() || null,
            status,
            notes: timeData ? `${timeData.entryCount} time entry(s) logged` : "No time entries",
            isManual: false,
            requiredHours: Math.round(requiredHours * 100) / 100,
            workedHours: Math.round(workedHours * 100) / 100,
            user,
          })
        }
      }

      // Sort by date desc, then user name
      records.sort((a, b) => {
        const dateCompare = new Date(b.date as string).getTime() - new Date(a.date as string).getTime()
        if (dateCompare !== 0) return dateCompare
        return String((a.user as Record<string, unknown>)?.name).localeCompare(String((b.user as Record<string, unknown>)?.name))
      })

      // Limit to 500 records
      return NextResponse.json(records.slice(0, 500))
    }

    if (type === "leaves") {
      // Admin-only: all leave requests; developers see own only
      const userRole = session.user.role
      const userId = session.user.id
      if (!isAdmin(userRole)) {
        const leaves = await db.leaveRequest.findMany({
          where: { userId },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
        })
        return NextResponse.json(JSON.parse(JSON.stringify(leaves)))
      }
      const leaves = await db.leaveRequest.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(JSON.parse(JSON.stringify(leaves)))
    }

    if (type === "agent-access") {
      // Admin-only: all user-agent access mappings
      const userRole = session.user.role
      if (!isAdmin(userRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      const access = await db.userAgentAccess.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true, department: true } },
          agent: { select: { id: true, name: true, type: true } },
        },
        orderBy: { userId: "asc" },
      })
      return NextResponse.json(JSON.parse(JSON.stringify(access)))
    }

    // Default: return team members with their agent access (admin-only)
    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }
    const users = await db.user.findMany({
      where: { role: { not: "CLIENT" } },
      include: {
        _count: { select: { leaveRequests: true, agentAccess: true } },
        agentAccess: {
          include: {
            agent: { select: { id: true, name: true, type: true } }
          }
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(JSON.parse(JSON.stringify(users)))
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/team - Create records
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-post-' + session.user.id, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // [T3] try/catch on req.json()
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { type, ...data } = body

    if (type === "leave") {
      // SECURITY: Non-admin users can only create leave for themselves
      const sessionUserId = session.user.id
      const sessionUserRole = session.user.role
      const leaveUserId = !isAdmin(sessionUserRole) ? sessionUserId : (data.userId || sessionUserId)

      // [FIX C3: Validate start/end dates]
      if (!data.startDate || !data.endDate) {
        return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })
      }
      const parsedStart = new Date(data.startDate as string)
      const parsedEnd = new Date(data.endDate as string)
      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      if (parsedStart > parsedEnd) {
        return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
      }

      // [T9] Limit leave duration to 30 days
      const diffDays = Math.ceil((parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (diffDays > 30) {
        return NextResponse.json({ error: "Leave duration cannot exceed 30 days" }, { status: 400 })
      }

      // [FIX H7: Validate leave type against allowed values]
      const validLeaveTypes = ["CASUAL", "SICK", "PAID"]
      const leaveType = (data.leaveType as string) || "CASUAL"
      if (!validLeaveTypes.includes(leaveType)) {
        return NextResponse.json({ error: "Invalid leave type. Must be CASUAL, SICK, or PAID" }, { status: 400 })
      }

      const leave = await db.leaveRequest.create({
        data: {
          userId: leaveUserId as string,
          type: leaveType,
          startDate: parsedStart,
          endDate: parsedEnd,
          reason: (data.reason as string) || null,
          status: "PENDING",
        },
      })

      // Notify admins about new leave request (fire-and-forget — non-blocking)
      try {
        const admins = await db.user.findMany({
          where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
        })
        const user = await db.user.findUnique({ where: { id: leaveUserId as string } })
        for (const admin of admins) {
          await db.notification.create({
            data: {
              userId: admin.id,
              title: "New Leave Request",
              message: `${user?.name || "A team member"} requested ${leaveType} leave from ${parsedStart.toLocaleDateString()} to ${parsedEnd.toLocaleDateString()}`,
              type: "INFO",
              link: "/dashboard/team",
              metadata: JSON.stringify({ leaveId: leave.id }),
            }
          })
        }
      } catch (notifyErr: unknown) {
        // [T2] Fixed error: any → error: unknown
        console.error("[team] leave notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : String(notifyErr))
      }

      return NextResponse.json(leave, { status: 201 })
    }

    if (type === "attendance") {
      // SECURITY: Only admins can create attendance records
      const attendanceUserRole = session.user.role
      if (!isAdmin(attendanceUserRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // [FIX H8: Validate attendance status against allowed values]
      const validAttStatuses = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"]
      const { date, userId: attUserId, status: attStatus, checkIn, checkOut, notes } = data
      if (attStatus && !validAttStatuses.includes(attStatus as string)) {
        return NextResponse.json({ error: "Invalid attendance status. Must be PRESENT, ABSENT, HALF_DAY, or LEAVE" }, { status: 400 })
      }
      if (!date) {
        return NextResponse.json({ error: "Date is required" }, { status: 400 })
      }

      // [T10] Validate userId exists before creating attendance record
      if (attUserId) {
        const targetUser = await db.user.findUnique({ where: { id: attUserId as string } })
        if (!targetUser) {
          return NextResponse.json({ error: "User not found" }, { status: 404 })
        }
      }

      const attendance = await db.attendance.create({
        data: {
          date: new Date(date as string),
          userId: (attUserId || session.user.id) as string,
          ...(attStatus ? { status: attStatus as string } : {}),
          ...(checkIn ? { checkIn: checkIn as string } : {}),
          ...(checkOut ? { checkOut: checkOut as string } : {}),
          ...(notes ? { notes: notes as string } : {}),
        },
      })
      return NextResponse.json(attendance, { status: 201 })
    }

    if (type === "agent-access") {
      // Grant agent access to a user (admin-only)
      const currentUserRole = session.user.role
      if (!isAdmin(currentUserRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      const { userId, agentId, canChat, canView, canApprove } = data
      if (!userId || !agentId) {
        return NextResponse.json({ error: "User ID and Agent ID are required" }, { status: 400 })
      }

      // Verify agent exists
      const agentExists = await db.agent.findUnique({ where: { id: agentId as string } })
      if (!agentExists) {
        return NextResponse.json({ error: "Agent not found. Please select a valid agent." }, { status: 400 })
      }

      // Verify user exists
      const userExists = await db.user.findUnique({ where: { id: userId as string } })
      if (!userExists) {
        return NextResponse.json({ error: "User not found. Please select a valid team member." }, { status: 400 })
      }

      const access = await db.userAgentAccess.upsert({
        where: { userId_agentId: { userId: userId as string, agentId: agentId as string } },
        create: { userId: userId as string, agentId: agentId as string, canChat: (canChat as boolean) ?? true, canView: (canView as boolean) ?? true, canApprove: (canApprove as boolean) ?? false },
        update: { canChat: (canChat as boolean) ?? true, canView: (canView as boolean) ?? true, canApprove: (canApprove as boolean) ?? false },
        include: {
          user: { select: { id: true, name: true } },
          agent: { select: { id: true, name: true, type: true } },
        }
      })

      return NextResponse.json(access, { status: 201 })
    }

    if (type === "user") {
      // SUPER_ADMIN and ADMIN: Create a new team member
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }

      const { name, email, role, department, password } = data
      if (!name || !email || !password) {
        return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 })
      }

      if ((password as string).length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email as string)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }

      // [T4/T6] Validate role value
      if (role && !VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // [T5] Validate department value (allow null/empty)
      if (department && !VALID_DEPARTMENT_VALUES.includes(department as string)) {
        return NextResponse.json({ error: "Invalid department" }, { status: 400 });
      }

      // Only SUPER_ADMIN can create other SUPER_ADMIN or ADMIN users
      if ((role === "SUPER_ADMIN" || role === "ADMIN") && userRole !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Only Super Admins can create Admin or Super Admin users" }, { status: 403 });
      }

      // Check if email already exists
      const existing = await db.user.findUnique({ where: { email: email as string } })
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 })
      }

      const hashedPassword = await bcrypt.hash(password as string, 12)
      const user = await db.user.create({
        data: {
          name: name as string,
          email: email as string,
          password: hashedPassword,
          role: (role as string) || "DEVELOPER",
          department: (department as string) || null,
          isActive: true,
        }
      })

      return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role }, { status: 201 })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/team - Update records
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-patch-' + session.user.id, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // [T3] try/catch on req.json()
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { type, id, ...data } = body

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    if (type === "leave") {
      // [FIX C5: Validate leave status against allowed values]
      const validLeaveStatuses = ["PENDING", "APPROVED", "REJECTED"]
      if (data.status && !validLeaveStatuses.includes(data.status as string)) {
        return NextResponse.json({ error: "Invalid leave status. Must be PENDING, APPROVED, or REJECTED" }, { status: 400 })
      }
      // SECURITY: Only admins can approve/reject leave requests
      const leavePatchRole = session.user.role
      if (data.status && !isAdmin(leavePatchRole)) {
        return NextResponse.json({ error: "Forbidden: Only admins can approve/reject leave requests" }, { status: 403 })
      }
      // [FIX H9: Prevent admin from approving their own leave]
      if (data.status === "APPROVED" || data.status === "REJECTED") {
        const targetLeave = await db.leaveRequest.findUnique({ where: { id: id as string } })
        if (!targetLeave) {
          return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
        }
        if (targetLeave.userId === session.user.id) {
          return NextResponse.json({ error: "You cannot approve or reject your own leave request" }, { status: 403 })
        }
        // Prevent updating already-decided leaves
        if (targetLeave.status === "APPROVED" || targetLeave.status === "REJECTED") {
          return NextResponse.json({ error: `Leave request is already ${targetLeave.status.toLowerCase()}` }, { status: 400 })
        }
      }
      // [T8] Sanitize and length-limit feedback (500 chars max)
      const sanitizedFeedback = typeof data.feedback === 'string'
        ? data.feedback.trim().slice(0, 500) || undefined
        : undefined

      // SECURITY: Set approvedBy ONLY when status actually changes
      const updatePayload: Record<string, unknown> = { feedback: sanitizedFeedback }
      if (data.status && data.status !== "PENDING") {
        updatePayload.status = data.status
        updatePayload.approvedBy = session.user.id
      }
      const leave = await db.leaveRequest.update({
        where: { id: id as string },
        data: updatePayload,
      })

      // Notify the user about leave decision (fire-and-forget — non-blocking)
      try {
        await db.notification.create({
          data: {
            userId: leave.userId,
            title: `Leave ${data.status}`,
            message: `Your ${leave.type} leave request has been ${(data.status as string)?.toLowerCase()}.${sanitizedFeedback ? ` Feedback: ${sanitizedFeedback}` : ""}`,
            type: data.status === "APPROVED" ? "SUCCESS" : data.status === "REJECTED" ? "ERROR" : "INFO",
            link: "/dashboard/team",
            metadata: JSON.stringify({ leaveId: leave.id }),
          }
        })
      } catch (notifyErr: unknown) {
        // [T2] Fixed error: any → error: unknown
        console.error("[team] leave decision notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : String(notifyErr))
      }

      return NextResponse.json(leave)
    }

    if (type === "attendance") {
      // SECURITY: Only admins can update attendance records
      const attPatchRole = session.user.role
      if (!isAdmin(attPatchRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // SECURITY: Sanitize attendance update data
      const allowedAttFields = ["status", "checkIn", "checkOut", "notes"]
      const sanitizedAttData: Record<string, unknown> = {}
      for (const key of allowedAttFields) {
        if (data[key] !== undefined) sanitizedAttData[key] = data[key]
      }
      const attendanceRecord = await db.attendance.update({ where: { id: id as string }, data: sanitizedAttData })
      return NextResponse.json(attendanceRecord)
    }

    if (type === "agent-access") {
      // SECURITY: Only admins can update agent access
      const patchRole = session.user.role
      if (!isAdmin(patchRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      const access = await db.userAgentAccess.update({
        where: { id: id as string },
        data: {
          ...(data.canChat !== undefined && { canChat: data.canChat as boolean }),
          ...(data.canView !== undefined && { canView: data.canView as boolean }),
          ...(data.canApprove !== undefined && { canApprove: data.canApprove as boolean }),
        },
      })
      return NextResponse.json(access)
    }

    // Authorization: users can only update their own profile unless they're SUPER_ADMIN
    const sessionUserId = session.user.id;
    const sessionUserRole = session.user.role;

    // SECURITY: For self-profile updates (name only, no role/isActive),
    // always use the session user's ID — don't trust the body `id`.
    // This prevents IDOR where an ADMIN could modify another user's name.
    const isSelfProfileUpdate = !data.role && data.isActive === undefined && !!data.name;
    const effectiveId = isSelfProfileUpdate ? sessionUserId : (id as string);

    if (effectiveId !== sessionUserId && sessionUserRole !== "SUPER_ADMIN" && sessionUserRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: You can only update your own profile" }, { status: 403 });
    }

    // Update user (SUPER_ADMIN only for role/active changes)
    if (data.role !== undefined || data.isActive !== undefined) {
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can change user role or status" }, { status: 403 })
      }

      // Prevent changing role of SUPER_ADMIN users
      const targetUser = await db.user.findUnique({ where: { id: id as string } })
      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      if (targetUser.role === "SUPER_ADMIN" && data.role && data.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Cannot change role of SUPER_ADMIN users" }, { status: 403 })
      }
      if (targetUser.role === "SUPER_ADMIN" && data.isActive === false) {
        return NextResponse.json({ error: "Cannot deactivate SUPER_ADMIN users" }, { status: 403 })
      }
    }

    // [T4/T6] Validate role value on update
    if (data.role && !VALID_ROLES.includes(data.role as typeof VALID_ROLES[number])) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // [T5] Validate department value on update (allow null/empty)
    if (data.department && !VALID_DEPARTMENT_VALUES.includes(data.department as string)) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {}
    if (data.name) {
      // Validate name: trim, length limit, no control characters
      const trimmedName = (data.name as string).trim()
      if (trimmedName.length < 1 || trimmedName.length > 100) {
        return NextResponse.json({ error: "Name must be between 1 and 100 characters" }, { status: 400 })
      }
      if (/[\x00-\x1f\x7f]/.test(trimmedName)) {
        return NextResponse.json({ error: "Name cannot contain control characters" }, { status: 400 })
      }
      updateData.name = trimmedName
    }
    if (data.department) updateData.department = data.department
    if (data.role) updateData.role = data.role
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    // Password updates NOT allowed here — use /api/password-change or /api/password-reset

    const user = await db.user.update({
      where: { id: effectiveId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, department: true, isActive: true },
    })
    return NextResponse.json(user)
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] PATCH error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/team - Remove agent access
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-del-' + session.user.id, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    if (type === "agent-access") {
      // SECURITY: Only admins can delete agent access
      const deleteRole = session.user.role
      if (!isAdmin(deleteRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      await db.userAgentAccess.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    if (type === "attendance") {
      // SECURITY: Only admins can delete attendance records
      const deleteAttRole = session.user.role
      if (!isAdmin(deleteAttRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // Verify record exists before deleting
      const record = await db.attendance.findUnique({ where: { id } })
      if (!record) {
        return NextResponse.json({ error: "Attendance record not found" }, { status: 404 })
      }
      await db.attendance.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
