/**
 * Shared dashboard payload builder — used by /api/dashboard and /api/bootstrap/home.
 * Preserves the same RBAC field stripping as the original dashboard GET.
 */
import { db } from "@/lib/db"
import { isAdmin, isAdminOrProjectManager, getAssignedProjectIds, getAssignedClientIds } from "@/lib/rbac"

function sanitizeForJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(sanitizeForJson)
  const result: Record<string, unknown> = {}
  for (const key in obj as Record<string, unknown>) {
    result[key] = sanitizeForJson((obj as Record<string, unknown>)[key])
  }
  return result
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.warn(
      `[dashboard] Query "${label}" failed (non-fatal):`,
      err instanceof Error ? err.message : String(err)
    )
    return fallback
  }
}

export async function loadDashboardPayload(userId: string, role: string) {
  if (role === "CLIENT") {
    return { error: "Unauthorized" as const, status: 401 as const }
  }

  const admin = isAdmin(role)
  const adminOrPm = isAdminOrProjectManager(role)

  const [assignedProjectIds, assignedClientIds] = await Promise.all([
    getAssignedProjectIds(userId, role),
    getAssignedClientIds(userId, role),
  ])

  const projectWhere = assignedProjectIds ? { id: { in: assignedProjectIds } } : {}
  const clientWhere = assignedClientIds ? { id: { in: assignedClientIds } } : {}
  const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
  const expenseWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}
  const ticketWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
  const memberWhere = assignedProjectIds ? { projectId: { in: assignedProjectIds } } : {}

  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const [
    projects,
    clients,
    invoices,
    expenses,
    supportTickets,
    leads,
    newLeadsCount,
    activeProjects,
    atRiskProjects,
    openTickets,
    totalLeadsCount,
    totalClientCount,
    totalRevenue,
    pendingAmount,
    overdueAmount,
    totalExpenses,
    teamMembers,
  ] = await Promise.all([
    safeQuery(
      () =>
        db.project.findMany({
          where: projectWhere,
          select: {
            id: true,
            name: true,
            status: true,
            progress: true,
            deadline: true,
            client: { select: { name: true } },
            _count: { select: { members: true } },
          },
          take: 10,
          orderBy: { updatedAt: "desc" },
        }),
      [] as unknown[],
      "projects"
    ),

    safeQuery(
      () =>
        db.client.findMany({
          where: clientWhere,
          take: 10,
          select: { id: true, name: true, status: true, company: true },
        }),
      [] as unknown[],
      "clients"
    ),

    admin
      ? safeQuery(
          () =>
            db.invoice.findMany({
              where: invoiceWhere,
              take: 5,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                invoiceNumber: true,
                total: true,
                status: true,
                createdAt: true,
                dueDate: true,
                client: { select: { name: true } },
              },
            }),
          [] as unknown[],
          "invoices"
        )
      : Promise.resolve([] as unknown[]),

    admin
      ? safeQuery(
          () =>
            db.expense.findMany({
              where: expenseWhere,
              take: 5,
              orderBy: { createdAt: "desc" },
              select: { id: true, amount: true, category: true, createdAt: true },
            }),
          [] as unknown[],
          "expenses"
        )
      : Promise.resolve([] as unknown[]),

    admin
      ? safeQuery(
          () =>
            db.supportTicket.findMany({
              where: ticketWhere,
              take: 5,
              include: { client: { select: { name: true } } },
              orderBy: { createdAt: "desc" },
            }),
          [] as unknown[],
          "supportTickets"
        )
      : Promise.resolve([] as unknown[]),

    admin
      ? safeQuery(() => db.lead.findMany({ where: { status: "NEW" }, take: 10 }), [] as unknown[], "leads")
      : Promise.resolve([] as unknown[]),

    admin
      ? safeQuery(() => db.lead.count({ where: { status: "NEW" } }), 0, "newLeadsCount")
      : Promise.resolve(0),

    safeQuery(
      () =>
        db.project.count({
          where: { ...projectWhere, status: { notIn: ["COMPLETED", "DEPLOYED"] } },
        }),
      0,
      "activeProjects"
    ),

    safeQuery(
      () =>
        db.project.count({
          where: {
            ...projectWhere,
            status: { notIn: ["COMPLETED", "DEPLOYED"] },
            deadline: { lte: endOfToday },
          },
        }),
      0,
      "atRiskProjects"
    ),

    admin
      ? safeQuery(
          () => db.supportTicket.count({ where: { ...ticketWhere, status: "OPEN" } }),
          0,
          "openTickets"
        )
      : Promise.resolve(0),

    admin ? safeQuery(() => db.lead.count(), 0, "totalLeads") : Promise.resolve(0),

    admin
      ? safeQuery(() => db.client.count({ where: clientWhere }), 0, "totalClients")
      : Promise.resolve(0),

    admin
      ? safeQuery(
          () =>
            db.invoice
              .aggregate({
                where: { ...invoiceWhere, status: "PAID" },
                _sum: { total: true },
              })
              .then((r) => r._sum.total || 0),
          0,
          "totalRevenue"
        )
      : Promise.resolve(0),

    admin
      ? safeQuery(
          () =>
            db.invoice
              .aggregate({
                where: { ...invoiceWhere, status: "SENT" },
                _sum: { total: true },
              })
              .then((r) => r._sum.total || 0),
          0,
          "pendingAmount"
        )
      : Promise.resolve(0),

    admin
      ? safeQuery(
          () =>
            db.invoice
              .aggregate({
                where: { ...invoiceWhere, status: "OVERDUE" },
                _sum: { total: true },
              })
              .then((r) => r._sum.total || 0),
          0,
          "overdueAmount"
        )
      : Promise.resolve(0),

    admin
      ? safeQuery(
          () =>
            db.expense
              .aggregate({ where: expenseWhere, _sum: { amount: true } })
              .then((r) => r._sum.amount || 0),
          0,
          "totalExpenses"
        )
      : Promise.resolve(0),

    adminOrPm
      ? safeQuery(() => db.projectMember.count({ where: memberWhere }), 0, "teamMembers")
      : Promise.resolve(0),
  ])

  return {
    status: 200 as const,
    data: sanitizeForJson({
      role,
      projects,
      clients: admin
        ? clients
        : (clients as Array<{ id: string; name: string; company: string }>).map((c) => ({
            id: c.id,
            name: c.name,
            company: c.company,
          })),
      leads,
      invoices: admin ? invoices : [],
      expenses: admin ? expenses : [],
      supportTickets: admin ? supportTickets : [],
      stats: {
        totalRevenue,
        pendingAmount,
        overdueAmount,
        totalExpenses,
        newLeadsCount,
        activeProjects,
        atRiskProjects,
        openTickets,
        totalClients: admin ? totalClientCount : 0,
        totalLeads: totalLeadsCount,
        teamMembers: adminOrPm ? teamMembers : 0,
      },
    }),
  }
}

