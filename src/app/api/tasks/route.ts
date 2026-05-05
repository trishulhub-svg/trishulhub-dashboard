import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds } from "@/lib/rbac"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = session.user.role
  const userId = session.user.id
  
  // Developers only see tasks from their assigned projects
  const assignedProjectIds = await getAssignedProjectIds(userId, userRole)
  const taskWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
  
  const tasks = await db.task.findMany({ 
    where: taskWhere,
    include: { project: true }, 
    orderBy: { createdAt: "desc" } 
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = session.user.role
  const userId = session.user.id
  const body = await req.json()

  // projectId is required by schema
  if (!body.projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
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

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data = {
    title: body.title as string,
    description: (body.description as string | null) || null,
    status: (body.status as string) || "TODO",
    priority: (body.priority as string) || "MEDIUM",
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
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = session.user.role
  const userId = session.user.id
  const body = await req.json()
  const id = body.id

  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 })

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Parameters<typeof db.task.update>[0]["data"] = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.status !== undefined) data.status = body.status
  if (body.priority !== undefined) data.priority = body.priority
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo
  if (body.assigneeType !== undefined) data.assigneeType = body.assigneeType
  if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null

  // Only admins can change projectId on a task (prevents developers from moving tasks between projects)
  if (body.projectId !== undefined) {
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Only admins can move tasks between projects" }, { status: 403 })
    }
    data.projectId = body.projectId
  }

  // Developers can only update tasks in projects they're assigned to
  if (!isAdmin(userRole)) {
    const existingTask = await db.task.findUnique({ where: { id } })
    if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    
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

  // Also check if only assignedTo is being changed (with existing deadline)
  if (assignedUserId && !taskDeadline) {
    const existingTask = await db.task.findUnique({ where: { id } })
    if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    if (existingTask?.deadline) {
      const assigneeLeave = await db.leave.findFirst({
        where: {
          userId: assignedUserId,
          status: "APPROVED",
          startDate: { lte: existingTask.deadline },
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
  }

  // Ensure task exists before updating (admins skip the earlier findUnique)
  if (isAdmin(userRole)) {
    const existingTask = await db.task.findUnique({ where: { id } })
    if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  const task = await db.task.update({ where: { id }, data })
  return NextResponse.json(task)
}
