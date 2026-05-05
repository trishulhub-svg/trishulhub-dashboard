import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { isAdmin } from "@/lib/rbac"

// GET /api/team - List team data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
          createdAt: true,
        },
        orderBy: { name: "asc" },
      })
      return NextResponse.json(users)
    }

    if (type === "attendance") {
      // Admin-only: full attendance records
      const userRole = session.user.role
      if (!isAdmin(userRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      const records = await db.attendance.findMany({
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { date: "desc" },
        take: 60,
      })
      return NextResponse.json(records)
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
        return NextResponse.json(leaves)
      }
      const leaves = await db.leaveRequest.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(leaves)
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
      return NextResponse.json(access)
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
    return NextResponse.json(users)
  } catch (error: any) {
    console.error("[team] GET error:", error.message)
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

    const body = await req.json()
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
      const parsedStart = new Date(data.startDate)
      const parsedEnd = new Date(data.endDate)
      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      if (parsedStart > parsedEnd) {
        return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
      }

      // [FIX H7: Validate leave type against allowed values]
      const validLeaveTypes = ["CASUAL", "SICK", "PAID"]
      const leaveType = data.leaveType || "CASUAL"
      if (!validLeaveTypes.includes(leaveType)) {
        return NextResponse.json({ error: "Invalid leave type. Must be CASUAL, SICK, or PAID" }, { status: 400 })
      }

      const leave = await db.leaveRequest.create({
        data: {
          userId: leaveUserId,
          type: leaveType,
          startDate: parsedStart,
          endDate: parsedEnd,
          reason: data.reason || null,
          status: "PENDING",
        },
      })

      // Notify admins about new leave request (fire-and-forget — non-blocking)
      try {
        const admins = await db.user.findMany({
          where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
        })
        const user = await db.user.findUnique({ where: { id: leaveUserId } })
        for (const admin of admins) {
          await db.notification.create({
            data: {
              userId: admin.id,
              title: "New Leave Request",
              message: `${user?.name || "A team member"} requested ${data.leaveType || "casual"} leave from ${new Date(data.startDate).toLocaleDateString()} to ${new Date(data.endDate).toLocaleDateString()}`,
              type: "INFO",
              link: "/dashboard/team",
              metadata: JSON.stringify({ leaveId: leave.id }),
            }
          })
        }
      } catch (notifyErr: any) {
        console.error("[team] leave notification error (non-blocking):", notifyErr?.message)
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
      if (attStatus && !validAttStatuses.includes(attStatus)) {
        return NextResponse.json({ error: "Invalid attendance status. Must be PRESENT, ABSENT, HALF_DAY, or LEAVE" }, { status: 400 })
      }
      if (!date) {
        return NextResponse.json({ error: "Date is required" }, { status: 400 })
      }
      const attendance = await db.attendance.create({
        data: {
          date: new Date(date),
          userId: attUserId || session.user.id,
          ...(attStatus && { status: attStatus }),
          ...(checkIn && { checkIn }),
          ...(checkOut && { checkOut }),
          ...(notes && { notes }),
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
      const agentExists = await db.agent.findUnique({ where: { id: agentId } })
      if (!agentExists) {
        return NextResponse.json({ error: "Agent not found. Please select a valid agent." }, { status: 400 })
      }

      // Verify user exists
      const userExists = await db.user.findUnique({ where: { id: userId } })
      if (!userExists) {
        return NextResponse.json({ error: "User not found. Please select a valid team member." }, { status: 400 })
      }

      const access = await db.userAgentAccess.upsert({
        where: { userId_agentId: { userId, agentId } },
        create: { userId, agentId, canChat: canChat ?? true, canView: canView ?? true, canApprove: canApprove ?? false },
        update: { canChat: canChat ?? true, canView: canView ?? true, canApprove: canApprove ?? false },
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

      if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }

      // Only SUPER_ADMIN can create other SUPER_ADMIN or ADMIN users
      if ((role === "SUPER_ADMIN" || role === "ADMIN") && userRole !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Only Super Admins can create Admin or Super Admin users" }, { status: 403 });
      }

      // Check if email already exists
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 })
      }

      const hashedPassword = await bcrypt.hash(password, 12)
      const user = await db.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || "DEVELOPER",
          department: department || null,
          isActive: true,
        }
      })

      return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role }, { status: 201 })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: any) {
    console.error("[team] POST error:", error.message)
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

    const body = await req.json()
    const { type, id, ...data } = body

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    if (type === "leave") {
      // [FIX C5: Validate leave status against allowed values]
      const validLeaveStatuses = ["PENDING", "APPROVED", "REJECTED"]
      if (data.status && !validLeaveStatuses.includes(data.status)) {
        return NextResponse.json({ error: "Invalid leave status. Must be PENDING, APPROVED, or REJECTED" }, { status: 400 })
      }
      // SECURITY: Only admins can approve/reject leave requests
      const leavePatchRole = session.user.role
      if (data.status && !isAdmin(leavePatchRole)) {
        return NextResponse.json({ error: "Forbidden: Only admins can approve/reject leave requests" }, { status: 403 })
      }
      // [FIX H9: Prevent admin from approving their own leave]
      if (data.status === "APPROVED" || data.status === "REJECTED") {
        const targetLeave = await db.leaveRequest.findUnique({ where: { id } })
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
      // SECURITY: Set approvedBy from session user, not request body
      const leave = await db.leaveRequest.update({
        where: { id },
        data: {
          status: data.status,
          approvedBy: session.user.id,
          feedback: data.feedback || undefined,
        },
      })

      // Notify the user about leave decision (fire-and-forget — non-blocking)
      try {
        await db.notification.create({
          data: {
            userId: leave.userId,
            title: `Leave ${data.status}`,
            message: `Your ${leave.type} leave request has been ${data.status.toLowerCase()}.${data.feedback ? ` Feedback: ${data.feedback}` : ""}`,
            type: data.status === "APPROVED" ? "SUCCESS" : data.status === "REJECTED" ? "ERROR" : "INFO",
            link: "/dashboard/team",
            metadata: JSON.stringify({ leaveId: leave.id }),
          }
        })
      } catch (notifyErr: any) {
        console.error("[team] leave decision notification error (non-blocking):", notifyErr?.message)
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
      const sanitizedAttData: Record<string, any> = {}
      for (const key of allowedAttFields) {
        if (data[key] !== undefined) sanitizedAttData[key] = data[key]
      }
      const attendance = await db.attendance.update({ where: { id }, data: sanitizedAttData })
      return NextResponse.json(attendance)
    }

    if (type === "agent-access") {
      // SECURITY: Only admins can update agent access
      const patchRole = session.user.role
      if (!isAdmin(patchRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      const access = await db.userAgentAccess.update({
        where: { id },
        data: {
          ...(data.canChat !== undefined && { canChat: data.canChat }),
          ...(data.canView !== undefined && { canView: data.canView }),
          ...(data.canApprove !== undefined && { canApprove: data.canApprove }),
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
    const effectiveId = isSelfProfileUpdate ? sessionUserId : id;

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
      const targetUser = await db.user.findUnique({ where: { id } })
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

    const updateData: any = {}
    if (data.name) {
      // Validate name: trim, length limit, no control characters
      const trimmedName = data.name.trim()
      if (trimmedName.length < 1 || trimmedName.length > 100) {
        return NextResponse.json({ error: "Name must be between 1 and 100 characters" }, { status: 400 })
      }
      if (/[ -]/.test(trimmedName)) {
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
  } catch (error: any) {
    console.error("[team] PATCH error:", error.message)
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

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: any) {
    console.error("[team] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
