import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { ensureAllTables } from "@/lib/auto-migrate"

// Lightweight stats endpoint for the finance Overview tab.
// Only runs 7 queries instead of the full dashboard's 19 — significantly faster.
export async function GET() {
  try {
    const [session, _migrateResult] = await Promise.all([
      getServerSession(authOptions),
      ensureAllTables().catch(() => {}),
    ])

    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    const userId = session.user.id
    if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = isAdmin(role)

    // For non-admin users, get their assigned client IDs
    const assignedClientIds = await getAssignedClientIds(userId, role)
    const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

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
      admin
        ? db.expense.findMany({
            take: 50,
            orderBy: { date: "desc" },
            select: { id: true, category: true, description: true, amount: true, date: true },
          })
        : Promise.resolve([] as unknown[]),
    ])

    const stats = { totalRevenue, pendingAmount, overdueAmount, totalExpenses, totalApiSpend }

    return NextResponse.json(JSON.parse(JSON.stringify({ stats, invoices, expenses: recentExpenses })))
  } catch (error: unknown) {
    console.error("[dashboard/stats] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load finance stats" }, { status: 500 })
  }
}
