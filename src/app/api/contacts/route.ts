import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createContactSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ━━ Admin check helper ━━
function isAdmin(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

// GET /api/contacts - List contacts with pagination, search, filter, sort
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-contacts-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const clientId = searchParams.get("clientId") || ""
  const leadId = searchParams.get("leadId") || ""
  const isPrimary = searchParams.get("isPrimary") || ""
  const sortBy = searchParams.get("sortBy") || "createdAt"
  const sortOrder = searchParams.get("sortOrder") || "desc"

  // Pagination params
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
  const offset = (page - 1) * limit

  // Validate sort params
  const validSortBy = ["firstName", "createdAt", "email"]
  const validSortOrder = ["asc", "desc"]
  if (sortBy && !validSortBy.includes(sortBy)) {
    return NextResponse.json({ error: `Invalid sortBy. Must be one of: ${validSortBy.join(", ")}` }, { status: 400 })
  }
  if (sortOrder && !validSortOrder.includes(sortOrder)) {
    return NextResponse.json({ error: "Invalid sortOrder. Must be asc or desc" }, { status: 400 })
  }

  // Build where clause
  const where: Record<string, unknown> = {}
  if (clientId) where.clientId = clientId
  if (leadId) where.leadId = leadId
  if (isPrimary === "true") where.isPrimary = true
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } },
      { jobTitle: { contains: search } },
    ]
  }

  const orderBy: Record<string, string> = sortBy === "firstName"
    ? { firstName: sortOrder === "asc" ? "asc" : "desc" }
    : sortBy === "email"
      ? { email: sortOrder === "asc" ? "asc" : "desc" }
      : { createdAt: sortOrder === "asc" ? "asc" : "desc" }

  try {
    const [contacts, total] = await Promise.all([
      db.contact.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      db.contact.count({ where }),
    ])

    return NextResponse.json(JSON.parse(JSON.stringify({
      data: contacts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })))
  } catch (error: unknown) {
    console.error("Error fetching contacts:", error)
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
  }
}

// POST /api/contacts - Create contact (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-contacts-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const validation = validateRequest(createContactSchema, body)
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data

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

  // If isPrimary is set, unset any other primary contact for the same client/lead (transactional)
  if (data.isPrimary) {
    await db.$transaction(async (tx) => {
      if (data.clientId) {
        await tx.contact.updateMany({
          where: { clientId: data.clientId, isPrimary: true },
          data: { isPrimary: false },
        })
      }
      if (data.leadId) {
        await tx.contact.updateMany({
          where: { leadId: data.leadId, isPrimary: true },
          data: { isPrimary: false },
        })
      }
    })
  }

  try {
    const contact = await db.contact.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: data.email,
        phone: data.phone || null,
        jobTitle: data.jobTitle || null,
        clientId: data.clientId || null,
        leadId: data.leadId || null,
        notes: data.notes || null,
        isPrimary: data.isPrimary ?? false,
      },
      include: {
        client: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(contact, { status: 201 })
  } catch (error: unknown) {
    console.error("Error creating contact:", error)
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
