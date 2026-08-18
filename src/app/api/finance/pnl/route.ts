import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessFinance } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { currencySymbol } from "@/lib/money"

/**
 * P&L reporting treats stored amounts as GBP for display.
 * Historical INR/USD/EUR rows are NOT auto-converted — edit those entries
 * to the correct GBP figure when ready. Showing £ everywhere keeps the UI consistent.
 */

function monthKey(d: Date) {
  // Local calendar month (avoid UTC day-shift near midnight)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function yearKey(d: Date) {
  return String(d.getFullYear())
}

function parseMonthKey(key: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null
  return { y, m: mo }
}

/** Inclusive continuous month keys from first → last (and at least current month). */
function fillMonthKeys(existing: string[]): string[] {
  const now = new Date()
  const current = monthKey(now)
  if (existing.length === 0) {
    // Last 12 months empty journey so the chart still renders
    const keys: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(monthKey(d))
    }
    return keys
  }
  const sorted = [...existing].sort((a, b) => a.localeCompare(b))
  const start = parseMonthKey(sorted[0])
  const endParsed = parseMonthKey(sorted[sorted.length - 1] > current ? sorted[sorted.length - 1] : current)
  if (!start || !endParsed) return sorted

  const keys: string[] = []
  let y = start.y
  let m = start.m
  // Cap span to 60 months to keep payload sane
  for (let i = 0; i < 60; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    keys.push(key)
    if (y === endParsed.y && m === endParsed.m) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return keys
}

type MonthRow = {
  key: string
  revenueGBP: number
  expensesGBP: number
  salaryGBP: number
  profitGBP: number
  lossGBP: number
  invoiceCount: number
  expenseCount: number
  auditEvents: number
  employeePerfGBP: number
  projectsCreated: number
  clientsCreated: number
  crmWon: number
  timeEntries: number
}

