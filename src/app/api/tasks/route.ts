import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, isSuperAdmin, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { syncTasksToGit } from "@/lib/git-sync"

const VALID_TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL", "DONE"]
const VALID_TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]
const VALID_TASK_CATEGORIES = ["GENERAL", "MEETING", "FOLLOW_UP", "UPGRADE", "CUSTOMER", "INTERNAL"]

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
  const assignedToFilter = searchParams.get("assignedTo")
  const createdByFilter = searchParams.get("createdBy")
  const standaloneFilter = searchParams.get("standalone")
  const categoryFilter = searchParams.get("category")

  // SUPER_ADMIN sees all tasks; others have RBAC restrictions
  if (isSuperAdmin(userRole)) {
    // Build where clause with all filters — no RBAC restriction
    const where: { projectId?: string | null | { in: string[] }; assignedTo?: string; createdBy?: string; category?: string } = {}

    if (projectId) {
      where.projectId = projectId
    } else if (standaloneFilter === "true") {
      where.projectId = null
    }

    if (assignedToFilter && assignedToFilter !== "current") {
      where.assignedTo = assignedToFilter
    } else if (assignedToFilter === "current") {
      where.assignedTo = userId
    }

    if (createdByFilter === "current") {
      where.createdBy = userId
    } else if (createdByFilter) {
      where.createdBy = createdByFilter
    }

    if (categoryFilter) {
      where.category = categoryFilter
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: { createdAt: "desc" }
    })

    // Resolve userIds to names for assignee, approver, and creator
    const userIds = new Set<string>()
    for (const t of tasks) {
      if (t.assignedTo) userIds.add(t.assignedTo)
      if (t.approvedBy) userIds.add(t.approvedBy)
      if (t.createdBy) userIds.add(t.createdBy)
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
      createdByName: t.createdBy ? (userMap[t.createdBy] || null) : null,
    }))
    return NextResponse.json(enriched)
  }

  // ── Non-admin users: RBAC-filtered view ──
  const assignedProjectIds = await getAssignedProjectIds(userId, userRole)

  // Build where clause
  const where: { projectId?: string | null | { in: string[] }; assignedTo?: string; createdBy?: string; category?: string } = {}

  // If a specific projectId is requested, verify access and restrict to it
  if (projectId) {
    if (assignedProjectIds && !(assignedProjectIds as string[]).includes(projectId)) {
      return NextResponse.json([])
    }
    where.projectId = projectId
  } else if (standaloneFilter === "true") {
    // Standalone tasks — no project filter, but RBAC still applies
    where.projectId = null
  } else if (assignedProjectIds) {
    where.projectId = { in: assignedProjectIds }
  }

  // assignedTo filter
  if (assignedToFilter && assignedToFilter !== "current") {
    where.assignedTo = assignedToFilter
  } else if (assignedToFilter === "current") {
    where.assignedTo = userId
  }

  // createdBy filter
  if (createdByFilter === "current") {
    where.createdBy = userId
  } else if (createdByFilter) {
    where.createdBy = createdByFilter
  }

  // category filter
  if (categoryFilter) {
    where.category = categoryFilter
  }

  const tasks = await db.task.findMany({
    where,
    orderBy: { createdAt: "desc" }
  })

  // For non-admin: filter tasks they can see:
  // assignedTo = userId OR createdBy = userId OR they are a ProjectMember of the task's project
  const projectMemberProjectIds = assignedProjectIds || []

  const visibleTasks = tasks.filter(t => {
    // Always visible if assigned to the user
    if (t.assignedTo === userId) return true
    // Always visible if created by the user
    if (t.createdBy === userId) return true
    // Visible if user is a project member of the task's project
    if (t.projectId && projectMemberProjectIds.includes(t.projectId)) return true
    return false
  })

  // Resolve userIds to names for assignee, approver, and creator
  const userIds = new Set<string>()
  for (const t of visibleTasks) {
    if (t.assignedTo) userIds.add(t.assignedTo)
    if (t.approvedBy) userIds.add(t.approvedBy)
    if (t.createdBy) userIds.add(t.createdBy)
  }
  let userMap: Record<string, string> = {}
  if (userIds.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true }
    })
    for (const u of users) userMap[u.id] = u.name
  }

  const enriched = visibleTasks.map(t => ({
    ...JSON.parse(JSON.stringify(t)),
    assignedToName: t.assignedTo ? (userMap[t.assignedTo] || null) : null,
    approvedByName: t.approvedBy ? (userMap[t.approvedBy] || null) : null,
    createdByName: t.createdBy ? (userMap[t.createdBy] || null) : null,
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
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROLE RESTRICTION: Only SUPER_ADMIN and ADMIN can create tasks
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Only admin and superadmin can create tasks" }, { status: 403 })
  }

  // Title is required
  if (!body.title) {
    return NextResponse.json({ error: "Task title is required" }, { status: 400 })
  }

  // ROLE RESTRICTION: Only SUPER_ADMIN and ADMIN can assign tasks to others
  // If assignedTo is provided and is NOT the creator, verify role
  if (body.assignedTo && String(body.assignedTo) !== userId) {
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Only admin and superadmin can assign tasks to others" }, { status: 403 })
    }
    // Verify the assignee exists and is an active user
    const assigneeExists = await db.user.findFirst({
      where: { id: String(body.assignedTo), isActive: true }
    })
    if (!assigneeExists) {
      return NextResponse.json({ error: "Assigned user not found or inactive" }, { status: 400 })
    }
  }

  // projectId is optional now — standalone tasks are allowed
  // But if projectId IS provided, check project membership for non-admins
  if (body.projectId) {
    if (!isSuperAdmin(userRole)) {
      const membership = await db.projectMember.findFirst({
        where: { userId, projectId: String(body.projectId) }
      })
      if (!membership) {
        return NextResponse.json({ error: "Forbidden: You can only create tasks in your assigned projects" }, { status: 403 })
      }
    }
  }

  // Validate status
  const taskStatus = body.status ? String(body.status) : "TODO"
  if (!VALID_TASK_STATUSES.includes(taskStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(", ")}` }, { status: 400 })
  }

  // Validate priority
  const taskPriority = body.priority ? String(body.priority) : "MEDIUM"
  if (!VALID_TASK_PRIORITIES.includes(taskPriority)) {
    return NextResponse.json({ error: `Invalid priority. Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}` }, { status: 400 })
  }

  // Validate category
  const taskCategory = body.category ? String(body.category) : "GENERAL"
  if (!VALID_TASK_CATEGORIES.includes(taskCategory)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_TASK_CATEGORIES.join(", ")}` }, { status: 400 })
  }

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Parameters<typeof db.task.create>[0]["data"] = {
    title: String(body.title),
    description: body.description ? String(body.description) : null,
    status: taskStatus,
    priority: taskPriority,
    category: taskCategory,
    createdBy: userId,
    projectId: body.projectId ? String(body.projectId) : null,
    assignedTo: body.assignedTo ? String(body.assignedTo) : null,
    assigneeType: body.assigneeType ? String(body.assigneeType) : "HUMAN",
    deadline: body.deadline ? new Date(String(body.deadline)) : null,
  }

  // Check if assignee is on approved leave during the task period
  if (data.assignedTo && data.deadline) {
    const assigneeLeave = await db.leave.findFirst({
      where: {
        userId: data.assignedTo as string,
        status: "APPROVED",
        startDate: { lte: data.deadline as Date },
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

  // Send notification to assignee when a task is created with an assignee
  if (data.assignedTo && (data.assignedTo as string) !== userId) {
    const deadlineStr = data.deadline ? ` (Due: ${new Date(data.deadline as Date).toLocaleDateString()})` : ""
    await sendNotification(
      data.assignedTo as string,
      "New Task Assigned",
      `You have been assigned a new task: ${String(body.title)}${deadlineStr}`,
      "TASK",
      "/dashboard/projects/todos"
    )
  }

  // Background: sync tasks to Git (fire-and-forget) — only when projectId exists
  if (data.projectId) {
    syncTasksToGit().catch(() => {})
  }
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
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const id = body.id ? String(body.id) : ""

  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 })

  // Fetch existing task early — needed for approval logic
  const existingTask = await db.task.findUnique({ where: { id } })
  if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Parameters<typeof db.task.update>[0]["data"] = {}
  if (body.title !== undefined) data.title = String(body.title)
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null
  if (body.priority !== undefined) {
    if (!VALID_TASK_PRIORITIES.includes(String(body.priority))) {
      return NextResponse.json({ error: `Invalid priority. Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}` }, { status: 400 })
    }
    data.priority = String(body.priority)
  }
  if (body.assignedTo !== undefined) {
    // ROLE RESTRICTION: Only SUPER_ADMIN and ADMIN can reassign tasks
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Only admin and superadmin can reassign tasks" }, { status: 403 })
    }
    const newAssignee = body.assignedTo ? String(body.assignedTo) : null
    // If assigning to a specific user, verify they exist and are active
    if (newAssignee && newAssignee !== existingTask.assignedTo) {
      const assigneeExists = await db.user.findFirst({
        where: { id: newAssignee, isActive: true }
      })
      if (!assigneeExists) {
        return NextResponse.json({ error: "Assigned user not found or inactive" }, { status: 400 })
      }
    }
    data.assignedTo = newAssignee
  }
  if (body.assigneeType !== undefined) data.assigneeType = String(body.assigneeType)
  if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(String(body.deadline)) : null
  if (body.category !== undefined) {
    if (!VALID_TASK_CATEGORIES.includes(String(body.category))) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_TASK_CATEGORIES.join(", ")}` }, { status: 400 })
    }
    data.category = String(body.category)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // APPROVAL FLOW — status change logic
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (body.status !== undefined) {
    if (!VALID_TASK_STATUSES.includes(String(body.status))) {
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
    data.projectId = String(body.projectId)
  }

  // Developers can only update tasks in their assigned projects (only applies to project tasks)
  if (!isAdmin(userRole) && existingTask.projectId) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: existingTask.projectId }
    })
    if (!membership) {
      // Also check if the user is the creator of the task (standalone or not)
      if (existingTask.createdBy !== userId && existingTask.assignedTo !== userId) {
        return NextResponse.json({ error: "Forbidden: You can only update tasks in your assigned projects or tasks assigned/created by you" }, { status: 403 })
      }
    }
  }

  // For non-admin updating a standalone task: must be creator or assignee
  if (!isAdmin(userRole) && !existingTask.projectId) {
    if (existingTask.createdBy !== userId && existingTask.assignedTo !== userId) {
      return NextResponse.json({ error: "Forbidden: You can only update tasks assigned or created by you" }, { status: 403 })
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

  // Reassignment notification — when assignedTo changed to a different user
  if (assignedUserId && existingTask.assignedTo !== assignedUserId) {
    await sendNotification(
      assignedUserId,
      "Task Reassigned to You",
      `Task "${existingTask.title}" has been reassigned to you`,
      "TASK",
      "/dashboard/projects/todos"
    )
  }

  const finalStatus = data.status as string | undefined

  // Task sent for approval → notify all admin/superadmin
  if (finalStatus === "AWAITING_APPROVAL") {
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true }
    })
    const taskLink = `/dashboard/projects/todos`
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
    const taskLink = `/dashboard/projects/todos`
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
      const taskLink = `/dashboard/projects/todos`
      await sendNotification(
        existingTask.assignedTo,
        "Task Revision Needed",
        `Your task "${existingTask.title}" was sent back by ${userName}. Status: ${finalStatus.replace("_", " ")}.`,
        "WARNING",
        taskLink
      )
    }
  }

  // Background: sync tasks to Git (fire-and-forget) — only when task has a project
  if (updatedTask.projectId) {
    syncTasksToGit().catch(() => {})
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

  // Developers can only delete tasks in their assigned projects, or standalone tasks they created/are assigned to
  if (!isAdmin(userRole)) {
    if (existingTask.projectId) {
      // Project task — check membership
      const membership = await db.projectMember.findFirst({
        where: { userId, projectId: existingTask.projectId }
      })
      if (!membership && existingTask.createdBy !== userId && existingTask.assignedTo !== userId) {
        return NextResponse.json({ error: "Forbidden: You can only delete tasks in your assigned projects or tasks assigned/created by you" }, { status: 403 })
      }
    } else {
      // Standalone task — must be creator or assignee
      if (existingTask.createdBy !== userId && existingTask.assignedTo !== userId) {
        return NextResponse.json({ error: "Forbidden: You can only delete tasks assigned or created by you" }, { status: 403 })
      }
    }
  }

  await db.task.delete({ where: { id } })
  // Background: sync tasks to Git (fire-and-forget) — only when task had a project
  if (existingTask.projectId) {
    syncTasksToGit().catch(() => {})
  }
  return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[tasks] DELETE error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
