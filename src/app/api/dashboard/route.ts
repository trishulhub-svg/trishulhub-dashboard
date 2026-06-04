import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds, getAssignedClientIds } from "@/lib/rbac"
import { ensureAllTables } from "@/lib/auto-migrate"

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

    // Build where clauses based on role
    const projectWhere = assignedProjectIds ? { id: { in: assignedProjectIds } } : {}
    const clientWhere = assignedClientIds ? { id: { in: assignedClientIds } } : {}
    const taskWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
    const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
    const expenseWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
    const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

    // For developers: only fetch agents they have access to
    const agentWhere = !admin
      ? { userAccess: { some: { userId, canView: true } } }
      : {}

    // PERF: Single Promise.all — everything parallel including leads + aggregates
    const [
      agents,
      projects,
      clients,
      invoices,
      expenses,
      apiKeys,
      usageLogs,
      supportTickets,
      tasks,
      leads,
      newLeadsCount,
      activeProjects,
      openTickets,
      pendingTasks,
      totalRevenue,
      pendingAmount,
      overdueAmount,
      totalExpenses,
    ] = await Promise.all([
      db.agent.findMany({
        where: agentWhere,
        include: { apiKey: { select: { id: true, keyName: true, provider: true, status: true, currentSpend: true, monthlyBudget: true } } },
      }),
      db.project.findMany({
        where: projectWhere,
        include: { client: true, _count: { select: { tasks: true } } },
        take: 50,
      }),
      db.client.findMany({ where: clientWhere, take: 50 }),
      db.invoice.findMany({ where: invoiceWhere, take: 20, orderBy: { createdAt: "desc" } }),
      db.expense.findMany({ where: expenseWhere, take: 20, orderBy: { createdAt: "desc" } }),
      // API keys are SUPER_ADMIN only in the dashboard view
      admin ? db.apiKey.findMany() : Promise.resolve([] as unknown[]),
      db.apiUsageLog.findMany({
        where: !admin ? { agent: { userAccess: { some: { userId, canView: true } } } } : {},
        include: { agent: { select: { id: true, name: true, type: true } } },
        take: 30,
        orderBy: { createdAt: "desc" },
      }),
      db.supportTicket.findMany({ where: ticketWhere, include: { client: true }, take: 50 }),
      db.task.findMany({ where: taskWhere, take: 50, orderBy: { createdAt: "desc" } }),
      // PERF: Leads query moved into Promise.all (was sequential before)
      admin ? db.lead.findMany({ where: { status: "NEW" }, take: 10 }) : Promise.resolve([] as unknown[]),
      // Counts
      ...(admin ? [
        db.lead.count({ where: { status: "NEW" } }),
        db.project.count({ where: { ...projectWhere, status: { notIn: ["COMPLETED", "DEPLOYED"] } } }),
        db.supportTicket.count({ where: { ...ticketWhere, status: "OPEN" } }),
        db.task.count({ where: { ...taskWhere, status: { not: "DONE" } } }),
      ] : [
        Promise.resolve(0), // leads not shown to developers
        db.project.count({ where: { ...projectWhere, status: { notIn: ["COMPLETED", "DEPLOYED"] } } }),
        db.supportTicket.count({ where: { ...ticketWhere, status: "OPEN" } }),
        db.task.count({ where: { ...taskWhere, status: { not: "DONE" } } }),
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

    // SECURITY: API keys visible only to SUPER_ADMIN
    const safeApiKeys = role === "SUPER_ADMIN"
      ? apiKeys
      : admin
        ? (apiKeys as Array<{ id: string; keyName: string; keyValue?: string; currentSpend: number; monthlyBudget: number }>).map(k => ({ ...k, keyValue: k.keyValue ? `${k.keyValue.substring(0, 6)}...${k.keyValue.slice(-4)}` : "" }))
        : []

    // Usage logs — same shape for all roles (agent details are already limited by include)
    const safeUsageLogs = (usageLogs as Array<{ id: string; model: string; inputTokens: number; outputTokens: number; cost: number; createdAt: Date; agent: { id: string; name: string; type: string } }>).map(log => ({
      id: log.id,
      model: log.model,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      cost: log.cost,
      createdAt: log.createdAt,
      agent: log.agent,
    }))

    const totalApiSpend = admin ? (apiKeys as Array<{ currentSpend: number }>).reduce((sum, k) => sum + k.currentSpend, 0) : 0
    const monthlyBudget = admin ? (apiKeys as Array<{ monthlyBudget: number }>).reduce((sum, k) => sum + k.monthlyBudget, 0) : 0
    const totalLeads = admin ? (newLeadsCount + leads.length) : 0

    // ZAI FIX #310: JSON round-trip to strip ALL non-serializable values
    const safeResponse = JSON.parse(JSON.stringify({
      agents,
      projects,
      clients: admin ? clients : (clients as Array<{ id: string; name: string; company: string }>).map(c => ({ id: c.id, name: c.name, company: c.company })),
      leads,
      invoices: admin ? invoices : [],
      expenses: admin ? expenses : [],
      apiKeys: safeApiKeys,
      usageLogs: safeUsageLogs,
      supportTickets: admin ? supportTickets : [],
      tasks,
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
        pendingTasks,
        totalClients: admin ? (clients as unknown[]).length : 0,
        totalLeads,
      },
    }))

    return NextResponse.json(safeResponse)
  } catch (error: unknown) {
    console.error("[dashboard] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
