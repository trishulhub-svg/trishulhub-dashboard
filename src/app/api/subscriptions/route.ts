import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createSubscriptionSchema, validateRequest } from "@/lib/validations"

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
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  const where: Record<string, any> = {}
  if (status) where.status = status

  const subscriptions = await db.subscription.findMany({
    where,
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  })

  // Compute monthly INR for each subscription
  const enriched = subscriptions.map((sub) => ({
    ...sub,
    monthlyINR: getMonthlyINR(sub.rate, sub.currency, sub.frequency),
  }))

  // Compute total monthly cost of active subscriptions
  const totalMonthlyCost = enriched
    .filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => sum + s.monthlyINR, 0)

  return NextResponse.json({ subscriptions: enriched, totalMonthlyCost })
}

// POST /api/subscriptions - Create subscription (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const validation = validateRequest(createSubscriptionSchema, body)

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data

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
}
