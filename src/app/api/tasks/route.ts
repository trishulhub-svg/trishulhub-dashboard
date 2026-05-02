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
  const data = await req.json()
  
  // Developers can only create tasks in projects they're assigned to
  if (!isAdmin(userRole) && data.projectId) {
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: data.projectId }
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: You can only create tasks in your assigned projects" }, { status: 403 })
    }
  }
  
  const task = await db.task.create({ data })
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = (session.user as any).role
  const userId = (session.user as any).id
  const { id, ...data } = await req.json()
  
  // Developers can only update tasks in projects they're assigned to
  if (!isAdmin(userRole)) {
    const task = await db.task.findUnique({ where: { id } })
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    
    const membership = await db.projectMember.findFirst({
      where: { userId, projectId: task.projectId }
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: You can only update tasks in your assigned projects" }, { status: 403 })
    }
  }
  
  const task = await db.task.update({ where: { id }, data })
  return NextResponse.json(task)
}
