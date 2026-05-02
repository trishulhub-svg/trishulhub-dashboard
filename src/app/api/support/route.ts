import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = (session.user as any).role
  const userId = (session.user as any).id
  
  // Developers only see tickets from their assigned projects' clients
  const assignedClientIds = await getAssignedClientIds(userId, userRole)
  const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
  
  const tickets = await db.supportTicket.findMany({ 
    where: ticketWhere,
    include: { client: true, messages: true }, 
    orderBy: { createdAt: "desc" } 
  })
  
  // SECURITY: For developers, limit client details to prevent data leakage
  if (!isAdmin(userRole)) {
    const sanitized = tickets.map(t => ({
      ...t,
      client: { id: t.client.id, name: t.client.name, company: t.client.company },
    }))
    return NextResponse.json(sanitized)
  }
  
  return NextResponse.json(tickets)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await req.json()
  const userRole = (session.user as any).role
  const userId = (session.user as any).id
  
  // Fix #10: Derive clientId from authenticated user if not provided
  let clientId = data.clientId
  if (!clientId || clientId === "portal") {
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) {
      return NextResponse.json({ error: "No client profile found for this user. Contact admin." }, { status: 400 })
    }
    clientId = client.id
  } else {
    // SECURITY: Validate that the developer has access to this client
    if (!isAdmin(userRole)) {
      const { getAssignedClientIds } = await import("@/lib/rbac")
      const assignedClientIds = await getAssignedClientIds(userId, userRole)
      if (assignedClientIds && !assignedClientIds.includes(clientId)) {
        return NextResponse.json({ error: "You do not have access to this client" }, { status: 403 })
      }
    }
  }
  
  // SECURITY: Sanitize ticket data — only allow specific fields (prevent mass assignment)
  const { subject, description, priority } = data
  const ticket = await db.supportTicket.create({
    data: {
      clientId,
      subject: subject || "New Support Ticket",
      description: description || "",
      priority: priority || "MEDIUM",
      status: "OPEN",
    },
  })
  return NextResponse.json(ticket)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  // Only admins can update ticket details
  const userRole = (session.user as any).role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }
  
  const { id, ...data } = await req.json()
  
  // SECURITY: Whitelist allowed fields to prevent mass assignment
  const allowedFields = ["subject", "description", "priority", "status", "assignedTo", "resolution"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) sanitizedData[key] = data[key]
  }
  
  const ticket = await db.supportTicket.update({ where: { id }, data: sanitizedData })
  return NextResponse.json(ticket)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  // Only admins can update ticket details
  const userRole = (session.user as any).role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }
  
  const { id, ...data } = await req.json()
  
  // SECURITY: Whitelist allowed fields to prevent mass assignment
  const allowedFields = ["subject", "description", "priority", "status", "assignedTo", "resolution"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) sanitizedData[key] = data[key]
  }
  
  const ticket = await db.supportTicket.update({ where: { id }, data: sanitizedData })
  return NextResponse.json(ticket)
}
