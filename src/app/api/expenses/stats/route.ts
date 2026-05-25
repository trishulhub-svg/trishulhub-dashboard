import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/expenses/stats - Category and project-wise expense grouping
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`expenses-stats-get:${userId}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    // Date validation
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: "Invalid startDate format" }, { status: 400 })
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "Invalid endDate format" }, { status: 400 })
    }

    const where: Record<string, unknown> = {}
    if (startDate || endDate) {
      where.date = {}
      if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
      if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate)
    }

    const expenses = await db.expense.findMany({
      where,
      include: { project: { select: { id: true, name: true, budget: true } } },
    })

    // Group by category
    const byCategory: Record<string, { category: string; total: number; count: number }> = {}
    for (const exp of expenses) {
      const cat = exp.category
      if (!byCategory[cat]) {
        byCategory[cat] = { category: cat, total: 0, count: 0 }
      }
      byCategory[cat].total += exp.amount
      byCategory[cat].count += 1
    }

    // Group by project
    const byProject: Record<string, { projectId: string | null; projectName: string; total: number; count: number; budget: number | null }> = {}
    for (const exp of expenses) {
      const key = exp.projectId || "unassigned"
      if (!byProject[key]) {
        byProject[key] = {
          projectId: exp.projectId,
          projectName: exp.project?.name || "Unassigned",
          total: 0,
          count: 0,
          budget: exp.project?.budget || null,
        }
      }
      byProject[key].total += exp.amount
      byProject[key].count += 1
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

    return NextResponse.json({
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
      byProject: Object.values(byProject).sort((a, b) => b.total - a.total),
      totalExpenses,
      totalEntries: expenses.length,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
