import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
function sanitizeForJson(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJson);
  const result: Record<string, any> = {};
  for (const key in obj) { result[key] = sanitizeForJson(obj[key]); }
  return result;
}

function getMonthlyINR(amount: number, exchangeRate: number, frequency: string): number {
  const inrAmount = amount * (exchangeRate || 1)
  if (frequency === "YEARLY") return inrAmount / 12
  return inrAmount
}

// Lightweight stats endpoint for the finance Overview tab.
// Skip ensureAllTables here — migrations run on app boot / other routes.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

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

    // All queries run in parallel (no full expense list — charts use monthlyAggregates)
    const [
      totalRevenue,
      pendingAmount,
      overdueAmount,
      totalExpenses,
      invoices,
      activeSubscriptions,
    ] = await Promise.all([
      admin
        ? db.invoice.aggregate({ where: { ...invoiceWhere, status: "PAID" }, _sum: { total: true } }).then(r => r._sum.total || 0)
        : Promise.resolve(0),
      admin
        ? db.invoice.aggregate({ where: { ...invoiceWhere, status: "SENT" }, _sum: { total: true } }).then(r => r._sum.total || 0)
        : Promise.resolve(0),
      admin
        ? db.invoice.aggregate({ where: { ...invoiceWhere, status: "OVERDUE" }, _sum: { total: true } }).then(r => r._sum.total || 0)
        : Promise.resolve(0),
      admin
        ? db.expense.aggregate({ _sum: { amount: true } }).then(r => r._sum.amount || 0)
        : Promise.resolve(0),
      admin
        ? db.invoice.findMany({
            where: invoiceWhere,
            take: 10,
            orderBy: { createdAt: "desc" },
            select: { id: true, invoiceNumber: true, status: true, total: true, client: { select: { name: true } }, dueDate: true, paidAt: true, createdAt: true },
          })
        : Promise.resolve([] as unknown[]),
      admin
        ? db.subscription.findMany({
            where: { status: "ACTIVE", frequency: { in: ["MONTHLY", "YEARLY"] } },
            select: { amount: true, exchangeRate: true, frequency: true },
            take: 500,
          })
        : Promise.resolve([] as { amount: number; exchangeRate: number | null; frequency: string }[]),
    ])

    const subscriptionMonthlyCost = (activeSubscriptions as { amount: number; exchangeRate: number | null; frequency: string }[])
      .reduce((sum, s) => sum + getMonthlyINR(s.amount, s.exchangeRate || 1, s.frequency), 0)

    const stats = { totalRevenue, pendingAmount, overdueAmount, totalExpenses, subscriptionMonthlyCost }

    return NextResponse.json(sanitizeForJson({
      stats,
      invoices,
      expenses: [],
      subscriptionMonthlyCost,
      monthlyAggregates: monthlyAggResults,
    }))
  } catch (error: unknown) {
    console.error("[dashboard/stats] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load finance stats" }, { status: 500 })
  }
}
