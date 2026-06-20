import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds, getAssignedClientIds } from "@/lib/rbac"
import { ensureAllTables } from "@/lib/auto-migrate"

function sanitizeForJson(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJson);
  const result: Record<string, any> = {};
  for (const key in obj) { result[key] = sanitizeForJson(obj[key]); }
  return result;
}

export async function GET() {
  try {
    // PERF: Run auth + rbac + auto-migrate in parallel
    const [session, _migrateResult] = await Promise.all([
      getServerSession(authOptions),
      ensureAllTables().catch((err) => { console.error('[dashboard] ensureAllTables failed:', err instanceof Error ? err.message : err) }),
    ])

    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    const userId = session.user.id
    if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = isAdmin(role)

    // PERF: Run rbac checks in parallel
    const [assignedProjectIds, assignedClientIds] = await Promise.all([
      getAssignedProjectIds(userId, role),
      getAssignedClientIds(userId, role),
    ])

    // Build where clauses based on role.
    // Task 7 (Phase 4): main dashboard excludes demo projects from both the
    // recent-projects list and the "Active Projects" count so demos don't
    // inflate headline metrics. Demo projects are still fully visible on
    // /dashboard/demo — this filter only affects the main dashboard tiles.
    const projectWhere = assignedProjectIds
      ? { id: { in: assignedProjectIds }, isDemo: false }
      : { isDemo: false }
    const clientWhere = assignedClientIds ? { id: { in: assignedClientIds } } : {}
    const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
    const expenseWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
    const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

    // PERF: Single Promise.all — everything parallel including leads + aggregates
    const [
      projects,
      clients,
      invoices,
      expenses,
      apiKeys,
      supportTickets,
      leads,
      newLeadsCount,
      activeProjects,
      openTickets,
      totalLeadsCount,
      totalClientCount,
      totalRevenue,
      pendingAmount,
      overdueAmount,
      totalExpenses,
    ] = await Promise.all([
      db.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, status: true, progress: true, deadline: true, client: { select: { name: true } } },
        take: 10,
        orderBy: { updatedAt: "desc" },
      }),
      db.client.findMany({ where: clientWhere, take: 10, select: { id: true, name: true, status: true, company: true } }),
      db.invoice.findMany({ where: invoiceWhere, take: 5, orderBy: { createdAt: "desc" }, select: { id: true, invoiceNumber: true, total: true, status: true, createdAt: true } }),
      db.expense.findMany({ where: expenseWhere, take: 5, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, category: true, createdAt: true } }),
      // API keys — exclude keyValue for non-SUPER_ADMIN to avoid exposing secrets in memory
      role === "SUPER_ADMIN"
        ? db.apiKey.findMany({ select: { id: true, keyName: true, currentSpend: true, monthlyBudget: true, provider: true, status: true, createdAt: true } })
        : admin
          ? db.apiKey.findMany({ select: { id: true, keyName: true, currentSpend: true, monthlyBudget: true, provider: true, status: true } })
          : Promise.resolve([] as unknown[]),
      // Usage logs removed from dashboard — not displayed, saves a query
      db.supportTicket.findMany({ where: ticketWhere, take: 5, include: { client: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      // PERF: Leads query moved into Promise.all (was sequential before)
      admin ? db.lead.findMany({ where: { status: "NEW" }, take: 10 }) : Promise.resolve([] as unknown[]),
      // Counts
      ...(admin ? [
        db.lead.count({ where: { status: "NEW" } }),
        db.project.count({ where: { ...projectWhere, status: { notIn: ["COMPLETED", "DEPLOYED"] } } }),
        db.supportTicket.count({ where: { ...ticketWhere, status: "OPEN" } }),
        db.lead.count(),
        db.client.count({ where: clientWhere }),
      ] : [
        Promise.resolve(0), // leads not shown to developers
        db.project.count({ where: { ...projectWhere, status: { notIn: ["COMPLETED", "DEPLOYED"] } } }),
        db.supportTicket.count({ where: { ...ticketWhere, status: "OPEN" } }),
        Promise.resolve(0),
        Promise.resolve(0),
      ]),
      // PERF: Aggregate queries moved into Promise.all (were sequential before)
      ...(admin ? [
        db.invoice.aggregate({ where: { ...invoiceWhere, status: "PAID" }, _sum: { total: true } }).then(r => r._sum.total || 0),
        db.invoice.aggregate({ where: { ...invoiceWhere, status: "SENT" }, _sum: { total: true } }).then(r => r._sum.total || 0),
        db.invoice.aggregate({ where: { ...invoiceWhere, status: "OVERDUE" }, _sum: { total: true } }).then(r => r._sum.total || 0),
        db.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }).then(r => r._sum.amount || 0),
      ] : [
        Promise.resolve(0), Promise.resolve(0), Promise.resolve(0), Promise.resolve(0),
      ]),
    ])

    // SECURITY: API keys — SUPER_ADMIN sees masked values; other admins don't receive keyValue at all
    const safeApiKeys = role === "SUPER_ADMIN"
      ? (apiKeys as Array<{ id: string; keyName: string; keyValue?: string; currentSpend: number; monthlyBudget: number; provider: string; status: string }>).map(k => ({ ...k, keyValue: k.keyValue ? `****${k.keyValue.slice(-4)}` : "" }))
      : admin
        ? apiKeys
        : []

    const totalApiSpend = admin ? (apiKeys as Array<{ currentSpend: number }>).reduce((sum, k) => sum + k.currentSpend, 0) : 0
    const monthlyBudget = admin ? (apiKeys as Array<{ monthlyBudget: number }>).reduce((sum, k) => sum + k.monthlyBudget, 0) : 0
    const totalLeads = totalLeadsCount

    const safeResponse = sanitizeForJson({
      projects,
      clients: admin ? clients : (clients as Array<{ id: string; name: string; company: string }>).map(c => ({ id: c.id, name: c.name, company: c.company })),
      leads,
      invoices: admin ? invoices : [],
      expenses: admin ? expenses : [],
      apiKeys: safeApiKeys,
      supportTickets: admin ? supportTickets : [],
      stats: {
        totalRevenue,
        pendingAmount,
        overdueAmount,
        totalExpenses,
        totalApiSpend,
        monthlyBudget,
        newLeadsCount,
        activeProjects,
        openTickets,
        totalClients: admin ? totalClientCount : 0,
        totalLeads,
      },
    });

    return NextResponse.json(safeResponse)
  } catch (error: unknown) {
    console.error("[dashboard] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
