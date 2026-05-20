import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/expenses - List expenses with search, date, category, project filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-get:${userId}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const category = searchParams.get("category")
    const projectId = searchParams.get("projectId")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
    const offset = (page - 1) * limit

    const where: Record<string, unknown> = {}

    // Date range filter
    if (startDate || endDate) {
      where.date = {}
      if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
      if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate)
    }

    // Category filter
    if (category) where.category = category

    // Project filter
    if (projectId) where.projectId = projectId

    // Search filter (description)
    if (search) {
      where.description = { contains: search }
    }

    const [expenses, total] = await Promise.all([
      db.expense.findMany({
        where,
        include: { project: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
        skip: offset,
        take: limit,
      }),
      db.expense.count({ where }),
    ])

    // If search includes project name or category, filter in-memory since Prisma SQLite doesn't support relation filters well
    let filtered = expenses
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = expenses.filter(
        (e) =>
          e.description.toLowerCase().includes(searchLower) ||
          (e.category || "").toLowerCase().includes(searchLower) ||
          e.project?.name?.toLowerCase().includes(searchLower) ||
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
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-post:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { category?: string; description?: string; amount?: number; date?: string; receiptUrl?: string; projectId?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { category, description, amount, date, receiptUrl, projectId } = body

    if (!category || !description || amount === undefined) {
      return NextResponse.json({ error: "Category, description, and amount are required" }, { status: 400 })
    }

    // M-FIN-2: Max-length on description
    if (description && description.length > 2000) {
      return NextResponse.json({ error: "Description must be at most 2000 characters" }, { status: 400 })
    }

    const validCategories = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"]
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 })
    }

    const parsed = parseFloat(amount as unknown as string)
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
      },
      include: { project: { select: { id: true, name: true } } },
    })
    return NextResponse.json(expense)
  } catch {
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 })
  }
}

// PATCH /api/expenses - Update expense
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-patch:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { id?: string; category?: string; description?: string; amount?: number; date?: string; receiptUrl?: string; projectId?: string; [key: string]: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
    }

    const validCategories = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"]

    const allowedFields = ["category", "description", "amount", "date", "receiptUrl", "projectId"]
    const sanitizedData: Record<string, unknown> = {}
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
        } else if (key === "category") {
          if (!validCategories.includes(data[key] as string)) {
            return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 })
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
          include: { project: { select: { id: true, name: true } } },
        })
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Expense not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Expense update failed" }, { status: 500 })
    }
    return NextResponse.json(expense)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/expenses - Delete expense (SUPER_ADMIN and ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
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

    const existing = await db.expense.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    await db.expense.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
