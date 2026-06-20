import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { ensureAllTables } from "@/lib/auto-migrate"

function sanitizeForJson(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJson);
  const result: Record<string, any> = {};
  for (const key in obj) { result[key] = sanitizeForJson(obj[key]); }
  return result;
}

// Lightweight stats endpoint for the finance Overview tab.
// Only runs 7 queries instead of the full dashboard's 19 — significantly faster.
export async function GET() {
  try {
    const [session, _migrateResult] = await Promise.all([
      getServerSession(authOptions),
      ensureAllTables().catch((err) => { console.error('[dashboard/stats] ensureAllTables failed:', err instanceof Error ? err.message : err) }),
    ])

    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    const userId = session.user.id
    if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = isAdmin(role)

    // For non-admin users, get their assigned client IDs
    const assignedClientIds = await getAssignedClientIds(userId, role)
    const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

    // Phase 7c: Pre-compute last 6 months of revenue + expense data so the finance
    // Overview chart renders accurate monthly totals. The previous approach fetched
    // only the 10 most recent invoices + 50 most recent expenses, which silently
    // undercounted any month with more activity than the cap.
    //
    // Run all 12 monthly aggregate queries in parallel for speed (2 queries × 6 months).
    const now = new Date()
    const monthBoundaries: Array<{ start: Date; end: Date; label: string }> = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const monthLabel = monthStart.toLocaleString("default", { month: "short" })
      monthBoundaries.push({ start: monthStart, end: monthEnd, label: monthLabel })
    }

    const monthlyAggResults = await Promise.all(
      monthBoundaries.map(async ({ start, end, label }) => {
        const [revAgg, expAgg] = await Promise.all([
          admin
            ? db.invoice.aggregate({
                where: {
                  ...invoiceWhere,
                  status: "PAID",
                  OR: [
                    { paidAt: { gte: start, lt: end } },
                    {
                      paidAt: null,
                      updatedAt: { gte: start, lt: end },
                      status: "PAID",
                    },
                  ],
                },
                _sum: { total: true },
              }).then((r) => r._sum.total || 0)
            : Promise.resolve(0),
          // INTENTIONAL: Global aggregate for admin reporting — matches the existing
          // totalExpenses behavior. Non-admin users get 0 (finance page is admin-only).
          admin
            ? db.expense.aggregate({
                where: { date: { gte: start, lt: end } },
                _sum: { amount: true },
              }).then((r) => r._sum.amount || 0)
            : Promise.resolve(0),
        ])
        return { month: label, revenue: revAgg, expenses: expAgg }
      })
    )

    // All 7 queries run in parallel (vs 19 in full dashboard endpoint)
    const [
      totalRevenue,
      pendingAmount,
      overdueAmount,
      totalExpenses,
      totalApiSpend,
      invoices,
      recentExpenses,
    ] = await Promise.all([
      // 5 aggregate queries
      admin
        ? db.invoice.aggregate({ where: { ...invoiceWhere, status: "PAID" }, _sum: { total: true } }).then(r => r._sum.total || 0)
        : Promise.resolve(0),
      admin
        ? db.invoice.aggregate({ where: { ...invoiceWhere, status: "SENT" }, _sum: { total: true } }).then(r => r._sum.total || 0)
        : Promise.resolve(0),
      admin
        ? db.invoice.aggregate({ where: { ...invoiceWhere, status: "OVERDUE" }, _sum: { total: true } }).then(r => r._sum.total || 0)
        : Promise.resolve(0),
      // INTENTIONAL: Global aggregate with no where clause — this is the finance overview
      // endpoint, which shows total expenses across all projects for admin reporting.
      admin
        ? db.expense.aggregate({ _sum: { amount: true } }).then(r => r._sum.amount || 0)
        : Promise.resolve(0),
      admin
        ? db.apiKey.aggregate({ _sum: { currentSpend: true } }).then(r => r._sum.currentSpend || 0)
        : Promise.resolve(0),
      // Recent invoices for "Recent Invoices" list (10 records, select-only)
      admin
        ? db.invoice.findMany({
            where: invoiceWhere,
            take: 10,
            orderBy: { createdAt: "desc" },
            select: { id: true, invoiceNumber: true, status: true, total: true, client: { select: { name: true } }, dueDate: true, paidAt: true, createdAt: true },
          })
        : Promise.resolve([] as unknown[]),
      // Recent expenses for chart data (50 records, select-only)
      // NOTE: Kept for backward compatibility with any callers that read `data.expenses`.
      // The Overview tab now uses `monthlyAggregates` for accurate chart data.
      admin
        ? db.expense.findMany({
            take: 50,
            orderBy: { date: "desc" },
            select: { id: true, category: true, description: true, amount: true, date: true },
          })
        : Promise.resolve([] as unknown[]),
    ])

    const stats = { totalRevenue, pendingAmount, overdueAmount, totalExpenses, totalApiSpend }

    return NextResponse.json(sanitizeForJson({
      stats,
      invoices,
      expenses: recentExpenses,
      // Phase 7c: Accurate monthly revenue + expense aggregates for the Overview chart.
      monthlyAggregates: monthlyAggResults,
    }))
  } catch (error: unknown) {
    console.error("[dashboard/stats] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load finance stats" }, { status: 500 })
  }
}
