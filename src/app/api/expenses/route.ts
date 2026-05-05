import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/expenses - List expenses with search, date, category, project filters
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  const where: Record<string, any> = {}

  // Date range filter
  if (startDate || endDate) {
    where.date = {}
    if (startDate) where.date.gte = new Date(startDate)
    if (endDate) where.date.lte = new Date(endDate)
  }

  // Category filter
  if (category) where.category = category

  // Project filter
  if (projectId) where.projectId = projectId

  // Search filter (description)
  if (search) {
    where.description = { contains: search }
  }

  const expenses = await db.expense.findMany({
    where,
    include: { project: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
  })

  // If search includes project name, filter in-memory since Prisma SQLite doesn't support relation filters well
  let filtered = expenses
  if (search) {
    const searchLower = search.toLowerCase()
    filtered = expenses.filter(
      (e) =>
        e.description.toLowerCase().includes(searchLower) ||
        e.category.toLowerCase().includes(searchLower) ||
        e.project?.name?.toLowerCase().includes(searchLower) ||
        e.amount.toString().includes(search)
    )
  }

  return NextResponse.json(filtered)
}

// POST /api/expenses - Create expense (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { category, description, amount, date, receiptUrl, projectId } = body

  if (!category || !description || amount === undefined) {
    return NextResponse.json({ error: "Category, description, and amount are required" }, { status: 400 })
  }

  const validCategories = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"]
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 })
  }

  const expense = await db.expense.create({
    data: {
      category,
      description,
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      receiptUrl: receiptUrl || null,
      projectId: projectId || null,
    },
    include: { project: { select: { id: true, name: true } } },
  })
  return NextResponse.json(expense)
}

// PATCH /api/expenses - Update expense
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...data } = body

  if (!id) {
    return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
  }

  const allowedFields = ["category", "description", "amount", "date", "receiptUrl", "projectId"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === "amount") {
        sanitizedData[key] = parseFloat(data[key])
      } else if (key === "date") {
        sanitizedData[key] = new Date(data[key])
      } else if (key === "projectId" && data[key] === "") {
        sanitizedData[key] = null
      } else {
        sanitizedData[key] = data[key]
      }
    }
  }

  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }

  try {
    const expense = await db.expense.update({
      where: { id },
      data: sanitizedData,
      include: { project: { select: { id: true, name: true } } },
    })
    return NextResponse.json(expense)
  } catch (error: any) {
    return NextResponse.json({ error: "Expense update failed" }, { status: 500 })
  }
}

// DELETE /api/expenses - Delete expense (SUPER_ADMIN and ADMIN only)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
  }

  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }

  try {
    await db.expense.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: "Expense delete failed" }, { status: 500 })
  }
}
