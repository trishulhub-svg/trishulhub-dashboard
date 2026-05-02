import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds, getAssignedClientIds } from "@/lib/rbac"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  const userId = (session.user as any).id
  if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Get project/client scope for developers
  const assignedProjectIds = await getAssignedProjectIds(userId, role)
  const assignedClientIds = await getAssignedClientIds(userId, role)

  // Build where clauses based on role
  const projectWhere = assignedProjectIds ? { id: { in: assignedProjectIds } } : {}
  const clientWhere = assignedClientIds ? { id: { in: assignedClientIds } } : {}
  const taskWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
  const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
  const expenseWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
  const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

  // For developers: only fetch agents they have access to
  const agentWhere = !isAdmin(role) 
    ? { userAccess: { some: { userId, canView: true } } } 
    : {}

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
  ] = await Promise.all([
    db.agent.findMany({ where: agentWhere, include: { apiKey: { select: { id: true, keyName: true, provider: true, status: true, currentSpend: true, monthlyBudget: true } } } }),
    db.project.findMany({ where: projectWhere, include: { client: true, tasks: true } }),
    db.client.findMany({ where: clientWhere }),
    db.invoice.findMany({ where: invoiceWhere }),
    db.expense.findMany({ where: expenseWhere }),
    db.apiKey.findMany(),
    db.apiUsageLog.findMany({ 
      where: !isAdmin(role) ? { agent: { userAccess: { some: { userId, canView: true } } } } : {},
      include: { agent: true } 
    }),
    db.supportTicket.findMany({ where: ticketWhere, include: { client: true } }),
    db.task.findMany({ where: taskWhere }),
  ])

  // Leads are admin-only - developers should NOT see leads
  const leads = isAdmin(role) ? await db.lead.findMany() : []

  // Fix #16: Mask API key values for non-SUPER_ADMIN users
  // SECURITY: Developers should NOT see API keys at all - that page is SUPER_ADMIN only
  const safeApiKeys = role === "SUPER_ADMIN"
    ? apiKeys
    : isAdmin(role)
      ? apiKeys.map(k => ({
          ...k,
          keyValue: k.keyValue ? `${k.keyValue.substring(0, 6)}...${k.keyValue.slice(-4)}` : "",
        }))
      : [] // Developers get no API key data

  // SECURITY: Developers should NOT see usage logs with full agent details
  const safeUsageLogs = isAdmin(role)
    ? usageLogs
    : usageLogs.map(log => ({
        id: log.id,
        model: log.model,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        cost: log.cost,
        createdAt: log.createdAt,
        agent: log.agent ? { id: log.agent.id, name: log.agent.name, type: log.agent.type } : null,
      }))

  const totalApiSpend = apiKeys.reduce((sum, k) => sum + k.currentSpend, 0)
  const monthlyBudget = apiKeys.reduce((sum, k) => sum + k.monthlyBudget, 0)

  // Only compute financial stats for admins
  const totalRevenue = isAdmin(role) ? invoices.filter(i => i.status === "PAID").reduce((sum, i) => sum + i.total, 0) : 0
  const pendingAmount = isAdmin(role) ? invoices.filter(i => i.status === "SENT").reduce((sum, i) => sum + i.total, 0) : 0
  const overdueAmount = isAdmin(role) ? invoices.filter(i => i.status === "OVERDUE").reduce((sum, i) => sum + i.total, 0) : 0
  const totalExpenses = isAdmin(role) ? expenses.reduce((sum, e) => sum + e.amount, 0) : 0

  const newLeadsCount = leads.filter(l => l.status === "NEW").length
  const activeProjects = projects.filter(p => !["COMPLETED", "DEPLOYED"].includes(p.status)).length
  const openTickets = supportTickets.filter(t => t.status === "OPEN").length
  const pendingTasks = tasks.filter(t => t.status !== "DONE").length

  return NextResponse.json({
    agents,
    projects,
    clients: isAdmin(role) ? clients : clients.map(c => ({ id: c.id, name: c.name, company: c.company })),
    leads,
    invoices: isAdmin(role) ? invoices : [],
    expenses: isAdmin(role) ? expenses : [],
    apiKeys: safeApiKeys,
    usageLogs: safeUsageLogs,
    supportTickets: isAdmin(role) ? supportTickets : [],
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
      totalClients: clients.length,
      totalLeads: leads.length,
    },
  })
}
