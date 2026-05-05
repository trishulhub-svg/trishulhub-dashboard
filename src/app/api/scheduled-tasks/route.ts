import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"

// GET /api/scheduled-tasks - List tasks for user or agent
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")
    const status = searchParams.get("status")
    const all = searchParams.get("all") === "true"

    const where: any = {}
    if (agentId) where.agentId = agentId
    if (status) where.status = status
    // If agentId is specified, show all tasks for that agent (so team can see who scheduled what)
    // If no agentId, only show current user's tasks (unless admin viewing all)
    if (!agentId && (!all || userRole !== "SUPER_ADMIN")) where.userId = userId

    const tasks = await db.scheduledTask.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    })

    return NextResponse.json(tasks)
  } catch (error: any) {
    console.error("[scheduled-tasks] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/scheduled-tasks - Create a new scheduled task
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { agentId, title, description, dueDate, priority, notifyAt, attachments, crossAgentAccess } = await req.json()

    if (!agentId || !title || !dueDate) {
      return NextResponse.json({ error: "Agent ID, title, and due date are required" }, { status: 400 })
    }

    // SECURITY: Non-admin users must have canChat access to the target agent
    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      const agentAccess = await db.userAgentAccess.findFirst({
        where: { userId, agentId, canChat: true },
      })
      if (!agentAccess) {
        return NextResponse.json({ error: "Forbidden: You do not have access to this agent" }, { status: 403 })
      }
    }

    const task = await db.scheduledTask.create({
      data: {
        agentId,
        userId,
        title,
        description: description || null,
        dueDate: new Date(dueDate),
        priority: priority || "MEDIUM",
        notifyAt: notifyAt ? new Date(notifyAt) : null,
        attachments: JSON.stringify(attachments || []),
        crossAgentAccess: JSON.stringify(crossAgentAccess || []),
        status: "PENDING",
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      }
    })

    // Create notification
    await db.notification.create({
      data: {
        userId,
        title: "New Task Scheduled",
        message: `"${title}" assigned to ${task.agent.name}, due ${new Date(dueDate).toLocaleDateString()}`,
        type: "TASK",
        link: `/dashboard/agents/${agentId}`,
        metadata: JSON.stringify({ taskId: task.id, agentId }),
      }
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error: any) {
    console.error("[scheduled-tasks] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/scheduled-tasks - Update a task
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { id, title, description, dueDate, priority, status, progress, result } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
    }

    const existingTask = await db.scheduledTask.findUnique({ where: { id } })
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Only the task owner or admin can update
    if (existingTask.userId !== userId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const data: any = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (dueDate !== undefined) data.dueDate = new Date(dueDate)
    if (priority !== undefined) {
      const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"]
      if (!validPriorities.includes(priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 })
      }
      data.priority = priority
    }
    if (status !== undefined) {
      const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      }
      data.status = status
      if (status === "COMPLETED") data.completedAt = new Date()
    }
    if (progress !== undefined) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return NextResponse.json({ error: "Progress must be between 0 and 100" }, { status: 400 })
      }
      data.progress = progress
    }
    if (result !== undefined) data.result = result

    const task = await db.scheduledTask.update({
      where: { id },
      data,
      include: {
        agent: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      }
    })

    // Notify user if task completed (always notify, whether by owner, admin, or cron)
    if (status === "COMPLETED") {
      try {
        await db.notification.create({
          data: {
            userId: task.userId,
            title: "Task Completed",
            message: `"${task.title}" has been marked as completed${task.userId !== userId ? ` by ${task.agent?.name || "another user"}` : ""}. Check the results in your scheduled tasks.`,
            type: "SUCCESS",
            link: `/dashboard/agents/${task.agentId}`,
            metadata: JSON.stringify({ taskId: task.id }),
          }
        })
      } catch (notifErr) {
        console.error("[scheduled-tasks] Failed to send completion notification:", notifErr)
      }
    }

    return NextResponse.json(task)
  } catch (error: any) {
    console.error("[scheduled-tasks] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/scheduled-tasks - Delete a task
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
    }

    const task = await db.scheduledTask.findUnique({ where: { id } })
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    if (task.userId !== userId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await db.scheduledTask.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[scheduled-tasks] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
