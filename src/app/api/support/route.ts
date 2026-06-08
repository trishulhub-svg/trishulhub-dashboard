import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { createSupportTicketSchema, updateSupportTicketSchema, validateRequest } from "@/lib/validations"

// ━━ Shared constants ━━
const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]

// GET /api/support - List support tickets with pagination
export async function GET(req: NextRequest) {
  try {
    // Issue #21: ensureAllTables()
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Issue #22: rate limiting on GET
    const rl = rateLimit(`support-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
    }

    const userRole = session.user.role
    const userId = session.user.id

    // Developers only see tickets from their assigned projects' clients
    const assignedClientIds = await getAssignedClientIds(userId, userRole)
    const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

    // Issue #28: pagination on GET
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
    const offset = (page - 1) * limit

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where: ticketWhere,
        include: { client: true, messages: true },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      db.supportTicket.count({ where: ticketWhere }),
    ])

    // SECURITY: For developers, limit client details to prevent data leakage
    if (!isAdmin(userRole)) {
      const sanitized = tickets.map(t => ({
        ...t,
        client: { id: t.client.id, name: t.client.name, company: t.client.company },
      }))
      // Issue #27: deepSanitize on GET response
      return NextResponse.json(deepSanitize({
        data: sanitized,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }))
    }

    // Issue #27: deepSanitize on GET response
    return NextResponse.json(deepSanitize({
      data: tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }))
  } catch (error: unknown) {
    console.error("[support] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/support - Create support ticket
export async function POST(req: NextRequest) {
  try {
    // Issue #21: ensureAllTables()
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Issue #22: rate limiting on POST
    const rl = rateLimit(`support-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
    }

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

    // Issue #23: Zod validation on POST — validate subject, description, priority
    const validation = validateRequest(createSupportTicketSchema, {
      subject: data.subject,
      description: data.description,
      priority: data.priority,
    })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Issue #29: subject/description length caps (defense-in-depth beyond Zod)
    const subject = String(data.subject || "New Support Ticket").slice(0, 300)
    const description = String(data.description || "").slice(0, 10000)

    // Validate priority against whitelist
    const safePriority = VALID_PRIORITIES.includes(String(data.priority)) ? String(data.priority) : "MEDIUM"

    const ticket = await db.supportTicket.create({
      data: {
        clientId,
        subject,
        description,
        priority: safePriority,
        status: "OPEN",
      },
    })

    // Issue #27: deepSanitize on POST response
    return NextResponse.json(deepSanitize(ticket))
  } catch (error: unknown) {
    console.error("[support] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PUT /api/support - Update ticket details (admin only)
export async function PUT(req: NextRequest) {
  try {
    // Issue #21: ensureAllTables()
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Only admins can update ticket details
    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    // Issue #22: rate limiting on PUT
    const rl = rateLimit(`support-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
    }

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const id = String(body.id || "")

    // Issue #24: Zod validation on PUT
    const validation = validateRequest(updateSupportTicketSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const rest: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k !== 'id') rest[k] = v
    }

    // SECURITY: Whitelist allowed fields to prevent mass assignment
    const allowedFields = ["subject", "description", "priority", "status", "assignedTo", "resolution"]
    const sanitizedData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (rest[key] !== undefined) sanitizedData[key] = rest[key]
    }

    // Issue #25: status and priority validation on PUT
    if (sanitizedData.status && !VALID_STATUSES.includes(sanitizedData.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    if (sanitizedData.priority && !VALID_PRIORITIES.includes(sanitizedData.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 })
    }

    try {
      const ticket = await db.supportTicket.update({ where: { id }, data: sanitizedData })
      // Issue #27: deepSanitize on PUT response
      return NextResponse.json(deepSanitize(ticket))
    } catch (error: unknown) {
      console.error("[support] PUT DB error:", error instanceof Error ? error.message : error)
      // Issue #26: P2025 error handling
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "An error occurred" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[support] PUT error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/support - Add message or update ticket (role-dependent)
export async function PATCH(req: NextRequest) {
  try {
    // Issue #21: ensureAllTables()
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Issue #22: rate limiting on PATCH
    const rl = rateLimit(`support-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
    }

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
      // Issue #27: deepSanitize on PATCH response
      return NextResponse.json(deepSanitize(updated))
    }

    // FIX #9: Check ticket exists before admin update
    const existingTicket = await db.supportTicket.findUnique({ where: { id } })
    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    // Issue #24: Zod validation on PATCH (for admin updates)
    const validation = validateRequest(updateSupportTicketSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // SECURITY: Whitelist allowed fields to prevent mass assignment
    const allowedFields = ["subject", "description", "priority", "status", "assignedTo", "resolution"]
    const sanitizedData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (rest[key] !== undefined) sanitizedData[key] = rest[key]
    }

    // Issue #25: status and priority validation on PATCH
    if (sanitizedData.status && !VALID_STATUSES.includes(sanitizedData.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    if (sanitizedData.priority && !VALID_PRIORITIES.includes(sanitizedData.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 })
    }

    try {
      const ticket = await db.supportTicket.update({ where: { id }, data: sanitizedData })
      // Issue #27: deepSanitize on PATCH response
      return NextResponse.json(deepSanitize(ticket))
    } catch (error: unknown) {
      console.error("[support] PATCH DB error:", error instanceof Error ? error.message : error)
      // Issue #26: P2025 error handling
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "An error occurred" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[support] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