/** Self earnings only (non-cross-user). Same shape as /api/earnings for self. */
export async function loadSelfEarnings(userId: string) {
  const [salaryEntries, totalAgg] = await Promise.all([
    db.expense.findMany({
      where: { category: "SALARY", employeeId: userId },
      orderBy: { date: "desc" },
      take: 100,
      select: {
        id: true,
        description: true,
        amount: true,
        date: true,
        paymentRef: true,
        createdAt: true,
      },
    }),
    db.expense.aggregate({
      where: { category: "SALARY", employeeId: userId },
      _sum: { amount: true },
    }),
  ])

  // Amounts shown as GBP as-stored (no auto FX). Legacy INR rows should be edited to GBP.
  const total = Math.round((totalAgg._sum.amount || 0) * 100) / 100
  return {
    entries: salaryEntries,
    totalINR: total, // legacy field name — same as totalGBP
    totalGBP: total,
  }
}

/** This-week completed hours for the current user (developer home hint). */
export async function loadWeekHoursForUser(userId: string): Promise<number> {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const startDate = new Date(now)
  startDate.setDate(now.getDate() - diff)
  startDate.setHours(0, 0, 0, 0)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 7)

  const agg = await db.timeEntry.aggregate({
    where: {
      userId,
      status: "COMPLETED",
      date: { gte: startDate, lt: endDate },
    },
    _sum: { totalHours: true },
  })

  return Math.round((agg._sum.totalHours || 0) * 100) / 100
}
