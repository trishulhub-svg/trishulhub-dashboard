import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdmin, isSuperAdmin, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { syncTasksToGit } from "@/lib/git-sync"

const VALID_TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL", "DONE"]
const VALID_TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]
const VALID_TASK_CATEGORIES = ["GENERAL", "MEETING", "FOLLOW_UP", "UPGRADE", "CUSTOMER", "INTERNAL"]

// ── Helper: serialize Task dates for JSON response ──
function serializeTask(t: any) {
  return {
    ...t,
    createdAt: t.createdAt?.toISOString(),
    updatedAt: t.updatedAt?.toISOString(),
    deadline: t.deadline?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    approvedAt: t.approvedAt?.toISOString() ?? null,
  }
}

// ── Helper: check if assignee is on approved leave during task period ──
async function checkAssigneeLeave(db: any, userId: string, deadline: Date): Promise<{ name: string; leaveType: string; startDate: Date; endDate: Date } | null> {
  const leave = await db.leave.findFirst({
    where: { userId, status: "APPROVED", startDate: { lte: deadline }, endDate: { gte: new Date() } },
    include: { user: { select: { name: true } } },
  })
  if (!leave) return null
  return { name: leave.user.name, leaveType: leave.leaveType, startDate: leave.startDate, endDate: leave.endDate }
}

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
  // Auto-migrate: ensure all tables/columns exist before querying
  await ensureAllTables()

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
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)))

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

    const [tasks, total] = await Promise.all([
      db.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      db.task.count({ where }),
    ])

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
      ...serializeTask(t),
      assignedToName: t.assignedTo ? (userMap[t.assignedTo] || null) : null,
      approvedByName: t.approvedBy ? (userMap[t.approvedBy] || null) : null,
      createdByName: t.createdBy ? (userMap[t.createdBy] || null) : null,
    }))
    return NextResponse.json({ tasks: enriched, total, page, totalPages: Math.ceil(total / limit) })
  }

  // ── Non-admin users: RBAC-filtered view ──
  const assignedProjectIds = await getAssignedProjectIds(userId, userRole)

  // Build where clause
  const where: { projectId?: string | null | { in: string[] }; assignedTo?: string; createdBy?: string; category?: string } = {}

  // If a specific projectId is requested, verify access and restrict to it
  if (projectId) {
    if (assignedProjectIds && !(assignedProjectIds as string[]).includes(projectId)) {
      return NextResponse.json({ tasks: [], total: 0, page: 1, totalPages: 0 })
    }
    where.projectId = projectId
  } else if (standaloneFilter === "true") {
    // Standalone tasks — no project filter, but RBAC still applies
    where.projectId = null
  } else if (assignedProjectIds) {
    where.projectId = { in: assignedProjectIds }
  }

  // assignedTo filter — non-admin: only allow "current"
  if (assignedToFilter === "current") {
    where.assignedTo = userId
  }
  // else: ignore any other value for non-admin

  // createdBy filter — non-admin: only allow "current"
  if (createdByFilter === "current") {
    where.createdBy = userId
  }
  // else: ignore any other value for non-admin

  // category filter
  if (categoryFilter) {
    where.category = categoryFilter
  }

  const [tasks, total] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    db.task.count({ where }),
  ])

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
    ...serializeTask(t),
    assignedToName: t.assignedTo ? (userMap[t.assignedTo] || null) : null,
    approvedByName: t.approvedBy ? (userMap[t.approvedBy] || null) : null,
    createdByName: t.createdBy ? (userMap[t.createdBy] || null) : null,
  }))
  return NextResponse.json({ tasks: enriched, total, page, totalPages: Math.ceil(total / limit) })
  } catch (error: any) {
    console.error("[tasks] GET error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
  await ensureAllTables()

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
  const data: Prisma.TaskUncheckedCreateInput = {
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
    const assigneeLeave = await checkAssigneeLeave(db, data.assignedTo as string, data.deadline as Date)
    if (assigneeLeave) {
      return NextResponse.json({
        error: `Cannot assign task: ${assigneeLeave.name} is on ${assigneeLeave.leaveType.replace("_", " ").toLowerCase()} leave from ${new Date(assigneeLeave.startDate).toLocaleDateString()} to ${new Date(assigneeLeave.endDate).toLocaleDateString()}`,
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
  await ensureAllTables()

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUTHORIZATION: verify user can edit this task BEFORE processing fields
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!isAdmin(userRole) && existingTask.projectId) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: existingTask.projectId }
    })
    if (!membership) {
      if (existingTask.createdBy !== userId && existingTask.assignedTo !== userId) {
        return NextResponse.json({ error: "Forbidden: You can only update tasks in your assigned projects or tasks assigned/created by you" }, { status: 403 })
      }
    }
  }
  if (!isAdmin(userRole) && !existingTask.projectId) {
    if (existingTask.createdBy !== userId && existingTask.assignedTo !== userId) {
      return NextResponse.json({ error: "Forbidden: You can only update tasks assigned or created by you" }, { status: 403 })
    }
  }

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Prisma.TaskUncheckedUpdateInput = {}
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
  if (body.assigneeType !== undefined) {
    if (!["HUMAN", "AI"].includes(String(body.assigneeType))) {
      return NextResponse.json({ error: "Invalid assigneeType. Must be HUMAN or AI" }, { status: 400 })
    }
    data.assigneeType = String(body.assigneeType)
  }
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

  // Check if data object is empty — nothing to update
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  // Check if assignee is on approved leave during the task period
  const assignedUserId = typeof data.assignedTo === "string" ? data.assignedTo : null
  const effectiveDeadline = data.deadline instanceof Date ? data.deadline : (existingTask?.deadline || null)

  if (assignedUserId && effectiveDeadline) {
    const assigneeLeave = await checkAssigneeLeave(db, assignedUserId, effectiveDeadline)
    if (assigneeLeave) {
      return NextResponse.json({
        error: `Cannot assign task: ${assigneeLeave.name} is on ${assigneeLeave.leaveType.replace("_", " ").toLowerCase()} leave from ${new Date(assigneeLeave.startDate).toLocaleDateString()} to ${new Date(assigneeLeave.endDate).toLocaleDateString()}`,
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

  // Task sent for approval → notify all admin/superadmin (batch createMany)
  if (finalStatus === "AWAITING_APPROVAL") {
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true }
    })
    const assigneeName = existingTask.assignedTo ? (await db.user.findUnique({ where: { id: existingTask.assignedTo }, select: { name: true } }))?.name || "Someone" : "Someone"

    if (admins.length > 0) {
      await db.notification.createMany({
        data: admins.map(admin => ({
          userId: admin.id,
          title: `Task approval needed: ${existingTask.title}`,
          message: `${assigneeName} submitted "${existingTask.title}" for review`,
          type: "TASK",
          link: `/dashboard/todos`,
          isRead: false,
        }))
      })
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
  return NextResponse.json(serializeTask(updatedTask))
  } catch (error: any) {
    console.error("[tasks] PATCH error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
  await ensureAllTables()

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
