import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, isAdminOrProjectManager, getAssignedProjectIds, getAssignedClientIds } from "@/lib/rbac"

// PERF: Allow up to 15s for the dashboard route
export const maxDuration = 15

function sanitizeForJson(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJson);
  const result: Record<string, any> = {};
  for (const key in obj) { result[key] = sanitizeForJson(obj[key]); }
  return result;
}

// Safe query helper — returns empty array/0 on error instead of crashing
async function safeQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.warn(`[dashboard] Query "${label}" failed (non-fatal):`, err instanceof Error ? err.message : String(err))
    return fallback
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    const userId = session.user.id
    if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = isAdmin(role)
    const adminOrPm = isAdminOrProjectManager(role)

    // Run rbac checks in parallel
    const [assignedProjectIds, assignedClientIds] = await Promise.all([
      getAssignedProjectIds(userId, role),
      getAssignedClientIds(userId, role),
    ])

    // Build where clauses — NO isDemo filter (column may not exist in all DBs)
    const projectWhere = assignedProjectIds ? { id: { in: assignedProjectIds } } : {}
    const clientWhere = assignedClientIds ? { id: { in: assignedClientIds } } : {}
    const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
    const expenseWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
    const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
    const memberWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}

    // At-risk: open projects with a deadline on or before end of today
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    // Each query wrapped in safeQuery — if one fails, dashboard still loads with partial data
    const [
      projects, clients, invoices, expenses, supportTickets, leads,
      newLeadsCount, activeProjects, atRiskProjects, openTickets, totalLeadsCount, totalClientCount,
      totalRevenue, pendingAmount, overdueAmount, totalExpenses, teamMembers,
    ] = await Promise.all([
      safeQuery(() => db.project.findMany({
        where: projectWhere,
        select: {
          id: true, name: true, status: true, progress: true, deadline: true,
          client: { select: { name: true } },
          _count: { select: { members: true } },
        },
        take: 10, orderBy: { updatedAt: "desc" },
      }), [] as unknown[], "projects"),

      safeQuery(() => db.client.findMany({
        where: clientWhere, take: 10,
        select: { id: true, name: true, status: true, company: true },
      }), [] as unknown[], "clients"),

      admin
        ? safeQuery(() => db.invoice.findMany({
            where: invoiceWhere, take: 5, orderBy: { createdAt: "desc" },
            select: {
              id: true, invoiceNumber: true, total: true, status: true, createdAt: true, dueDate: true,
              client: { select: { name: true } },
            },
          }), [] as unknown[], "invoices")
        : Promise.resolve([] as unknown[]),

      admin
        ? safeQuery(() => db.expense.findMany({
            where: expenseWhere, take: 5, orderBy: { createdAt: "desc" },
            select: { id: true, amount: true, category: true, createdAt: true },
          }), [] as unknown[], "expenses")
        : Promise.resolve([] as unknown[]),

      admin
        ? safeQuery(() => db.supportTicket.findMany({
            where: ticketWhere, take: 5, include: { client: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          }), [] as unknown[], "supportTickets")
        : Promise.resolve([] as unknown[]),

      admin
        ? safeQuery(() => db.lead.findMany({ where: { status: "NEW" }, take: 10 }), [] as unknown[], "leads")
        : Promise.resolve([] as unknown[]),

      admin
        ? safeQuery(() => db.lead.count({ where: { status: "NEW" } }), 0, "newLeadsCount")
        : Promise.resolve(0),

      safeQuery(() => db.project.count({
        where: { ...projectWhere, status: { notIn: ["COMPLETED", "DEPLOYED"] } },
      }), 0, "activeProjects"),

      safeQuery(() => db.project.count({
        where: {
          ...projectWhere,
          status: { notIn: ["COMPLETED", "DEPLOYED"] },
          deadline: { lte: endOfToday },
        },
      }), 0, "atRiskProjects"),

      admin
        ? safeQuery(() => db.supportTicket.count({ where: { ...ticketWhere, status: "OPEN" } }), 0, "openTickets")
        : Promise.resolve(0),

      admin
        ? safeQuery(() => db.lead.count(), 0, "totalLeads")
        : Promise.resolve(0),

      admin
        ? safeQuery(() => db.client.count({ where: clientWhere }), 0, "totalClients")
        : Promise.resolve(0),

      admin
        ? safeQuery(() => db.invoice.aggregate({
            where: { ...invoiceWhere, status: "PAID" }, _sum: { total: true },
          }).then(r => r._sum.total || 0), 0, "totalRevenue")
        : Promise.resolve(0),

      admin
        ? safeQuery(() => db.invoice.aggregate({
            where: { ...invoiceWhere, status: "SENT" }, _sum: { total: true },
          }).then(r => r._sum.total || 0), 0, "pendingAmount")
        : Promise.resolve(0),

      admin
        ? safeQuery(() => db.invoice.aggregate({
            where: { ...invoiceWhere, status: "OVERDUE" }, _sum: { total: true },
          }).then(r => r._sum.total || 0), 0, "overdueAmount")
        : Promise.resolve(0),

      admin
        ? safeQuery(() => db.expense.aggregate({
            where: expenseWhere, _sum: { amount: true },
          }).then(r => r._sum.amount || 0), 0, "totalExpenses")
        : Promise.resolve(0),

      // Team member seats across visible projects (PM delivery KPI; admins get it too)
      adminOrPm
        ? safeQuery(() => db.projectMember.count({ where: memberWhere }), 0, "teamMembers")
        : Promise.resolve(0),
    ])

    const safeResponse = sanitizeForJson({
      role,
      projects,
      clients: admin ? clients : (clients as Array<{ id: string; name: string; company: string }>).map(c => ({ id: c.id, name: c.name, company: c.company })),
      leads,
      invoices: admin ? invoices : [],
      expenses: admin ? expenses : [],
      supportTickets: admin ? supportTickets : [],
      stats: {
        totalRevenue, pendingAmount, overdueAmount, totalExpenses,
        newLeadsCount, activeProjects, atRiskProjects, openTickets,
        totalClients: admin ? totalClientCount : 0,
        totalLeads: totalLeadsCount,
        teamMembers: adminOrPm ? teamMembers : 0,
      },
    })

    return NextResponse.json(safeResponse)
  } catch (error: unknown) {
    console.error("[dashboard] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
