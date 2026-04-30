import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/expenses - List expenses (ADMIN/SUPER_ADMIN only)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const expenses = await db.expense.findMany({ orderBy: { date: "desc" } })
  return NextResponse.json(expenses)
}

// POST /api/expenses - Create expense (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { category, description, amount, date, receiptUrl } = body

  if (!category || !description || amount === undefined) {
    return NextResponse.json({ error: "Category, description, and amount are required" }, { status: 400 })
  }

  const validCategories = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "OTHER"]
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
    },
  })
  return NextResponse.json(expense)
}

// PATCH /api/expenses - Update expense
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...data } = body

  if (!id) {
    return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
  }

  const allowedFields = ["category", "description", "amount", "date", "receiptUrl"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === "amount") {
        sanitizedData[key] = parseFloat(data[key])
      } else if (key === "date") {
        sanitizedData[key] = new Date(data[key])
      } else {
        sanitizedData[key] = data[key]
      }
    }
  }

  try {
    const expense = await db.expense.update({
      where: { id },
      data: sanitizedData,
    })
    return NextResponse.json(expense)
  } catch (error: any) {
    return NextResponse.json({ error: "Expense not found or update failed" }, { status: 404 })
  }
}

// DELETE /api/expenses - Delete expense (SUPER_ADMIN only)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Expense ID is required" }, { status: 400 })
  }

  try {
    await db.expense.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: "Expense not found or delete failed" }, { status: 404 })
  }
}
