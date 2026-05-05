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
  
  // CLIENT users can only see their own projects
  if (userRole === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) return NextResponse.json([])
    const projects = await db.project.findMany({ 
      where: { clientId: client.id },
      include: { client: true, tasks: true }, 
      orderBy: { createdAt: "desc" } 
    })
    return NextResponse.json(projects)
  }
  
  // DEVELOPER users only see projects they're assigned to
  const assignedProjectIds = await getAssignedProjectIds(userId, userRole)
  const projectWhere = assignedProjectIds ? { id: { in: assignedProjectIds } } : {}
  
  // For developers: don't expose budget info
  const includeBudget = isAdmin(userRole)
  
  const projects = await db.project.findMany({ 
    where: projectWhere,
    include: { client: true, tasks: true, members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } }, 
    orderBy: { createdAt: "desc" } 
  })
  
  // For developers: hide budget and client financial details
  if (!includeBudget) {
    const filtered = projects.map(({ budget, client, ...rest }) => ({
      ...rest,
      budget: undefined,
      client: { id: client.id, name: client.name, company: client.company },
    }))
    return NextResponse.json(filtered)
  }
  
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  // Only admins can create projects
  const userRole = session.user.role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }
  
  const data = await req.json()
  
  // SECURITY: Sanitize project creation data (whitelist allowed fields)
  const { name, description, status, clientId, budget, deadline } = data
  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 })
  }
  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required" }, { status: 400 })
  }
  const project = await db.project.create({
    data: {
      name,
      description: description || null,
      status: status || "PLANNING",
      clientId,
      budget: budget || null,
      deadline: deadline ? new Date(deadline) : null,
    },
  })
  return NextResponse.json(project)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  // Only admins can update projects
  const userRole = session.user.role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }
  
  const { id, ...data } = await req.json()
  
  // SECURITY: Sanitize project update data (whitelist allowed fields)
  const allowedFields = ["name", "description", "status", "clientId", "budget", "deadline", "progress"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === "deadline") {
        sanitizedData[key] = data[key] ? new Date(data[key]) : null
      } else {
        sanitizedData[key] = data[key]
      }
    }
  }
  
  const project = await db.project.update({ where: { id }, data: sanitizedData })
  return NextResponse.json(project)
}
