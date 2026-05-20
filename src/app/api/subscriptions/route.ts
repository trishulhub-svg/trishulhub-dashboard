import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createSubscriptionSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// Currency conversion rates to INR (approximate)
const CURRENCY_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  GBP: 105.5,
}

function getMonthlyINR(rate: number, currency: string, frequency: string): number {
  const inrRate = rate * (CURRENCY_TO_INR[currency] || 1)
  if (frequency === "YEARLY") return inrRate / 12
  if (frequency === "ONE_TIME") return 0 // One-time doesn't count as monthly
  return inrRate // MONTHLY
}

// GET /api/subscriptions - List subscriptions with filters
export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`subs-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  // M-FIN-8: Pagination support
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "100")), 200)
  const offset = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const [subscriptions, total] = await Promise.all([
    db.subscription.findMany({
      where,
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    db.subscription.count({ where }),
  ])

  // Compute monthly INR for each subscription
  const enriched = subscriptions.map((sub) => ({
    ...sub,
    monthlyINR: getMonthlyINR(sub.rate, sub.currency, sub.frequency),
  }))

  // Compute total monthly cost of active subscriptions
  const totalMonthlyCost = enriched
    .filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => sum + s.monthlyINR, 0)

  return NextResponse.json(JSON.parse(JSON.stringify({ subscriptions: enriched, totalMonthlyCost, total, page, limit, totalPages: Math.ceil(total / limit) })))
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
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
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
      rate: data.rate,
      currency: data.currency || "INR",
      frequency: data.frequency || "MONTHLY",
      status: data.status || "ACTIVE",
      category: data.category || null,
      projectId: data.projectId || null,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      endDate: data.endDate ? new Date(data.endDate) : null,
      notes: data.notes || null,
    },
    include: { project: { select: { id: true, name: true } } },
  })

  return NextResponse.json(subscription)
  } catch (error: unknown) {
    console.error("[subscriptions] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
