import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

const VALID_CATEGORIES = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"] as const
type ExpenseCategory = typeof VALID_CATEGORIES[number]

// GET /api/expenses/stats - Category and project-wise expense grouping
export async function GET(req: NextRequest) {
  try {
    await ensureAllTables()
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
    const category = searchParams.get("category")
    const search = (searchParams.get("search") || "").trim()

    // Date validation
    let parsedStart: Date | null = null
    let parsedEnd: Date | null = null
    if (startDate) {
      parsedStart = new Date(startDate)
      if (isNaN(parsedStart.getTime())) {
        return NextResponse.json({ error: "Invalid startDate format" }, { status: 400 })
      }
    }
    if (endDate) {
      // Date-only endDate gets end-of-day UTC so expenses later in the day are included
      const endStr = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999Z` : endDate
      parsedEnd = new Date(endStr)
      if (isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid endDate format" }, { status: 400 })
      }
    }

    // Validate category filter
    if (category && !VALID_CATEGORIES.includes(category as ExpenseCategory)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 })
    }

    const where: Prisma.ExpenseWhereInput = {}
    if (parsedStart || parsedEnd) {
      where.date = {}
      if (parsedStart) where.date.gte = parsedStart
      if (parsedEnd) where.date.lte = parsedEnd
    }
    if (category) where.category = category

    // Apply the same smart DB-level search used by GET /api/expenses so stats
    // respect the active search query — previously stats only respected date filters,
    // so the "Total Displayed Expenses" summary disagreed with the filtered list.
    if (search) {
      const orClauses: Prisma.ExpenseWhereInput[] = [
        { description: { contains: search } },
        { category: { contains: search } },
        { paymentRef: { contains: search } },
        { project: { name: { contains: search } } },
        { employee: { name: { contains: search } } },
      ]
      const searchNum = Number(search)
      if (!isNaN(searchNum) && Number.isFinite(searchNum)) {
        orClauses.push({ amount: { equals: searchNum } })
      }
      where.OR = orClauses
    }

    // Phase 7c: Use proper aggregate queries instead of in-memory aggregation over a
    // capped result set (previously `take: 10000` which silently produced wrong totals
    // for any workspace with >10000 expense rows). groupBy + raw SQL scale to the full
    // filtered table while letting SQLite/Turso do the work in a single round-trip.
    //
    // Note: `search` filters are translated to a Prisma `where` clause above, so all
    // aggregations below respect the same filters as the GET /api/expenses list.

    // 1) Category aggregation — no join needed, use Prisma groupBy.
    const categoryGroups = await db.expense.groupBy({
      by: ["category"],
      where,
      _sum: { amount: true },
      _count: true,
    })

    const byCategory = categoryGroups
      .map((g) => ({
        category: g.category || "OTHER",
        total: g._sum.amount ?? 0,
        count: g._count,
      }))
      .sort((a, b) => b.total - a.total)

    // 2) Project aggregation — requires the project name + budget, so use raw SQL
    //    with a LEFT JOIN so unassigned expenses (projectId IS NULL) are included.
    //    Prisma's groupBy cannot join, so we build the query with $queryRawUnsafe
    //    using parameterized inputs (safe against SQL injection).
    type ProjectGroupRow = {
      projectId: string | null
      projectName: string | null
      budget: number | null
      total: number
      count: number
    }

    // Build the WHERE clause mirroring the Prisma `where` above:
    // - date range (gte/lte)
    // - exact category match
    // - search across description/category/paymentRef/project name/employee name/amount
    const dateClauses: string[] = []
    const categoryClauses: string[] = []
    const searchClauses: string[] = []
    const sqlParams: unknown[] = []

    if (parsedStart) {
      dateClauses.push(`e.date >= ?`)
      sqlParams.push(parsedStart)
    }
    if (parsedEnd) {
      dateClauses.push(`e.date <= ?`)
      sqlParams.push(parsedEnd)
    }
    if (category) {
      categoryClauses.push(`e.category = ?`)
      sqlParams.push(category)
    }
    if (search) {
      searchClauses.push(`e.description LIKE ?`)
      sqlParams.push(`%${search}%`)
      searchClauses.push(`e.category LIKE ?`)
      sqlParams.push(`%${search}%`)
      searchClauses.push(`e.paymentRef LIKE ?`)
      sqlParams.push(`%${search}%`)
      searchClauses.push(`p.name LIKE ?`)
      sqlParams.push(`%${search}%`)
      searchClauses.push(`u.name LIKE ?`)
      sqlParams.push(`%${search}%`)
      const searchNum = Number(search)
      if (!isNaN(searchNum) && Number.isFinite(searchNum)) {
        searchClauses.push(`e.amount = ?`)
        sqlParams.push(searchNum)
      }
    }

    const whereParts: string[] = []
    if (dateClauses.length) whereParts.push(dateClauses.join(" AND "))
    if (categoryClauses.length) whereParts.push(categoryClauses.join(" AND "))
    if (searchClauses.length) whereParts.push(`(${searchClauses.join(" OR ")})`)
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : ""

    const projectRows: ProjectGroupRow[] = await db.$queryRawUnsafe(
      `SELECT e."projectId" AS projectId, p.name AS "projectName", p.budget AS budget,
              COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count
       FROM "Expense" e
       LEFT JOIN "Project" p ON e."projectId" = p.id
       LEFT JOIN "User" u ON e."employeeId" = u.id
       ${whereSql}
       GROUP BY e."projectId"
       ORDER BY total DESC`,
      ...sqlParams
    )

    const byProject = projectRows.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName || "Unassigned",
      total: Number(row.total) || 0,
      count: Number(row.count) || 0,
      budget: row.budget !== null ? Number(row.budget) : null,
    }))

    // 3) Totals via aggregate — authoritative count and sum across the full filtered set.
    const totals = await db.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    })

    const totalExpenses = totals._sum.amount ?? 0
    const totalEntries = totals._count

    return NextResponse.json({
      byCategory,
      byProject,
      totalExpenses,
      totalEntries,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
