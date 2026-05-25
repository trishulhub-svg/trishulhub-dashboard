import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const VALID_TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL", "DONE"]
const VALID_TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]

// ── Helper: send notification to a user ──
async function sendNotification(userId: string, title: string, message: string, type: string, link: string | null) {
  try {
    await db.notification.create({
      data: { userId, title, message, type, link, isRead: false }
    })
  } catch (err) {
    console.error("[tasks] Failed to send notification:", err)
  }
}

export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`tasks-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const userRole = session.user.role
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId")

  // Developers only see tasks from their assigned projects
  const assignedProjectIds = await getAssignedProjectIds(userId, userRole)

  // Build where clause
  const where: Record<string, unknown> = {}
  if (assignedProjectIds) {
    where.projectId = { in: assignedProjectIds }
  }
  if (projectId) {
    where.projectId = assignedProjectIds
      ? { in: [...(assignedProjectIds as string[])].filter(id => id === projectId) }
      : projectId
    // If projectId filter + assignedProjectIds, ensure we only get tasks for this project if user has access
    if (assignedProjectIds && !(assignedProjectIds as string[]).includes(projectId)) {
      return NextResponse.json([])
    }
    where.projectId = projectId
  }

  const tasks = await db.task.findMany({
    where,
    orderBy: { createdAt: "desc" }
  })

  // Resolve userIds to names for assignee and approver
  const userIds = new Set<string>()
  for (const t of tasks) {
    if (t.assignedTo) userIds.add(t.assignedTo)
    if (t.approvedBy) userIds.add(t.approvedBy)
  }
  let userMap: Record<string, string> = {}
  if (userIds.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true }
    })
    for (const u of users) userMap[u.id] = u.name
  }

  const enriched = tasks.map(t => ({
    ...JSON.parse(JSON.stringify(t)),
    assignedToName: t.assignedTo ? (userMap[t.assignedTo] || null) : null,
    approvedByName: t.approvedBy ? (userMap[t.approvedBy] || null) : null,
  }))
  return NextResponse.json(enriched)
  } catch (error: any) {
    console.error("[tasks] GET error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`tasks-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const userRole = session.user.role
  const userId = session.user.id
  const body = await req.json()

  // projectId is required by schema
  if (!body.projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
  }

  // Title is required
  if (!body.title) {
    return NextResponse.json({ error: "Task title is required" }, { status: 400 })
  }

  // Developers can only create tasks in projects they're assigned to
  if (!isAdmin(userRole)) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: body.projectId }
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: You can only create tasks in your assigned projects" }, { status: 403 })
    }
  }

  // Validate status
  const taskStatus = body.status || "TODO"
  if (!VALID_TASK_STATUSES.includes(taskStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(", ")}` }, { status: 400 })
  }

  // Validate priority
  const taskPriority = body.priority || "MEDIUM"
  if (!VALID_TASK_PRIORITIES.includes(taskPriority)) {
    return NextResponse.json({ error: `Invalid priority. Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}` }, { status: 400 })
  }

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data = {
    title: body.title as string,
    description: (body.description as string | null) || null,
    status: taskStatus,
    priority: taskPriority,
    projectId: body.projectId as string,
    assignedTo: (body.assignedTo as string | null) || null,
    assigneeType: (body.assigneeType as string) || "HUMAN",
    deadline: body.deadline ? new Date(body.deadline as string) : null,
  }

  // Check if assignee is on approved leave during the task period
  if (data.assignedTo && data.deadline) {
    const assigneeLeave = await db.leave.findFirst({
      where: {
        userId: data.assignedTo,
        status: "APPROVED",
        startDate: { lte: data.deadline },
        endDate: { gte: new Date() },
      },
      include: {
        user: { select: { name: true } },
      },
    })
    if (assigneeLeave) {
      return NextResponse.json({
        error: `Cannot assign task: ${assigneeLeave.user.name} is on ${assigneeLeave.leaveType.replace("_", " ").toLowerCase()} leave from ${new Date(assigneeLeave.startDate).toLocaleDateString()} to ${new Date(assigneeLeave.endDate).toLocaleDateString()}`,
      }, { status: 400 })
    }
  }

  const task = await db.task.create({ data })
  return NextResponse.json(JSON.parse(JSON.stringify(task)), { status: 201 })
  } catch (error: any) {
    console.error("[tasks] POST error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`tasks-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const userRole = session.user.role
  const userId = session.user.id
  const userName = session.user.name || "User"
  const body = await req.json()
  const id = body.id

  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 })

  // Fetch existing task early — needed for approval logic
  const existingTask = await db.task.findUnique({ where: { id } })
  if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Parameters<typeof db.task.update>[0]["data"] = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.priority !== undefined) {
    if (!VALID_TASK_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: `Invalid priority. Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}` }, { status: 400 })
    }
    data.priority = body.priority
  }
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo
  if (body.assigneeType !== undefined) data.assigneeType = body.assigneeType
  if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // APPROVAL FLOW — status change logic
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (body.status !== undefined) {
    if (!VALID_TASK_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(", ")}` }, { status: 400 })
    }

    const newStatus = body.status as string
    const currentStatus = existingTask.status

    // ── CASE 1: User is trying to mark task as DONE ──
    if (newStatus === "DONE") {
      // If task is already AWAITING_APPROVAL, this is an approval action
      if (currentStatus === "AWAITING_APPROVAL") {
        // Only admin/superadmin can approve
        if (!isAdmin(userRole)) {
          return NextResponse.json({ error: "Forbidden: Only admin or superadmin can approve tasks" }, { status: 403 })
        }

        // Self-approval prevention: ADMIN cannot approve tasks assigned to themselves
        if (userRole === "ADMIN" && existingTask.assignedTo === userId) {
          return NextResponse.json({ error: "Forbidden: You cannot approve your own task. Only superadmin can approve your tasks." }, { status: 403 })
        }

        // APPROVE — set status, approvedBy, approvedAt, completedAt
        data.status = "DONE"
        data.approvedBy = userId
        data.approvedAt = new Date()
        data.completedAt = new Date()

      } else {
        // Task is NOT currently AWAITING_APPROVAL — user wants to "complete" it
        // SUPERADMIN can directly mark as DONE (no approval needed for their own actions)
        if (userRole === "SUPER_ADMIN") {
          data.status = "DONE"
          data.approvedBy = userId
          data.approvedAt = new Date()
          data.completedAt = new Date()
        } else {
          // All other users (DEVELOPER, ADMIN) → goes to AWAITING_APPROVAL
          data.status = "AWAITING_APPROVAL"
        }
      }
    } else {
      // Regular status change (not DONE)
      data.status = newStatus
    }
  }

  // Only admins can change projectId on a task
  if (body.projectId !== undefined) {
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Only admins can move tasks between projects" }, { status: 403 })
    }
    data.projectId = body.projectId
  }

  // Developers can only update tasks in projects they're assigned to
  if (!isAdmin(userRole)) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: existingTask.projectId }
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: You can only update tasks in your assigned projects" }, { status: 403 })
    }
  }

  // Check if assignee is on approved leave during the task period
  const assignedUserId = typeof data.assignedTo === "string" ? data.assignedTo : null
  const taskDeadline = data.deadline instanceof Date ? data.deadline : null

  if (assignedUserId && taskDeadline) {
    const assigneeLeave = await db.leave.findFirst({
      where: {
        userId: assignedUserId,
        status: "APPROVED",
        startDate: { lte: taskDeadline },
        endDate: { gte: new Date() },
      },
      include: { user: { select: { name: true } } },
    })
    if (assigneeLeave) {
      return NextResponse.json({
        error: `Cannot assign task: ${assigneeLeave.user.name} is on ${assigneeLeave.leaveType.replace("_", " ").toLowerCase()} leave from ${new Date(assigneeLeave.startDate).toLocaleDateString()} to ${new Date(assigneeLeave.endDate).toLocaleDateString()}`,
      }, { status: 400 })
    }
  }

  // Also check if only assignedTo is being changed (with existing deadline)
  if (assignedUserId && !taskDeadline && existingTask?.deadline) {
    const assigneeLeave = await db.leave.findFirst({
      where: {
        userId: assignedUserId,
        status: "APPROVED",
        startDate: { lte: existingTask.deadline },
        endDate: { gte: new Date() },
      },
      include: { user: { select: { name: true } } },
    })
    if (assigneeLeave) {
      return NextResponse.json({
        error: `Cannot assign task: ${assigneeLeave.user.name} is on ${assigneeLeave.leaveType.replace("_", " ").toLowerCase()} leave from ${new Date(assigneeLeave.startDate).toLocaleDateString()} to ${new Date(assigneeLeave.endDate).toLocaleDateString()}`,
      }, { status: 400 })
    }
  }

  // Update the task
  const updatedTask = await db.task.update({ where: { id }, data })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTIFICATIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const finalStatus = data.status as string | undefined

  // Task sent for approval → notify all admin/superadmin
  if (finalStatus === "AWAITING_APPROVAL") {
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true }
    })
    const taskLink = `/dashboard/projects/${existingTask.projectId}`
    const assigneeName = existingTask.assignedTo ? (await db.user.findUnique({ where: { id: existingTask.assignedTo }, select: { name: true } }))?.name || "Someone" : "Someone"

    for (const admin of admins) {
      await sendNotification(
        admin.id,
        "Task Pending Approval",
        `${assigneeName} submitted "${existingTask.title}" for your review.`,
        "APPROVAL",
        taskLink
      )
    }
  }

  // Task approved → notify the assignee
  if (finalStatus === "DONE" && data.approvedBy && existingTask.assignedTo && existingTask.assignedTo !== userId) {
    const taskLink = `/dashboard/projects/${existingTask.projectId}`
    await sendNotification(
      existingTask.assignedTo,
      "Task Approved",
      `Your task "${existingTask.title}" has been approved by ${userName}.`,
      "SUCCESS",
      taskLink
    )
  }

  // Task rejected (sent back) → notify the assignee
  if (finalStatus && finalStatus !== "AWAITING_APPROVAL" && finalStatus !== "DONE" && existingTask.status === "AWAITING_APPROVAL") {
    if (existingTask.assignedTo) {
      const taskLink = `/dashboard/projects/${existingTask.projectId}`
      await sendNotification(
        existingTask.assignedTo,
        "Task Revision Needed",
        `Your task "${existingTask.title}" was sent back by ${userName}. Status: ${finalStatus.replace("_", " ")}.`,
        "WARNING",
        taskLink
      )
    }
  }

  return NextResponse.json(JSON.parse(JSON.stringify(updatedTask)))
  } catch (error: any) {
    console.error("[tasks] PATCH error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`tasks-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const userRole = session.user.role
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 })

  // Verify task exists
  const existingTask = await db.task.findUnique({ where: { id } })
  if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  // Developers can only delete tasks in their assigned projects
  if (!isAdmin(userRole)) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: existingTask.projectId }
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: You can only delete tasks in your assigned projects" }, { status: 403 })
    }
  }

  await db.task.delete({ where: { id } })
  return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[tasks] DELETE error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
