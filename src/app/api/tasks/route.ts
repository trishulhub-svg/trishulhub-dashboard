import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds } from "@/lib/rbac"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = (session.user as any).role
  const userId = (session.user as any).id
  
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
  
  const userRole = (session.user as any).role
  const userId = (session.user as any).id
  const body = await req.json()

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Record<string, any> = {
    title: body.title,
    description: body.description || null,
    status: body.status || "TODO",
    priority: body.priority || "MEDIUM",
    projectId: body.projectId || null,
    assigneeId: body.assigneeId || null,
    deadline: body.deadline ? new Date(body.deadline) : null,
  }

  // Developers can only create tasks in projects they're assigned to
  if (!isAdmin(userRole) && data.projectId) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: data.projectId }
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: You can only create tasks in your assigned projects" }, { status: 403 })
    }
  }

  // Developers must provide a project they have access to
  if (!isAdmin(userRole) && !data.projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
  }
  
  const task = await db.task.create({ data })
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = (session.user as any).role
  const userId = (session.user as any).id
  const body = await req.json()
  const id = body.id

  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 })

  // SECURITY: Whitelist allowed fields only (prevent mass assignment)
  const data: Record<string, any> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.status !== undefined) data.status = body.status
  if (body.priority !== undefined) data.priority = body.priority
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId
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
  
  const task = await db.task.update({ where: { id }, data })
  return NextResponse.json(task)
}
