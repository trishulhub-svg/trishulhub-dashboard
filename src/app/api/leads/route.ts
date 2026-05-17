import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createLeadSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ━━ Shared constants ━━
const ALLOWED_FIELDS = ["name", "email", "company", "website", "phone", "source", "score", "status", "notes", "clientId"] as const

const VALID_STATUSES = ["NEW", "CONTACTED", "INTERESTED", "PROPOSAL", "NEGOTIATING", "WON", "LOST"] as const
const VALID_SOURCES = ["MANUAL", "AI_FOUND", "REFERRAL", "SOCIAL_MEDIA"] as const

// ━━ Shared update logic for PATCH & PUT ━━
async function _updateLead(id: string, data: Record<string, unknown>) {
  // Validate status if provided
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 })
  }

  // Validate source if provided (API-013)
  if (data.source !== undefined && !VALID_SOURCES.includes(data.source as typeof VALID_SOURCES[number])) {
    return NextResponse.json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` }, { status: 400 })
  }

  // Server-side score range check (API-007)
  if (data.score !== undefined) {
    const score = Number(data.score)
    if (isNaN(score) || score < 0 || score > 100) {
      return NextResponse.json({ error: "Score must be between 0 and 100" }, { status: 400 })
    }
  }

  // H5: Email uniqueness check on update
  if (data.email !== undefined && typeof data.email === 'string') {
    const existing = await db.lead.findFirst({ where: { email: data.email, NOT: { id } } })
    if (existing) {
      return NextResponse.json({ error: "A lead with this email already exists" }, { status: 409 })
    }
  }

  // Only allow updating specific fields
  const sanitizedData: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) {
      sanitizedData[key] = data[key]
    }
  }

  try {
    const lead = await db.lead.update({
      where: { id },
      data: sanitizedData,
    })
    return NextResponse.json(lead)
  } catch (error: unknown) {
    console.error("Error updating lead:", error)
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
  }
}

// GET /api/leads - List leads with pagination, search/filter/sort (ADMIN/SUPER_ADMIN only)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-leads-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const status = searchParams.get("status") || ""
  const source = searchParams.get("source") || ""
  const sortBy = searchParams.get("sortBy") || "createdAt"
  const sortOrder = searchParams.get("sortOrder") || "desc"

  // Pagination params
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
  const offset = (page - 1) * limit

  // Validate sort params
  const validSortBy = ["name", "createdAt", "score"]
  const validSortOrder = ["asc", "desc"]
  if (sortBy && !validSortBy.includes(sortBy)) {
    return NextResponse.json({ error: "Invalid sortBy. Must be one of: name, createdAt, score" }, { status: 400 })
  }
  if (sortOrder && !validSortOrder.includes(sortOrder)) {
    return NextResponse.json({ error: "Invalid sortOrder. Must be asc or desc" }, { status: 400 })
  }

  // Build where clause
  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (source) where.source = source
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { company: { contains: search } },
      { phone: { contains: search } },
    ]
  }

  const orderBy: Record<string, string> = sortBy === "score"
    ? { score: sortOrder === "asc" ? "asc" : "desc" }
    : sortBy === "name"
      ? { name: sortOrder === "asc" ? "asc" : "desc" }
      : { createdAt: sortOrder === "asc" ? "asc" : "desc" }

  try {
    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        include: { client: true, emails: true },
        orderBy,
        skip: offset,
        take: limit,
      }),
      db.lead.count({ where }),
    ])

    return NextResponse.json(JSON.parse(JSON.stringify({
      data: leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })))
  } catch (error: unknown) {
    console.error("Error fetching leads:", error)
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
  }
}

// POST /api/leads - Create lead (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-leads-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
  }

  // API-003: Wrap req.json() in try/catch
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // API-001: Use Zod validation instead of raw destructuring
  const validation = validateRequest(createLeadSchema, body)
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data

  try {
    // API-006: Duplicate email check before creating
    const existing = await db.lead.findFirst({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: "A lead with this email already exists" }, { status: 409 })
    }

    const lead = await db.lead.create({
      data: {
        name: data.name,
        email: data.email,
        company: data.company || null,
        website: data.website || null,
        phone: data.phone || null,
        source: data.source || "MANUAL",
        score: data.score ?? 0,
        status: data.status || "NEW",
        notes: data.notes || null,
        clientId: data.clientId || null,
      },
    })
    return NextResponse.json(lead)
  } catch (error: any) {
    console.error("[leads] POST error:", error?.message)
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 })
  }
}

// PATCH /api/leads - Update lead (for drag-and-drop status change, etc.)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-leads-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  // API-003: Wrap req.json() in try/catch
  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { id, ...data } = body

  if (!id) {
    return NextResponse.json({ error: "Lead ID is required" }, { status: 400 })
  }

  return _updateLead(id as string, data)
}

// PUT /api/leads - Full update (delegates to shared _updateLead, API-005)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-leads-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  // API-003: Wrap req.json() in try/catch
  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { id, ...data } = body
  if (!id) {
    return NextResponse.json({ error: "Lead ID is required" }, { status: 400 })
  }

  // API-005: Delegate to same logic as PATCH (including status & source validation)
  return _updateLead(id as string, data)
}
