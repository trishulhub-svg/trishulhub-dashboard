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

    const [invoices, expenses, projects, clients, timeAgg, deals] = await Promise.all([
      db.invoice.findMany({
        where: { status: "PAID" },
        select: { total: true, currency: true, paidAt: true, createdAt: true, clientId: true },
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
        select: { id: true, name: true, status: true, createdAt: true, progress: true },
        take: 500,
      }),
      db.client.count(),
      db.timeEntry
        .count()
        .catch(() => 0),
      db.deal
        .findMany({
          select: { value: true, currency: true, stage: true, createdAt: true },
          take: 2000,
        })
        .catch(() => [] as Array<{ value: number; currency: string; stage: string; createdAt: Date }>),
    ])

    const months = new Map<
      string,
      {
        key: string
        revenueGBP: number
        expensesGBP: number
        salaryGBP: number
        profitGBP: number
        revenueNative: number
        expensesNative: number
        invoiceCount: number
        expenseCount: number
      }
    >()

    const ensure = (key: string) => {
      if (!months.has(key)) {
        months.set(key, {
          key,
          revenueGBP: 0,
          expensesGBP: 0,
          salaryGBP: 0,
          profitGBP: 0,
          revenueNative: 0,
          expensesNative: 0,
          invoiceCount: 0,
          expenseCount: 0,
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
      const when = exp.date
      if (!when) continue
      const key = monthKey(new Date(when))
      const cur = normalizeCurrency(exp.currency)
      const row = ensure(key)
      const gbp = Number(exp.amount || 0) * (TO_GBP[cur] ?? 1)
      row.expensesGBP += gbp
      row.expensesNative += Number(exp.amount || 0)
      row.expenseCount += 1
      if (String(exp.category).toUpperCase() === "SALARY") {
        row.salaryGBP += gbp
      }
    }

    const series = [...months.values()]
      .map((m) => ({
        ...m,
        profitGBP: m.revenueGBP - m.expensesGBP,
        lossGBP: Math.max(0, m.expensesGBP - m.revenueGBP),
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
      if (categories.includes("revenue") || categories.includes("profit")) point.revenue = Math.round(m.revenueGBP * 100) / 100
      if (categories.includes("expenses") || categories.includes("loss")) point.expenses = Math.round(m.expensesGBP * 100) / 100
      if (categories.includes("salary")) point.salary = Math.round(m.salaryGBP * 100) / 100
      if (categories.includes("profit")) point.profit = Math.round(m.profitGBP * 100) / 100
      if (categories.includes("loss")) point.loss = Math.round(m.lossGBP * 100) / 100
      if (categories.includes("projects")) point.projects = projects.filter((p) => monthKey(new Date(p.createdAt)) <= m.key).length
      if (categories.includes("clients")) point.clients = clients
      if (categories.includes("crm")) {
        point.crmWon = deals.filter(
          (d) => d.stage === "CLOSED_WON" && monthKey(new Date(d.createdAt)) === m.key
        ).length
      }
      if (categories.includes("time")) {
        point.timeEntries = typeof timeAgg === "number" ? timeAgg : 0
      }
      return point
    })

    return NextResponse.json({
      currency: "GBP",
      symbol: currencySymbol("GBP"),
      note: "Legacy INR/USD/EUR rows are converted with approximate rates for the journey graph; new entries should be GBP.",
      months: series,
      totals: {
        ...totals,
        profitGBP: totals.revenueGBP - totals.expensesGBP,
      },
      graph: graphPoints,
      meta: {
        projectCount: projects.length,
        clientCount: clients,
        categories,
      },
    })
  } catch (err) {
    console.error("[finance/pnl] GET", err)
    return NextResponse.json({ error: "Failed to load P&L" }, { status: 500 })
  }
}
