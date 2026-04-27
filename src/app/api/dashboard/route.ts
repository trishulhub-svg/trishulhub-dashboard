import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [
    agents,
    projects,
    clients,
    leads,
    invoices,
    expenses,
    apiKeys,
    usageLogs,
    supportTickets,
    tasks,
  ] = await Promise.all([
    db.agent.findMany({ include: { apiKey: true } }),
    db.project.findMany({ include: { client: true, tasks: true } }),
    db.client.findMany(),
    db.lead.findMany(),
    db.invoice.findMany(),
    db.expense.findMany(),
    db.apiKey.findMany(),
    db.apiUsageLog.findMany({ include: { agent: true } }),
    db.supportTicket.findMany(),
    db.task.findMany(),
  ])

  const totalRevenue = invoices.filter(i => i.status === "PAID").reduce((sum, i) => sum + i.total, 0)
  const pendingAmount = invoices.filter(i => i.status === "SENT").reduce((sum, i) => sum + i.total, 0)
  const overdueAmount = invoices.filter(i => i.status === "OVERDUE").reduce((sum, i) => sum + i.total, 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalApiSpend = apiKeys.reduce((sum, k) => sum + k.currentSpend, 0)
  const monthlyBudget = apiKeys.reduce((sum, k) => sum + k.monthlyBudget, 0)

  const newLeadsCount = leads.filter(l => l.status === "NEW").length
  const activeProjects = projects.filter(p => !["COMPLETED", "DEPLOYED"].includes(p.status)).length
  const openTickets = supportTickets.filter(t => t.status === "OPEN").length
  const pendingTasks = tasks.filter(t => t.status !== "DONE").length

  return NextResponse.json({
    agents,
    projects,
    clients,
    leads,
    invoices,
    expenses,
    apiKeys,
    usageLogs,
    supportTickets,
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
