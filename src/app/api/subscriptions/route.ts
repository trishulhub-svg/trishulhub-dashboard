import { canAccessFinance } from "@/lib/rbac"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { createSubscriptionSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// TODO: Store exchange rates in DB — these fallbacks become stale
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  GBP: 105.5,
}

function getMonthlyINR(amount: number, exchangeRate: number, frequency: string): number {
  const inrAmount = amount * exchangeRate
  if (frequency === "YEARLY") return inrAmount / 12
  if (frequency === "ONE_TIME") return inrAmount // Show total INR for one-time payments
  return inrAmount // MONTHLY
}

/**
 * Phase 7c: ONE_TIME subscriptions represent a single purchase, not a recurring
 * monthly cost. Including their full amount in `totalMonthlyCost` inflates the
 * headline metric on the Finance dashboard. Skip them when aggregating monthly cost.
 */
function contributesToMonthlyCost(frequency: string): boolean {
  return frequency === "MONTHLY" || frequency === "YEARLY"
}

// GET /api/subscriptions - List subscriptions with filters
export async function GET(req: NextRequest) {
    try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!canAccessFinance(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`subs-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const search = (searchParams.get("search") || "").trim()
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const VALID_STATUSES = ["ACTIVE", "PAUSED", "STOPPED", "COMPLETED", "EXPIRED"] as const
    if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: "Invalid status filter" }, { status: 400 })
    }

    // Validate date filters
    let parsedStart: Date | null = null
    let parsedEnd: Date | null = null
    if (startDate) {
      parsedStart = new Date(startDate)
      if (isNaN(parsedStart.getTime())) {
        return NextResponse.json({ error: "Invalid startDate format" }, { status: 400 })
      }
    }
    if (endDate) {
      // If date-only (YYYY-MM-DD), include the entire day by setting to end-of-day UTC
      const endStr = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999Z` : endDate
      parsedEnd = new Date(endStr)
      if (isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid endDate format" }, { status: 400 })
      }
    }
    if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 })
    }

    // M-FIN-8: Pagination support
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1)
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50") || 50), 200)
    const offset = (page - 1) * limit

    const where: Prisma.SubscriptionWhereInput = {}
    if (status) where.status = status

    // Date filter: filter subscriptions whose lifecycle overlaps the selected date range.
    // A subscription is "active during" the range if its startDate <= range.end AND
    // (endDate is null OR endDate >= range.start). This catches subs that started
    // before the range but are still ongoing, plus subs that started within the range.
    if (parsedStart || parsedEnd) {
      const dateAnd: Prisma.SubscriptionWhereInput[] = []
      if (parsedEnd) {
        dateAnd.push({ startDate: { lte: parsedEnd } })
      }
      if (parsedStart) {
        dateAnd.push({
          OR: [{ endDate: null }, { endDate: { gte: parsedStart } }],
        })
      }
      where.AND = dateAnd
    }

    // Smart search: service name, category, project name, notes
    if (search) {
      where.OR = [
        { service: { contains: search } },
        { category: { contains: search } },
        { notes: { contains: search } },
        { project: { name: { contains: search } } },
      ]
    }

    const [subscriptions, total, activeSubscriptions] = await Promise.all([
      db.subscription.findMany({
        where,
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      db.subscription.count({ where }),
      // P11-INTEG-05: Fetch ALL active subscriptions for accurate totalMonthlyCost (not just current page).
      // When a date filter is applied, only count active subs that overlap the date range.
      db.subscription.findMany({
        where: {
          status: "ACTIVE",
          ...(parsedEnd ? { startDate: { lte: parsedEnd } } : {}),
          ...(parsedStart ? { OR: [{ endDate: null }, { endDate: { gte: parsedStart } }] } : {}),
        },
        select: { amount: true, exchangeRate: true, currency: true, frequency: true },
      }),
    ])

    // Compute monthly INR for each subscription using stored exchangeRate
    const enriched = subscriptions.map((sub) => ({
      ...sub,
      monthlyINR: getMonthlyINR(sub.amount as number, (sub.exchangeRate as number) || DEFAULT_EXCHANGE_RATES[sub.currency] || 1, sub.frequency),
    }))

    // Compute total monthly cost of ALL active subscriptions (not just current page)
    // Phase 7c: ONE_TIME subscriptions represent one-off purchases and should NOT
    // inflate the recurring monthly cost figure.
    const totalMonthlyCost = activeSubscriptions
      .filter((s) => contributesToMonthlyCost(s.frequency))
      .reduce((sum, s) => sum + getMonthlyINR(s.amount as number, (s.exchangeRate as number) || DEFAULT_EXCHANGE_RATES[s.currency] || 1, s.frequency), 0)

    return NextResponse.json({ subscriptions: enriched, totalMonthlyCost, total, page, limit, totalPages: Math.ceil(total / limit) })
    } catch (error: unknown) {
      console.error("[subscriptions] GET error:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "An error occurred" }, { status: 500 })
    }
}

// POST /api/subscriptions - Create subscription (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
    try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!canAccessFinance(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`subs-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
    }

    // Wrap req.json() in try/catch for malformed JSON
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const validation = validateRequest(createSubscriptionSchema, body)

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const data = validation.data
    const currency = data.currency || "INR"
    const exchangeRate = data.exchangeRate || DEFAULT_EXCHANGE_RATES[currency] || 1

    // FIX: Validate dates before creating (NaN check)
    if (data.startDate && isNaN(new Date(data.startDate).getTime())) {
      return NextResponse.json({ error: "Invalid start date" }, { status: 400 })
    }
    if (data.endDate && isNaN(new Date(data.endDate).getTime())) {
      return NextResponse.json({ error: "Invalid end date" }, { status: 400 })
    }

    // H-FIN-5: Validate endDate > startDate
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate).getTime()
      const end = new Date(data.endDate).getTime()
      if (end <= start) {
        return NextResponse.json({ error: "End date must be after start date" }, { status: 400 })
      }
    }

    const subscription = await db.subscription.create({
      data: {
        service: data.service,
        amount: data.amount,
        currency,
        exchangeRate,
        frequency: data.frequency || "MONTHLY",
        status: data.status || "ACTIVE",
        category: data.category || null,
        projectId: data.projectId || null,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: (data.notes || "").slice(0, 2000) || null,
      },
      include: { project: { select: { id: true, name: true } } },
    }).catch((error: unknown) => {
      // Phase 7c: Surface foreign-key violations (P2003) as 400 instead of 500 so
      // callers get an actionable error message when projectId doesn't exist.
      const prismaError = error as { code?: string; meta?: { field_name?: string } }
      if (prismaError?.code === "P2003") {
        const fieldHint = prismaError.meta?.field_name || "projectId"
        throw new Error(`INVALID_REFERENCE:${fieldHint}`)
      }
      throw error
    })

    // Phase 7c: Audit log subscription creation (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "BUSINESS", page: "subscriptions", action: "CREATE",
      entityType: "Subscription", entityId: subscription.id,
      description: `Created subscription: ${subscription.service} (${subscription.frequency}, ${subscription.currency} ${subscription.amount})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json(subscription)
    } catch (error: unknown) {
      // Phase 7c: Translate INVALID_REFERENCE marker into a 400 response
      if (error instanceof Error && error.message.startsWith("INVALID_REFERENCE:")) {
        const field = error.message.split(":")[1] || "reference"
        return NextResponse.json(
          { error: `Invalid ${field}: referenced project does not exist` },
          { status: 400 }
        )
      }
      console.error("[subscriptions] POST error:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "An error occurred" }, { status: 500 })
    }
}
