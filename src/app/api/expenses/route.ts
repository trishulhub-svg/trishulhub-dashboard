import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { isAdmin } from "@/lib/rbac"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

const VALID_CATEGORIES = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"] as const
type ExpenseCategory = typeof VALID_CATEGORIES[number]

// GET /api/expenses - List expenses with search, date, category, project filters
export async function GET(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-get:${userId}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const category = searchParams.get("category")
    const projectId = searchParams.get("projectId")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1)
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50") || 50), 200)
    const offset = (page - 1) * limit

    const where: Prisma.ExpenseWhereInput = {}
    const dateFilter: { gte?: Date; lte?: Date } = {}

    // Date range filter with validation
    if (startDate) {
      const d = new Date(startDate)
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid startDate" }, { status: 400 })
      dateFilter.gte = d
    }
    if (endDate) {
      const d = new Date(endDate)
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid endDate" }, { status: 400 })
      dateFilter.lte = d
    }
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter
    }

    // Category filter
    if (category) where.category = category

    // Project filter with format validation
    if (projectId) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) {
        return NextResponse.json({ error: "Invalid projectId format" }, { status: 400 })
      }
      where.projectId = projectId
    }

    // NOTE: Search is applied in-memory after DB pagination. Total reflects DB count, not filtered count.
    // For accurate pagination with search, consider SQLite FTS5 or moving search to WHERE clause.
    // This is a known limitation — search runs across related fields (employee name, project name, etc.)
    // which Prisma SQLite doesn't support in cross-relation OR queries.

    const [expenses, total] = await Promise.all([
      db.expense.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
        skip: offset,
        take: limit,
      }),
      db.expense.count({ where }),
    ])

    // Smart multi-field search: searches description, category, project name,
    // employee name, payment reference, and amount.
    // This runs in-memory because Prisma SQLite doesn't support cross-relation OR queries.
    let filtered = expenses
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = expenses.filter(
        (e) =>
          e.description.toLowerCase().includes(searchLower) ||
          (e.category || "").toLowerCase().includes(searchLower) ||
          (e.category || "").replace(/_/g, " ").toLowerCase().includes(searchLower) ||
          e.project?.name?.toLowerCase().includes(searchLower) ||
          e.employee?.name?.toLowerCase().includes(searchLower) ||
          (e.paymentRef || "").toLowerCase().includes(searchLower) ||
          e.amount.toString().includes(search)
      )
    }

    return NextResponse.json(JSON.parse(JSON.stringify({
      data: filtered,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })))
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/expenses - Create expense (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-post:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { category?: string; description?: string; amount?: number; date?: string; receiptUrl?: string; projectId?: string; employeeId?: string; paymentRef?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { category, description, amount, date, receiptUrl, projectId, employeeId, paymentRef } = body

    if (!category || !description || amount === undefined) {
      return NextResponse.json({ error: "Category, description, and amount are required" }, { status: 400 })
    }

    // M-FIN-2: Max-length on description
    if (description && description.length > 2000) {
      return NextResponse.json({ error: "Description must be at most 2000 characters" }, { status: 400 })
    }

    if (!VALID_CATEGORIES.includes(category as ExpenseCategory)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 })
    }

    const parsed = typeof amount === "number" ? amount : parseFloat(String(amount ?? ""))
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json({ error: "Amount must be a valid non-negative number" }, { status: 400 })
    }

    // M-FIN-3: receiptUrl URL scheme validation
    if (receiptUrl) {
      try {
        const parsedUrl = new URL(receiptUrl)
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return NextResponse.json({ error: "receiptUrl must use http or https" }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: "Invalid receiptUrl format" }, { status: 400 })
      }
    }

    const expense = await db.expense.create({
      data: {
        category,
        description,
        amount: parsed,
        date: date ? new Date(date) : new Date(),
        receiptUrl: receiptUrl || null,
        projectId: projectId || null,
        employeeId: employeeId || null,
        paymentRef: paymentRef || null,
      },
      include: {
        project: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
    })
    // Audit: log expense creation (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "BUSINESS", page: "expenses", action: "CREATE",
      entityType: "Expense", entityId: expense.id,
      description: `Created expense: ${expense.description} (${expense.category}, £${expense.amount})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json(JSON.parse(JSON.stringify(expense)))
  } catch {
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 })
  }
}

// PATCH /api/expenses - Update expense
export async function PATCH(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-patch:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { id?: string; category?: string; description?: string; amount?: number; date?: string; receiptUrl?: string; projectId?: string; employeeId?: string; paymentRef?: string; [key: string]: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
    }

    const allowedFields = ["category", "description", "amount", "date", "receiptUrl", "projectId", "employeeId", "paymentRef"]
    // Record<string, any> for dynamic field loop — intentional pattern
    const sanitizedData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        if (key === "amount") {
          const parsed = parseFloat(data[key] as unknown as string)
          if (isNaN(parsed) || parsed < 0) {
            return NextResponse.json({ error: "Amount must be a valid non-negative number" }, { status: 400 })
          }
          sanitizedData[key] = parsed
        } else if (key === "date") {
          sanitizedData[key] = new Date(data[key] as string)
        } else if (key === "projectId" && data[key] === "") {
          sanitizedData[key] = null
        } else if (key === "employeeId" && data[key] === "") {
          sanitizedData[key] = null
        } else if (key === "paymentRef" && data[key] !== undefined) {
          sanitizedData[key] = typeof data[key] === "string" && data[key].trim() === "" ? null : data[key]
        } else if (key === "category") {
          if (!VALID_CATEGORIES.includes(data[key] as ExpenseCategory)) {
            return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 })
          }
          sanitizedData[key] = data[key]
        } else if (key === "description") {
          // M-FIN-2: Max-length on description
          if (typeof data[key] === "string" && data[key].length > 2000) {
            return NextResponse.json({ error: "Description must be at most 2000 characters" }, { status: 400 })
          }
          sanitizedData[key] = data[key]
        } else if (key === "receiptUrl") {
          // M-FIN-3: receiptUrl URL scheme validation
          if (data[key] !== null && data[key] !== "") {
            try {
              const parsedUrl = new URL(data[key] as string)
              if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                return NextResponse.json({ error: "receiptUrl must use http or https" }, { status: 400 })
              }
            } catch {
              return NextResponse.json({ error: "Invalid receiptUrl format" }, { status: 400 })
            }
          }
          sanitizedData[key] = data[key] === "" ? null : data[key]
        } else {
          sanitizedData[key] = data[key]
        }
      }
    }

    // M-FIN-10: TOCTOU race fix — wrap existence check + update in transaction
    let expense
    try {
      expense = await db.$transaction(async (tx) => {
        const existing = await tx.expense.findUnique({ where: { id } })
        if (!existing) throw new Error("NOT_FOUND")
        return tx.expense.update({
          where: { id },
          data: sanitizedData,
          include: {
            project: { select: { id: true, name: true } },
            employee: { select: { id: true, name: true } },
          },
        })
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Expense not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Expense update failed" }, { status: 500 })
    }
    // Audit: log expense PATCH update (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "BUSINESS", page: "expenses", action: "UPDATE",
      entityType: "Expense", entityId: id,
      description: `Updated expense: ${expense.description} (${expense.category})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json(JSON.parse(JSON.stringify(expense)))
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT /api/expenses - Full update expense (ADMIN/SUPER_ADMIN only)
export async function PUT(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-put:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { id?: string; category?: string; description?: string; amount?: number; date?: string; receiptUrl?: string; projectId?: string; employeeId?: string; paymentRef?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { id, category, description, amount, date, projectId, employeeId, paymentRef, receiptUrl } = body

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
    }

    if (category && !VALID_CATEGORIES.includes(category as ExpenseCategory)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 })
    }

    if (description && description.length > 2000) {
      return NextResponse.json({ error: "Description must be at most 2000 characters" }, { status: 400 })
    }

    const parsed = typeof amount === "number" ? amount : amount !== undefined ? parseFloat(String(amount)) : undefined
    if (parsed !== undefined && (isNaN(parsed) || parsed < 0)) {
      return NextResponse.json({ error: "Amount must be a valid non-negative number" }, { status: 400 })
    }

    if (receiptUrl && receiptUrl !== "") {
      try {
        const parsedUrl = new URL(receiptUrl)
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return NextResponse.json({ error: "receiptUrl must use http or https" }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: "Invalid receiptUrl format" }, { status: 400 })
      }
    }

    let expense
    try {
      expense = await db.$transaction(async (tx) => {
        const existing = await tx.expense.findUnique({ where: { id } })
        if (!existing) throw new Error("NOT_FOUND")

        const updateData: Prisma.ExpenseUncheckedUpdateInput = {}
        if (category !== undefined) updateData.category = category
        if (description !== undefined) updateData.description = description
        if (parsed !== undefined) updateData.amount = parsed
        if (date !== undefined) updateData.date = new Date(date)
        updateData.projectId = projectId && projectId !== "NONE" ? projectId : null
        updateData.employeeId = employeeId && employeeId !== "NONE" ? employeeId : null
        updateData.paymentRef = paymentRef && paymentRef.trim() !== "" ? paymentRef : null
        updateData.receiptUrl = receiptUrl && receiptUrl !== "" ? receiptUrl : null

        return tx.expense.update({
          where: { id },
          data: updateData,
          include: {
            project: { select: { id: true, name: true } },
            employee: { select: { id: true, name: true } },
          },
        })
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Expense not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Expense update failed" }, { status: 500 })
    }

    // Audit: log expense PUT update (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "BUSINESS", page: "expenses", action: "UPDATE",
      entityType: "Expense", entityId: id,
      description: `Updated expense (PUT): ${expense.description} (${expense.category})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json(JSON.parse(JSON.stringify(expense)))
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/expenses - Delete expense (SUPER_ADMIN and ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-delete:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // H-FIN-2: Accept ID from JSON body instead of query params
    let body: { id?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
    }

    try {
      await db.$transaction(async (tx) => {
        const existing = await tx.expense.findUnique({ where: { id } })
        if (!existing) {
          throw new Error("NOT_FOUND")
        }
        await tx.expense.delete({ where: { id } })
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Expense not found" }, { status: 404 })
      }
      // Safety net for Prisma P2025 (record not found)
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return NextResponse.json({ error: "Expense not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
    // Audit: log expense deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "BUSINESS", page: "expenses", action: "DELETE",
      entityType: "Expense", entityId: id,
      description: `Deleted expense (id: ${id})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
