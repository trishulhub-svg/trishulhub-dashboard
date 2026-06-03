import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"

export async function GET() {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  const userId = session.user.id

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
    return NextResponse.json(JSON.parse(JSON.stringify(sanitized)))
  }

  return NextResponse.json(JSON.parse(JSON.stringify(tickets)))
  } catch (error: unknown) {
    console.error("[support] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let data: Record<string, unknown>
  try { data = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const userRole = session.user.role
  const userId = session.user.id

  // Fix #10: Derive clientId from authenticated user if not provided
  let clientId = data.clientId as string | undefined
  if (!clientId || clientId === "portal") {
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) {
      return NextResponse.json({ error: "No client profile found for this user. Contact admin." }, { status: 400 })
    }
    clientId = client.id
  } else {
    // SECURITY: Validate that the developer has access to this client
    if (!isAdmin(userRole)) {
      const assignedClientIds = await getAssignedClientIds(userId, userRole)
      if (assignedClientIds && !assignedClientIds.includes(clientId)) {
        return NextResponse.json({ error: "You do not have access to this client" }, { status: 403 })
      }
    }
  }

  // SECURITY: Sanitize ticket data — only allow specific fields (prevent mass assignment)
  const subject = data.subject
  const description = data.description
  const priority = data.priority

  // Validate priority against whitelist
  const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"]
  const safePriority = validPriorities.includes(String(priority)) ? String(priority) : "MEDIUM"

  const ticket = await db.supportTicket.create({
    data: {
      clientId,
      subject: subject ? String(subject) : "New Support Ticket",
      description: description ? String(description) : "",
      priority: safePriority,
      status: "OPEN",
    },
  })
  return NextResponse.json(ticket)
  } catch (error: unknown) {
    console.error("[support] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Only admins can update ticket details
  const userRole = session.user.role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const id = String(body.id || "")
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k !== 'id') rest[k] = v
  }

  // SECURITY: Whitelist allowed fields to prevent mass assignment
  const allowedFields = ["subject", "description", "priority", "status", "assignedTo", "resolution"]
  const sanitizedData: Parameters<typeof db.supportTicket.update>[0]["data"] = {}
  for (const key of allowedFields) {
    if (rest[key] !== undefined) sanitizedData[key] = rest[key]
  }

  const ticket = await db.supportTicket.update({ where: { id }, data: sanitizedData })
  return NextResponse.json(ticket)
  } catch (error: unknown) {
    console.error("[support] PUT error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  const sessionUserId = session.user.id

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const id = String(body.id || "")
  const message = body.message as string | undefined
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k !== 'id' && k !== 'message') rest[k] = v
  }

  // CLIENT/DEVELOPER users can only add messages to their own tickets
  if (!isAdmin(userRole)) {
    // For CLIENT users, find their client profile to check ownership
    const clientProfile = await db.client.findFirst({ where: { userId: sessionUserId } })
    if (!clientProfile) {
      return NextResponse.json({ error: "No client profile found" }, { status: 403 })
    }
    const ticket = await db.supportTicket.findUnique({ where: { id } })
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    if (ticket.clientId !== clientProfile.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    // Only allow adding a message, not changing status
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }
    // Create a new TicketMessage record (messages is a relation, not a JSON column)
    await db.ticketMessage.create({
      data: {
        ticketId: id,
        senderId: sessionUserId,
        senderType: "HUMAN",
        message,
      },
    })
    // Return the updated ticket with all messages
    const updated = await db.supportTicket.findUnique({
      where: { id },
      include: { client: true, messages: true },
    })
    return NextResponse.json(updated)
  }

  // FIX #9: Check ticket exists before admin update
  const existingTicket = await db.supportTicket.findUnique({ where: { id } })
  if (!existingTicket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  // SECURITY: Whitelist allowed fields to prevent mass assignment
  const allowedFields = ["subject", "description", "priority", "status", "assignedTo", "resolution"]
  const sanitizedData: Parameters<typeof db.supportTicket.update>[0]["data"] = {}
  for (const key of allowedFields) {
    if (rest[key] !== undefined) sanitizedData[key] = rest[key]
  }

  const ticket = await db.supportTicket.update({ where: { id }, data: sanitizedData })
  return NextResponse.json(ticket)
  } catch (error: unknown) {
    console.error("[support] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