function emptyRow(key: string): MonthRow {
  return {
    key,
    revenueGBP: 0,
    expensesGBP: 0,
    salaryGBP: 0,
    profitGBP: 0,
    lossGBP: 0,
    invoiceCount: 0,
    expenseCount: 0,
    auditEvents: 0,
    employeePerfGBP: 0,
    projectsCreated: 0,
    clientsCreated: 0,
    crmWon: 0,
    timeEntries: 0,
  }
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

    // categories query kept for meta/compat; graph always returns full series
    const { searchParams } = new URL(req.url)
    const categories = (searchParams.get("categories") || "profit,revenue,expenses")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const [invoices, expenses, projects, clients, timeEntries, deals, auditLogs, subscriptions] = await Promise.all([
      db.invoice.findMany({
        where: { status: "PAID" },
        select: { total: true, currency: true, paidAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10000,
      }),
      db.expense.findMany({
        select: {
          amount: true,
          currency: true,
          date: true,
          category: true,
          employeeId: true,
        },
        orderBy: { date: "desc" },
        take: 20000,
      }),
      db.project.findMany({
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      db.client.findMany({
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      db.timeEntry
        .findMany({
          select: { id: true, clockIn: true },
          orderBy: { clockIn: "desc" },
          take: 30000,
        })
        .catch(() => [] as Array<{ id: string; clockIn: Date }>),
      db.deal
        .findMany({
          select: { stage: true, createdAt: true, actualCloseDate: true },
          orderBy: { createdAt: "desc" },
          take: 5000,
        })
        .catch(() => [] as Array<{ stage: string; createdAt: Date; actualCloseDate: Date | null }>),
      db.auditLog
        .findMany({
          select: { id: true, createdAt: true },
          take: 30000,
          orderBy: { createdAt: "desc" },
        })
        .catch(() => [] as Array<{ id: string; createdAt: Date }>),
      db.subscription.findMany({
        select: {
          amount: true,
          frequency: true,
          status: true,
          startDate: true,
          endDate: true,
        },
        take: 5000,
      }).catch(() => [] as Array<{
        amount: number
        frequency: string
        status: string
        startDate: Date
        endDate: Date | null
      }>),
    ])

    const months = new Map<string, MonthRow>()
    const ensure = (key: string): MonthRow => {
      if (!months.has(key)) months.set(key, emptyRow(key))
      return months.get(key)!
    }

    for (const inv of invoices) {
      const when = inv.paidAt || inv.createdAt
      if (!when) continue
      const row = ensure(monthKey(new Date(when)))
      // Amounts shown as GBP as-stored (no FX conversion)
      row.revenueGBP += Number(inv.total || 0)
      row.invoiceCount += 1
    }

    for (const exp of expenses) {
      if (!exp.date) continue
      const row = ensure(monthKey(new Date(exp.date)))
      const amount = Number(exp.amount || 0)
      row.expensesGBP += amount
      row.expenseCount += 1
      if (String(exp.category).toUpperCase() === "SALARY") {
        row.salaryGBP += amount
        if (exp.employeeId) row.employeePerfGBP += amount
      }
    }

    const now = new Date()
    for (const sub of subscriptions) {
      if (!sub.startDate) continue
      const amount = Number(sub.amount || 0)
      if (amount <= 0) continue
      const start = new Date(sub.startDate)
      const end = sub.endDate ? new Date(sub.endDate) : now
      const last = end.getTime() < now.getTime() ? end : now

      if (sub.frequency === "ONE_TIME") {
        const row = ensure(monthKey(start))
        row.expensesGBP += amount
        row.expenseCount += 1
        continue
      }

      const monthly = sub.frequency === "YEARLY" ? amount / 12 : amount
      let y = start.getFullYear()
      let m = start.getMonth()
      const lastY = last.getFullYear()
      const lastM = last.getMonth()
      for (let i = 0; i < 60; i++) {
        if (y > lastY || (y === lastY && m > lastM)) break
        const row = ensure(`${y}-${String(m + 1).padStart(2, "0")}`)
        row.expensesGBP += monthly
        row.expenseCount += 1
        m += 1
        if (m > 11) {
          m = 0
          y += 1
        }
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
      if (d.stage !== "CLOSED_WON") continue
      const when = d.actualCloseDate || d.createdAt
      if (!when) continue
      ensure(monthKey(new Date(when))).crmWon += 1
    }
    for (const a of auditLogs) {
      if (!a.createdAt) continue
      ensure(monthKey(new Date(a.createdAt))).auditEvents += 1
    }

    const continuousKeys = fillMonthKeys([...months.keys()])
    const series = continuousKeys
      .map((key) => {
        const m = months.get(key) || emptyRow(key)
        const profitGBP = m.revenueGBP - m.expensesGBP
        return {
          ...m,
          revenueGBP: Math.round(m.revenueGBP * 100) / 100,
          expensesGBP: Math.round(m.expensesGBP * 100) / 100,
          salaryGBP: Math.round(m.salaryGBP * 100) / 100,
          employeePerfGBP: Math.round(m.employeePerfGBP * 100) / 100,
          profitGBP: Math.round(profitGBP * 100) / 100,
          lossGBP: Math.round(Math.max(0, -profitGBP) * 100) / 100,
        }
      })
      .sort((a, b) => a.key.localeCompare(b.key))

    // Year rollup (skip empty zero-only years that have no activity)
    const yearsMap = new Map<string, MonthRow>()
    for (const m of series) {
      const hasActivity =
        m.revenueGBP ||
        m.expensesGBP ||
        m.invoiceCount ||
        m.expenseCount ||
        m.projectsCreated ||
        m.clientsCreated ||
        m.crmWon ||
        m.timeEntries ||
        m.auditEvents
      if (!hasActivity) continue
      const y = m.key.slice(0, 4)
      if (!yearsMap.has(y)) yearsMap.set(y, emptyRow(y))
      const yrow = yearsMap.get(y)!
      yrow.revenueGBP += m.revenueGBP
      yrow.expensesGBP += m.expensesGBP
      yrow.salaryGBP += m.salaryGBP
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
      .map((y) => {
        const profitGBP = y.revenueGBP - y.expensesGBP
        return {
          ...y,
          revenueGBP: Math.round(y.revenueGBP * 100) / 100,
          expensesGBP: Math.round(y.expensesGBP * 100) / 100,
          salaryGBP: Math.round(y.salaryGBP * 100) / 100,
          employeePerfGBP: Math.round(y.employeePerfGBP * 100) / 100,
          profitGBP: Math.round(profitGBP * 100) / 100,
          lossGBP: Math.round(Math.max(0, -profitGBP) * 100) / 100,
        }
      })
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

    // Always return full graph keys so UI filter toggles never miss series data
    const graph = series.map((m) => ({
      month: m.key,
      revenue: m.revenueGBP,
      expenses: m.expensesGBP,
      salary: m.salaryGBP,
      profit: m.profitGBP,
      loss: m.lossGBP,
      projects: m.projectsCreated,
      clients: m.clientsCreated,
      crmWon: m.crmWon,
      timeEntries: m.timeEntries,
      audit: m.auditEvents,
      performance: m.employeePerfGBP,
    }))

    return NextResponse.json({
      currency: "GBP",
      symbol: currencySymbol("GBP"),
      note: "All figures shown in GBP. Older INR/USD/EUR amounts were not auto-converted — edit those rows to the correct GBP value when ready.",
      months: series.filter(
        (m) =>
          m.revenueGBP ||
          m.expensesGBP ||
          m.invoiceCount ||
          m.expenseCount
      ),
      years,
      totals: {
        revenueGBP: Math.round(totals.revenueGBP * 100) / 100,
        expensesGBP: Math.round(totals.expensesGBP * 100) / 100,
        salaryGBP: Math.round(totals.salaryGBP * 100) / 100,
        profitGBP: Math.round((totals.revenueGBP - totals.expensesGBP) * 100) / 100,
      },
      graph,
      meta: {
        projectCount: projects.length,
        clientCount: clients.length,
        categories,
        yearKeyHint: yearKey(new Date()),
        graphPoints: graph.length,
      },
    })
  } catch (err) {
    console.error("[finance/pnl] GET", err)
    return NextResponse.json({ error: "Failed to load P&L" }, { status: 500 })
  }
}
