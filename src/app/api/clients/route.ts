import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createClientSchema, validateRequest } from "@/lib/validations"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/clients - List all clients with pagination and aggregated data
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`crm-clients-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
  }

  const userId = session.user.id
  const assignedClientIds = await getAssignedClientIds(userId, role)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const status = searchParams.get("status") || ""
  const sortBy = searchParams.get("sortBy") || "createdAt"
  const sortOrder = searchParams.get("sortOrder") || "desc"

  // CLI-032: Date range filter params
  const dateFromParam = searchParams.get("dateFrom")
  const dateToParam = searchParams.get("dateTo")

  // Pagination params
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
  const offset = (page - 1) * limit

  // API-018: Validate sortBy and sortOrder
  const validSortBy = ["name", "createdAt", "revenue"]
  const validSortOrder = ["asc", "desc"]
  if (sortBy && !validSortBy.includes(sortBy)) {
    return NextResponse.json({ error: `Invalid sortBy. Must be one of: ${validSortBy.join(", ")}` }, { status: 400 })
  }
  if (sortOrder && !validSortOrder.includes(sortOrder)) {
    return NextResponse.json({ error: `Invalid sortOrder. Must be one of: ${validSortOrder.join(", ")}` }, { status: 400 })
  }

  // Build date filter helper (reused for where and statsWhere)
  const buildDateFilter = (fromParam: string | null, toParam: string | null): Record<string, unknown> | null => {
    if (!fromParam && !toParam) return null
    const dateFilter: Record<string, unknown> = {}
    if (fromParam) dateFilter.gte = new Date(fromParam)
    if (toParam) {
      const endOfDay = new Date(toParam)
      endOfDay.setHours(23, 59, 59, 999)
      dateFilter.lte = endOfDay
    }
    return dateFilter
  }

  // Build where clause
  const where: Record<string, unknown> = {}

  // Developers only see clients from their assigned projects
  if (assignedClientIds) {
    where.id = { in: assignedClientIds }
  }

  if (status && status !== "ALL") {
    where.status = status
  }

  // CLI-032: Date range filter
  const dateFilter = buildDateFilter(dateFromParam, dateToParam)
  if (dateFilter) {
    where.createdAt = dateFilter
  }

  // CLI-031: Added website to search OR array
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { company: { contains: search } },
      { phone: { contains: search } },
      { website: { contains: search } },
      { websites: { contains: search } },
      { projectType: { contains: search } },
    ]
  }

  // Determine sort order
  type OrderBy = Record<string, string>
  let orderBy: OrderBy = { createdAt: "desc" }
  if (sortBy === "name") {
    orderBy = { name: sortOrder === "asc" ? "asc" : "desc" }
  } else if (sortBy === "createdAt") {
    orderBy = { createdAt: sortOrder === "asc" ? "asc" : "desc" }
  }

  const [clients, total] = await Promise.all([
    db.client.findMany({
      where,
      include: {
        _count: {
          select: {
            projects: true,
            invoices: true,
            tickets: true,
          },
        },
        invoices: {
          where: { status: "PAID" },
          select: { total: true },
        },
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
    db.client.count({ where }),
  ])

  // Compute aggregated revenue per client
  let enriched = clients.map((client) => {
    const revenue = client.invoices.reduce((sum, inv) => sum + inv.total, 0)
    const { invoices, ...rest } = client
    return {
      ...rest,
      // Hide revenue for developers
      revenue: isAdmin(role) ? revenue : undefined,
    }
  })

  // API-008: Revenue sort support — sort in-memory after computing revenue
  if (sortBy === "revenue") {
    enriched.sort((a, b) => {
      const revA = (a.revenue as number) ?? 0
      const revB = (b.revenue as number) ?? 0
      return sortOrder === "asc" ? revA - revB : revB - revA
    })
  }

  // CLI-033: Aggregate stats (computed across ALL matching clients, NOT just current page)
  // Uses base filters (assignedClientIds, status, date) but WITHOUT text search
  const statsWhere: Record<string, unknown> = {}
  if (assignedClientIds) statsWhere.id = { in: assignedClientIds }
  if (status && status !== "ALL") statsWhere.status = status
  const statsDateFilter = buildDateFilter(dateFromParam, dateToParam)
  if (statsDateFilter) statsWhere.createdAt = statsDateFilter

  const [statsTotal, activeCount, invoiceCount] = await Promise.all([
    db.client.count({ where: statsWhere }),
    db.client.count({ where: { ...statsWhere, status: "ACTIVE" } }),
    db.invoice.count({ where: { client: statsWhere } }),
  ])

  let totalRevenue: number | undefined
  if (isAdmin(role)) {
    const revenueResult = await db.invoice.aggregate({
      where: { client: statsWhere, status: "PAID" },
      _sum: { total: true },
    })
    totalRevenue = revenueResult._sum?.total ?? 0
  }

  return NextResponse.json(JSON.parse(JSON.stringify({
    data: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    stats: {
      total: statsTotal,
      active: activeCount,
      revenue: totalRevenue,
      invoices: invoiceCount,
    },
  })))
}

// POST /api/clients - Create client with validation
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-clients-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
  }

  // Wrap req.json() in try/catch for malformed JSON
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const validation = validateRequest(createClientSchema, body)

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data

  // Check for duplicate email
  const existing = await db.client.findFirst({ where: { email: data.email } })
  if (existing) {
    return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 })
  }

  // Build create data
  const createData: {
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    website: string | null;
    websites: string;
    status: string;
    userId: string | null;
    notes: string | null;
    projectType: string | null;
    projectStartDate: Date | null;
    deliveryDate: Date | null;
    mediatorName: string | null;
    mediatorPhone: string | null;
    mediatorEmail: string | null;
    createdAt?: Date;
  } = {
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    company: data.company || null,
    website: data.website || null,
    websites: data.websites ? JSON.stringify(data.websites) : "[]",
    status: data.status || "ACTIVE",
    userId: data.userId || null,
    notes: data.notes || null,
    projectType: data.projectType || null,
    projectStartDate: data.projectStartDate ? new Date(data.projectStartDate) : null,
    deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
    mediatorName: data.mediatorName || null,
    mediatorPhone: data.mediatorPhone || null,
    mediatorEmail: data.mediatorEmail || null,
  }

  // Support createdAt override for historical data
  if (data.createdAt) {
    createData.createdAt = new Date(data.createdAt)
  }

  try {
    const client = await db.client.create({ data: createData })
    return NextResponse.json(client, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 })
  }
}
