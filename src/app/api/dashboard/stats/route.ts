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
      admin
        ? db.expense.findMany({
            take: 50,
            orderBy: { date: "desc" },
            select: { id: true, category: true, description: true, amount: true, date: true },
          })
        : Promise.resolve([] as unknown[]),
    ])

    const stats = { totalRevenue, pendingAmount, overdueAmount, totalExpenses, totalApiSpend }

    return NextResponse.json(sanitizeForJson({ stats, invoices, expenses: recentExpenses }))
  } catch (error: unknown) {
    console.error("[dashboard/stats] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load finance stats" }, { status: 500 })
  }
}
