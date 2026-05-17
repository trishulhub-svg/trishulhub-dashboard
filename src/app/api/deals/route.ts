import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createDealSchema, validateRequest } from "@/lib/validations"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// ━━ Shared constants ━━
const VALID_STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] as const
const VALID_CURRENCIES = ["USD", "GBP", "INR"] as const

// GET /api/deals - List deals with pagination, search, filter, sort
export async function GET(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-deals-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const stage = searchParams.get("stage") || ""
    const clientId = searchParams.get("clientId") || ""
    const leadId = searchParams.get("leadId") || ""
    const sortBy = searchParams.get("sortBy") || "createdAt"
    const sortOrder = searchParams.get("sortOrder") || "desc"

    // Pagination params
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
    const offset = (page - 1) * limit

    // Validate sort params
    const validSortBy = ["title", "createdAt", "value", "expectedCloseDate"]
    const validSortOrder = ["asc", "desc"]
    if (sortBy && !validSortBy.includes(sortBy)) {
      return NextResponse.json({ error: `Invalid sortBy. Must be one of: ${validSortBy.join(", ")}` }, { status: 400 })
    }
    if (sortOrder && !validSortOrder.includes(sortOrder)) {
      return NextResponse.json({ error: "Invalid sortOrder. Must be asc or desc" }, { status: 400 })
    }

    // Build where clause
    const where: Record<string, unknown> = {}
    if (stage) where.stage = stage
    if (clientId) where.clientId = clientId
    if (leadId) where.leadId = leadId
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const orderBy: Record<string, string> = sortBy === "value"
      ? { value: sortOrder === "asc" ? "asc" : "desc" }
      : sortBy === "title"
        ? { title: sortOrder === "asc" ? "asc" : "desc" }
        : sortBy === "expectedCloseDate"
          ? { expectedCloseDate: sortOrder === "asc" ? "asc" : "desc" }
          : { createdAt: sortOrder === "asc" ? "asc" : "desc" }

    try {
      const [deals, total] = await Promise.all([
        db.deal.findMany({
          where,
          include: {
            client: { select: { id: true, name: true } },
            lead: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy,
          skip: offset,
          take: limit,
        }),
        db.deal.count({ where }),
      ])

      return NextResponse.json(JSON.parse(JSON.stringify({
        data: deals,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      })))
    } catch (error: unknown) {
      console.error("Error fetching deals:", error)
      return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[deals] GET unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/deals - Create deal (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-deals-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = validateRequest(createDealSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const data = validation.data

    // Defense-in-depth: validate stage
    if (data.stage !== undefined && !VALID_STAGES.includes(data.stage)) {
      return NextResponse.json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` }, { status: 400 })
    }

    // Defense-in-depth: validate currency
    if (data.currency !== undefined && !VALID_CURRENCIES.includes(data.currency)) {
      return NextResponse.json({ error: `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(", ")}` }, { status: 400 })
    }

    // Defense-in-depth: validate probability range
    if (data.probability !== undefined) {
      const prob = Number(data.probability)
      if (isNaN(prob) || prob < 0 || prob > 100) {
        return NextResponse.json({ error: "Probability must be between 0 and 100" }, { status: 400 })
      }
    }

    // Verify clientId exists if provided
    if (data.clientId) {
      const client = await db.client.findUnique({ where: { id: data.clientId } })
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }
    }

    // Verify leadId exists if provided
    if (data.leadId) {
      const lead = await db.lead.findUnique({ where: { id: data.leadId } })
      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 })
      }
    }

    // Verify assignedToId exists if provided
    if (data.assignedToId) {
      const user = await db.user.findUnique({ where: { id: data.assignedToId } })
      if (!user) {
        return NextResponse.json({ error: "Assigned user not found" }, { status: 404 })
      }
    }

    try {
      const deal = await db.deal.create({
        data: {
          title: data.title,
          value: data.value ?? 0,
          currency: data.currency || "USD",
          stage: data.stage || "LEAD",
          probability: data.probability ?? 0,
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
          clientId: data.clientId || null,
          leadId: data.leadId || null,
          assignedToId: data.assignedToId || null,
          notes: data.notes || null,
        },
        include: {
          client: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      })
      return NextResponse.json(deal, { status: 201 })
    } catch (error: unknown) {
      console.error("Error creating deal:", error)
      return NextResponse.json({ error: "Failed to create deal" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[deals] POST unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
