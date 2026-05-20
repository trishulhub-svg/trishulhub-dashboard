import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getUserScope } from "@/lib/rbac"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    const userId = session.user.id
    if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = isAdmin(role)

    // Get project/client scope for developers (single DB call)
    const { projectIds: assignedProjectIds, clientIds: assignedClientIds } = await getUserScope(userId, role)

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

    // OPTIMIZATION: Use Prisma where clauses instead of JS-side filtering.
    // This reduces data transferred from Turso and avoids full-table scans.
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
      newLeadsCount,
      activeProjects,
      openTickets,
      pendingTasks,
    ] = await Promise.all([
      db.agent.findMany({
        where: agentWhere,
        include: { apiKey: { select: { id: true, keyName: true, provider: true, status: true, currentSpend: true, monthlyBudget: true } } },
        take: 100,
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
      admin ? db.apiKey.findMany({ take: 100 }) : Promise.resolve([]),
      db.apiUsageLog.findMany({
        where: !admin ? { agent: { userAccess: { some: { userId, canView: true } } } } : {},
        include: { agent: { select: { id: true, name: true, type: true } } },
        take: 30,
        orderBy: { createdAt: "desc" },
      }),
      db.supportTicket.findMany({ where: ticketWhere, include: { client: true }, take: 50 }),
      db.task.findMany({ where: taskWhere, take: 50, orderBy: { createdAt: "desc" } }),
      // OPTIMIZATION: Use count() instead of findMany+filter for aggregate queries
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
    ])

    // Leads are admin-only
    const leads = admin ? await db.lead.findMany({ where: { status: "NEW" }, take: 10 }) : []

    // SECURITY: API keys visible only to SUPER_ADMIN
    const safeApiKeys = role === "SUPER_ADMIN"
      ? apiKeys
      : admin
        ? apiKeys.map(k => ({ ...k, keyValue: k.keyValue ? `${k.keyValue.substring(0, 6)}...${k.keyValue.slice(-4)}` : "" }))
        : []

    // Usage logs — same shape for all roles (agent details are already limited by include)
    const safeUsageLogs = usageLogs.map(log => ({
      id: log.id,
      model: log.model,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      cost: log.cost,
      createdAt: log.createdAt,
      agent: log.agent,
    }))

    // Compute stats — invoices filtered by status via Prisma for efficiency
    const [totalRevenue, pendingAmount, overdueAmount, totalExpenses] = admin
      ? await Promise.all([
          db.invoice.aggregate({ where: { ...invoiceWhere, status: "PAID" }, _sum: { total: true } }).then(r => r._sum.total || 0),
          db.invoice.aggregate({ where: { ...invoiceWhere, status: "SENT" }, _sum: { total: true } }).then(r => r._sum.total || 0),
          db.invoice.aggregate({ where: { ...invoiceWhere, status: "OVERDUE" }, _sum: { total: true } }).then(r => r._sum.total || 0),
          db.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }).then(r => r._sum.amount || 0),
        ])
      : [0, 0, 0, 0]

    const totalApiSpend = admin ? apiKeys.reduce((sum, k) => sum + k.currentSpend, 0) : 0
    const monthlyBudget = admin ? apiKeys.reduce((sum, k) => sum + k.monthlyBudget, 0) : 0
    const totalLeads = admin ? (newLeadsCount + leads.length) : 0 // approximate

    // ZAI FIX #310: JSON round-trip to strip ALL non-serializable values
    // (Date objects, circular refs from deep includes, etc.)
    const safeResponse = JSON.parse(JSON.stringify({
      agents,
      projects,
      clients: admin ? clients : clients.map(c => ({ id: c.id, name: c.name, company: c.company })),
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
        totalClients: admin ? clients.length : 0,
        totalLeads,
      },
    }))

    return NextResponse.json(safeResponse)
  } catch (error: any) {
    console.error("[dashboard] GET error:", error?.message)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
