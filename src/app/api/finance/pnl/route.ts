import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessFinance } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { currencySymbol, normalizeCurrency } from "@/lib/money"

/** Rough reporting FX → GBP for mixed legacy rows (display helper only). */
const TO_GBP: Record<string, number> = {
  GBP: 1,
  INR: 1 / 105,
  USD: 0.79,
  EUR: 0.86,
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function yearKey(d: Date) {
  return String(d.getUTCFullYear())
}

type MonthRow = {
  key: string
  revenueGBP: number
  expensesGBP: number
  salaryGBP: number
  profitGBP: number
  lossGBP: number
  revenueNative: number
  expensesNative: number
  invoiceCount: number
  expenseCount: number
  auditEvents: number
  employeePerfGBP: number
  projectsCreated: number
  clientsCreated: number
  crmWon: number
  timeEntries: number
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canAccessFinance(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`pnl-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const categories = (searchParams.get("categories") || "profit,loss,revenue,expenses,salary")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const [invoices, expenses, projects, clients, timeEntries, deals, auditLogs] = await Promise.all([
      db.invoice.findMany({
        where: { status: "PAID" },
        select: { total: true, currency: true, paidAt: true, createdAt: true },
        take: 5000,
      }),
      db.expense.findMany({
        select: {
          amount: true,
          currency: true,
          date: true,
          category: true,
          employeeId: true,
        },
        take: 10000,
      }),
      db.project.findMany({
        select: { id: true, createdAt: true },
        take: 2000,
      }),
      db.client.findMany({
        select: { id: true, createdAt: true },
        take: 2000,
      }),
      db.timeEntry
        .findMany({
          select: { id: true, clockIn: true },
          take: 20000,
        })
        .catch(() => [] as Array<{ id: string; clockIn: Date }>),
      db.deal
        .findMany({
          select: { stage: true, createdAt: true },
          take: 2000,
        })
        .catch(() => [] as Array<{ stage: string; createdAt: Date }>),
      db.auditLog
        .findMany({
          select: { id: true, createdAt: true },
          take: 20000,
          orderBy: { createdAt: "desc" },
        })
        .catch(() => [] as Array<{ id: string; createdAt: Date }>),
    ])

    const months = new Map<string, MonthRow>()
    const ensure = (key: string): MonthRow => {
      if (!months.has(key)) {
        months.set(key, {
          key,
          revenueGBP: 0,
          expensesGBP: 0,
          salaryGBP: 0,
          profitGBP: 0,
          lossGBP: 0,
          revenueNative: 0,
          expensesNative: 0,
          invoiceCount: 0,
          expenseCount: 0,
          auditEvents: 0,
          employeePerfGBP: 0,
          projectsCreated: 0,
          clientsCreated: 0,
          crmWon: 0,
          timeEntries: 0,
        })
      }
      return months.get(key)!
    }

    for (const inv of invoices) {
      const when = inv.paidAt || inv.createdAt
      if (!when) continue
      const key = monthKey(new Date(when))
      const cur = normalizeCurrency(inv.currency)
      const row = ensure(key)
      const gbp = Number(inv.total || 0) * (TO_GBP[cur] ?? 1)
      row.revenueGBP += gbp
      row.revenueNative += Number(inv.total || 0)
      row.invoiceCount += 1
    }

    for (const exp of expenses) {
      if (!exp.date) continue
      const key = monthKey(new Date(exp.date))
      const cur = normalizeCurrency(exp.currency)
      const row = ensure(key)
      const gbp = Number(exp.amount || 0) * (TO_GBP[cur] ?? 1)
      row.expensesGBP += gbp
      row.expensesNative += Number(exp.amount || 0)
      row.expenseCount += 1
      if (String(exp.category).toUpperCase() === "SALARY") {
        row.salaryGBP += gbp
        if (exp.employeeId) row.employeePerfGBP += gbp
      }
    }

    for (const p of projects) {
      if (!p.createdAt) continue
      ensure(monthKey(new Date(p.createdAt))).projectsCreated += 1
    }
    for (const c of clients) {
      if (!c.createdAt) continue
      ensure(monthKey(new Date(c.createdAt))).clientsCreated += 1
    }
    for (const t of timeEntries) {
      if (!t.clockIn) continue
      ensure(monthKey(new Date(t.clockIn))).timeEntries += 1
    }
    for (const d of deals) {
      if (d.stage !== "CLOSED_WON" || !d.createdAt) continue
      ensure(monthKey(new Date(d.createdAt))).crmWon += 1
    }
    for (const a of auditLogs) {
      if (!a.createdAt) continue
      ensure(monthKey(new Date(a.createdAt))).auditEvents += 1
    }

    const series = [...months.values()]
      .map((m) => ({
        ...m,
        profitGBP: m.revenueGBP - m.expensesGBP,
        lossGBP: Math.max(0, m.expensesGBP - m.revenueGBP),
      }))
      .sort((a, b) => a.key.localeCompare(b.key))

    // Year rollup
    const yearsMap = new Map<string, MonthRow>()
    for (const m of series) {
      const y = m.key.slice(0, 4)
      if (!yearsMap.has(y)) {
        yearsMap.set(y, {
          key: y,
          revenueGBP: 0,
          expensesGBP: 0,
          salaryGBP: 0,
          profitGBP: 0,
          lossGBP: 0,
          revenueNative: 0,
          expensesNative: 0,
          invoiceCount: 0,
          expenseCount: 0,
          auditEvents: 0,
          employeePerfGBP: 0,
          projectsCreated: 0,
          clientsCreated: 0,
          crmWon: 0,
          timeEntries: 0,
        })
      }
      const yrow = yearsMap.get(y)!
      yrow.revenueGBP += m.revenueGBP
      yrow.expensesGBP += m.expensesGBP
      yrow.salaryGBP += m.salaryGBP
      yrow.revenueNative += m.revenueNative
      yrow.expensesNative += m.expensesNative
      yrow.invoiceCount += m.invoiceCount
      yrow.expenseCount += m.expenseCount
      yrow.auditEvents += m.auditEvents
      yrow.employeePerfGBP += m.employeePerfGBP
      yrow.projectsCreated += m.projectsCreated
      yrow.clientsCreated += m.clientsCreated
      yrow.crmWon += m.crmWon
      yrow.timeEntries += m.timeEntries
    }
    const years = [...yearsMap.values()]
      .map((y) => ({
        ...y,
        profitGBP: y.revenueGBP - y.expensesGBP,
        lossGBP: Math.max(0, y.expensesGBP - y.revenueGBP),
      }))
      .sort((a, b) => a.key.localeCompare(b.key))

    const totals = series.reduce(
      (acc, m) => {
        acc.revenueGBP += m.revenueGBP
        acc.expensesGBP += m.expensesGBP
        acc.salaryGBP += m.salaryGBP
        return acc
      },
      { revenueGBP: 0, expensesGBP: 0, salaryGBP: 0 }
    )

    const graphPoints = series.map((m) => {
      const point: Record<string, number | string> = { month: m.key }
      if (categories.includes("revenue") || categories.includes("profit")) {
        point.revenue = Math.round(m.revenueGBP * 100) / 100
      }
      if (categories.includes("expenses") || categories.includes("loss")) {
        point.expenses = Math.round(m.expensesGBP * 100) / 100
      }
      if (categories.includes("salary")) point.salary = Math.round(m.salaryGBP * 100) / 100
      if (categories.includes("profit")) point.profit = Math.round(m.profitGBP * 100) / 100
      if (categories.includes("loss")) point.loss = Math.round(m.lossGBP * 100) / 100
      if (categories.includes("projects")) point.projects = m.projectsCreated
      if (categories.includes("clients")) point.clients = m.clientsCreated
      if (categories.includes("crm")) point.crmWon = m.crmWon
      if (categories.includes("time")) point.timeEntries = m.timeEntries
      if (categories.includes("audit")) point.audit = m.auditEvents
      if (categories.includes("performance") || categories.includes("employee")) {
        point.performance = Math.round(m.employeePerfGBP * 100) / 100
      }
      return point
    })

    return NextResponse.json({
      currency: "GBP",
      symbol: currencySymbol("GBP"),
      note: "Legacy INR/USD/EUR rows use approximate FX for the journey graph; new entries should be GBP. Employee performance uses SALARY expense totals linked to staff.",
      months: series,
      years,
      totals: {
        ...totals,
        profitGBP: totals.revenueGBP - totals.expensesGBP,
      },
      graph: graphPoints,
      meta: {
        projectCount: projects.length,
        clientCount: clients.length,
        categories,
        yearKeyHint: yearKey(new Date()),
      },
    })
  } catch (err) {
    console.error("[finance/pnl] GET", err)
    return NextResponse.json({ error: "Failed to load P&L" }, { status: 500 })
  }
}
