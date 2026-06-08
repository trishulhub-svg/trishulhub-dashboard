import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { createDealSchema, validateRequest } from "@/lib/validations"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"

// Helper: serialize Date objects in deal data to ISO strings for JSON responses
interface DealWithDates {
  expectedCloseDate?: string | Date | null
  actualCloseDate?: string | Date | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  [key: string]: unknown
}
function serializeDealDates(d: DealWithDates) {
  if (!d) return d
  if (d.expectedCloseDate instanceof Date) d.expectedCloseDate = d.expectedCloseDate.toISOString()
  if (d.actualCloseDate instanceof Date) d.actualCloseDate = d.actualCloseDate.toISOString()
  if (d.createdAt instanceof Date) d.createdAt = d.createdAt.toISOString()
  if (d.updatedAt instanceof Date) d.updatedAt = d.updatedAt.toISOString()
  return d
}

// ━━ Shared constants ━━
const VALID_STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] as const
const VALID_CURRENCIES = ["USD", "GBP", "INR"] as const

// GET /api/deals - List deals with pagination, search, filter, sort
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureAllTables()

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

    // Validate stage filter
    if (stage && !VALID_STAGES.includes(stage as typeof VALID_STAGES[number])) {
      return NextResponse.json({ error: "Invalid stage filter" }, { status: 400 })
    }

    // Validate clientId and leadId format
    if (clientId && !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId)) {
      return NextResponse.json({ error: "Invalid clientId format" }, { status: 400 })
    }
    if (leadId && !/^[a-zA-Z0-9_-]{1,100}$/.test(leadId)) {
      return NextResponse.json({ error: "Invalid leadId format" }, { status: 400 })
    }

    // Build where clause
    const where: Prisma.DealWhereInput = {}
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

      const serialized = deals.map((d) => serializeDealDates(d as unknown as DealWithDates))
      return NextResponse.json(deepSanitize({
        data: serialized,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }))
    } catch (error: unknown) {
      console.error("[deals] GET error:", error instanceof Error ? error.message : error)
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
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureAllTables()

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

    // Validate FK id formats
    if (data.clientId && !/^[a-zA-Z0-9_-]{1,100}$/.test(data.clientId)) {
      return NextResponse.json({ error: "Invalid clientId format" }, { status: 400 })
    }
    if (data.leadId && !/^[a-zA-Z0-9_-]{1,100}$/.test(data.leadId)) {
      return NextResponse.json({ error: "Invalid leadId format" }, { status: 400 })
    }
    if (data.assignedToId && !/^[a-zA-Z0-9_-]{1,100}$/.test(data.assignedToId)) {
      return NextResponse.json({ error: "Invalid assignedToId format" }, { status: 400 })
    }

    // Verify FK references in parallel
    const [client, lead, user] = await Promise.all([
      data.clientId ? db.client.findUnique({ where: { id: data.clientId }, select: { id: true } }).catch(() => null) : Promise.resolve(null),
      data.leadId ? db.lead.findUnique({ where: { id: data.leadId }, select: { id: true } }).catch(() => null) : Promise.resolve(null),
      data.assignedToId ? db.user.findUnique({ where: { id: data.assignedToId }, select: { id: true } }).catch(() => null) : Promise.resolve(null),
    ])
    if (data.clientId && !client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
    if (data.leadId && !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    if (data.assignedToId && !user) return NextResponse.json({ error: "Assigned user not found" }, { status: 404 })

    try {
      const deal = await db.deal.create({
        data: {
          title: data.title,
          value: data.value ?? 0,
          currency: data.currency || "INR",
          stage: data.stage || "LEAD",
          probability: data.probability ?? 0,
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
          clientId: data.clientId || null,
          leadId: data.leadId || null,
          assignedToId: data.assignedToId || null,
          notes: (data.notes || "").slice(0, 5000) || null,
        },
        include: {
          client: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      })
      return NextResponse.json(deepSanitize(serializeDealDates(deal as unknown as DealWithDates)), { status: 201 })
    } catch (error: unknown) {
      console.error("[deals] POST error:", error instanceof Error ? error.message : error)
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2002") {
        return NextResponse.json({ error: "A deal with this title already exists" }, { status: 409 })
      }
      return NextResponse.json({ error: "Failed to create deal" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[deals] POST unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
