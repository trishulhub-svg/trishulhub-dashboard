/**
 * GET/POST/PATCH /api/support/team
 * Staff raise tickets (issue area + description). Admin/SA review & resolve + SMTP.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  TEAM_ISSUE_AREAS,
  buildTicketNumber,
  notifyTicketRaised,
  notifyTicketResolved,
} from "@/lib/support-mail"
import { z } from "zod"

const createSchema = z.object({
  issueArea: z.enum(TEAM_ISSUE_AREAS as unknown as [string, ...string[]]),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
})

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  resolution: z.string().trim().max(5000).optional().nullable(),
  reply: z.string().trim().min(1).max(5000).optional(),
})

async function nextTicketNumber(): Promise<string> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const count = await db.teamSupportTicket.count({
    where: { createdAt: { gte: start } },
  })
  return buildTicketNumber(count + 1)
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureCriticalSchema()
    const mine = new URL(req.url).searchParams.get("mine") === "1"
    const id = new URL(req.url).searchParams.get("id")
    const canManage = isAdminOrProjectManager(session.user.role)

    if (id) {
      const ticket = await db.teamSupportTicket.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
      if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (!canManage && ticket.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      return NextResponse.json(ticket)
    }

    const where = canManage && !mine ? {} : { userId: session.user.id }
    const tickets = await db.teamSupportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        messages: { take: 3, orderBy: { createdAt: "desc" } },
      },
    })
    return NextResponse.json({
      tickets,
      issueAreas: TEAM_ISSUE_AREAS,
      canManage,
    })
  } catch (e) {
    console.error("[support/team GET]", e)
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = rateLimit(
      `support-team-post-${session.user.id}`,
      RATE_LIMITS.crmWrite.limit,
      RATE_LIMITS.crmWrite.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureCriticalSchema()
    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const ticketNumber = await nextTicketNumber()
    const ticket = await db.teamSupportTicket.create({
      data: {
        ticketNumber,
        userId: session.user.id,
        issueArea: parsed.data.issueArea,
        subject: parsed.data.subject,
        description: parsed.data.description,
        priority: parsed.data.priority || "MEDIUM",
        status: "OPEN",
      },
    })

    void notifyTicketRaised({
      to: session.user.email || "",
      ticketNumber,
      subject: parsed.data.subject,
      issueArea: parsed.data.issueArea,
      triggeredBy: session.user.id,
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "SYSTEM",
      page: "support",
      action: "CREATE",
      entityType: "TeamSupportTicket",
      entityId: ticket.id,
      description: `Raised support ticket ${ticketNumber} (${parsed.data.issueArea})`,
      newValue: JSON.stringify({
        ticketNumber,
        issueArea: parsed.data.issueArea,
        subject: parsed.data.subject,
      }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (e) {
    console.error("[support/team POST]", e)
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureCriticalSchema()
    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const existing = await db.teamSupportTicket.findUnique({
      where: { id: parsed.data.id },
      include: { user: { select: { id: true, email: true, name: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (parsed.data.reply) {
      await db.teamSupportMessage.create({
        data: {
          ticketId: existing.id,
          senderId: session.user.id,
          senderType: "STAFF",
          message: parsed.data.reply,
        },
      })
    }

    const data: {
      status?: string
      resolution?: string | null
      assignedTo?: string
    } = {}
    if (parsed.data.status) data.status = parsed.data.status
    if (parsed.data.resolution !== undefined) data.resolution = parsed.data.resolution
    data.assignedTo = session.user.id

    await db.teamSupportTicket.update({
      where: { id: existing.id },
      data,
    })

    if (parsed.data.status === "RESOLVED" && existing.status !== "RESOLVED") {
      void notifyTicketResolved({
        to: existing.user.email || "",
        ticketNumber: existing.ticketNumber,
        subject: existing.subject,
        resolution: parsed.data.resolution || existing.resolution,
        triggeredBy: session.user.id,
      })
    }

    const full = await db.teamSupportTicket.findUnique({
      where: { id: existing.id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "SYSTEM",
      page: "support",
      action: "STATUS_CHANGE",
      entityType: "TeamSupportTicket",
      entityId: existing.id,
      description: `Updated team support ticket ${existing.ticketNumber}`,
      oldValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({
        status: full?.status,
        resolution: full?.resolution,
      }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json(full)
  } catch (e) {
    console.error("[support/team PATCH]", e)
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 })
  }
}
