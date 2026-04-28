import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// GET /api/team - List team data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    if (type === "attendance") {
      const records = await db.attendance.findMany({
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { date: "desc" },
        take: 60,
      })
      return NextResponse.json(records)
    }

    if (type === "leaves") {
      const leaves = await db.leaveRequest.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(leaves)
    }

    if (type === "agent-access") {
      // Get user-agent access mappings
      const access = await db.userAgentAccess.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true, department: true } },
          agent: { select: { id: true, name: true, type: true } },
        },
        orderBy: { userId: "asc" },
      })
      return NextResponse.json(access)
    }

    // Default: return team members with their agent access
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
    return NextResponse.json({ error: error.message || "Failed to fetch team data" }, { status: 500 })
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
      const leave = await db.leaveRequest.create({
        data: {
          userId: data.userId,
          type: data.leaveType || "CASUAL",
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          reason: data.reason || null,
          status: "PENDING",
        },
      })

      // Notify admins about new leave request
      const admins = await db.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      })
      const user = await db.user.findUnique({ where: { id: data.userId } })
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

      return NextResponse.json(leave, { status: 201 })
    }

    if (type === "attendance") {
      const attendance = await db.attendance.create({
        data: { date: new Date(data.date), ...data },
      })
      return NextResponse.json(attendance, { status: 201 })
    }

    if (type === "agent-access") {
      // Grant agent access to a user
      const { userId, agentId, canChat, canView, canApprove } = data
      if (!userId || !agentId) {
        return NextResponse.json({ error: "User ID and Agent ID are required" }, { status: 400 })
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
      // Create a new team member
      const { name, email, role, department, password } = data
      if (!name || !email || !password) {
        return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 })
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
    return NextResponse.json({ error: error.message || "Failed to create record" }, { status: 500 })
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
      const leave = await db.leaveRequest.update({
        where: { id },
        data: {
          status: data.status,
          approvedBy: data.approvedBy || undefined,
          feedback: data.feedback || undefined,
        },
      })

      // Notify the user about leave decision
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

      return NextResponse.json(leave)
    }

    if (type === "attendance") {
      const attendance = await db.attendance.update({ where: { id }, data })
      return NextResponse.json(attendance)
    }

    if (type === "agent-access") {
      // Update agent access for a user
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

    // Update user
    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.department) updateData.department = data.department
    if (data.role) updateData.role = data.role
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 12)
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, department: true, isActive: true },
    })
    return NextResponse.json(user)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update record" }, { status: 500 })
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
      await db.userAgentAccess.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 })
  }
}
