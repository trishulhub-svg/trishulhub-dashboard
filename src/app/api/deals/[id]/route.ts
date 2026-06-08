import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateDealSchema, validateRequest } from "@/lib/validations"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"

// TODO: Extract to @/lib/serializers.ts (shared with deals/route.ts)
// Helper: serialize Date objects in deal data to ISO strings for JSON responses
interface DealWithDates {
  expectedCloseDate?: string | Date | null
  actualCloseDate?: string | Date | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  [key: string]: unknown
}
function serializeDealDates(d: DealWithDates) {
  if (!d) return d
  if (d.expectedCloseDate instanceof Date) d.expectedCloseDate = d.expectedCloseDate.toISOString()
  if (d.actualCloseDate instanceof Date) d.actualCloseDate = d.actualCloseDate.toISOString()
  if (d.createdAt instanceof Date) d.createdAt = d.createdAt.toISOString()
  if (d.updatedAt instanceof Date) d.updatedAt = d.updatedAt.toISOString()
  return d
}

// TODO: Extract VALID_STAGES to @/lib/constants.ts (shared with deals/route.ts)
// ━━ Shared constants ━━
const VALID_STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] as const
const ALLOWED_FIELDS = ["title", "value", "currency", "stage", "probability", "expectedCloseDate", "actualCloseDate", "clientId", "leadId", "assignedToId", "notes"] as const
const VALID_CURRENCIES = ["INR", "USD", "GBP", "EUR"] as const

// GET /api/deals/[id] - Single deal detail with relations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit (DID-04)
    const rl = rateLimit(`deals-get:${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
    }

    await ensureAllTables()

    const { id } = await params

    try {
      const deal = await db.deal.findUnique({
        where: { id },
        include: {
          client: { select: { id: true, name: true, email: true } },
          lead: { select: { id: true, name: true, email: true, status: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      })

      if (!deal) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 })
      }

      return NextResponse.json(deepSanitize(serializeDealDates(deal as unknown as DealWithDates)))
    } catch (error: unknown) {
      console.error("[deals/[id]] GET error:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "Failed to load deal details" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[deals/[id]] GET unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/deals/[id] - Update deal
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-deals-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    await ensureAllTables()

    const { id } = await params

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = validateRequest(updateDealSchema, { ...(body as Record<string, unknown>), id })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const data = validation.data

    // Validate stage (defense-in-depth)
    if (data.stage !== undefined && !VALID_STAGES.includes(data.stage as typeof VALID_STAGES[number])) {
      return NextResponse.json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` }, { status: 400 })
    }

    // Validate probability range
    if (data.probability !== undefined) {
      const prob = Number(data.probability)
      if (isNaN(prob) || prob < 0 || prob > 100) {
        return NextResponse.json({ error: "Probability must be between 0 and 100" }, { status: 400 })
      }
    }

    // Remove id from update data and sanitize
    const { id: _id, ...updateData } = data

    // Defense-in-depth: date validation (NaN check)
    if (updateData.expectedCloseDate && typeof updateData.expectedCloseDate === 'string') {
      const d = new Date(updateData.expectedCloseDate)
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid expectedCloseDate" }, { status: 400 })
    }
    if (updateData.actualCloseDate && typeof updateData.actualCloseDate === 'string') {
      const d = new Date(updateData.actualCloseDate)
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid actualCloseDate" }, { status: 400 })
    }

    const sanitizedData: Record<string, any> = {}
    for (const key of ALLOWED_FIELDS) {
      if (updateData[key] !== undefined) {
        // Convert date strings to Date objects
        if (key === "expectedCloseDate" && updateData[key]) {
          sanitizedData[key] = new Date(updateData[key] as string)
        } else if (key === "actualCloseDate" && updateData[key]) {
          sanitizedData[key] = new Date(updateData[key] as string)
        } else {
          sanitizedData[key] = updateData[key] === "" ? null : updateData[key]
        }
      }
    }

    // DID-06: Validate currency
    if (sanitizedData.currency !== undefined && !VALID_CURRENCIES.includes(sanitizedData.currency)) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 })
    }

    // Auto-set actualCloseDate when stage changes to CLOSED_WON or CLOSED_LOST
    if (sanitizedData.stage === "CLOSED_WON" || sanitizedData.stage === "CLOSED_LOST") {
      if (!sanitizedData.actualCloseDate) {
        sanitizedData.actualCloseDate = new Date()
      }
    }

    try {
      const deal = await db.deal.update({
        where: { id },
        data: sanitizedData,
        include: {
          client: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      })
      return NextResponse.json(deepSanitize(serializeDealDates(deal as unknown as DealWithDates)))
    } catch (error: unknown) {
      console.error("[deals/[id]] PATCH error:", error instanceof Error ? error.message : error)
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Failed to update deal" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[deals/[id]] PATCH unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/deals/[id] - Hard delete deal
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-deals-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } })
    }

    await ensureAllTables()

    const { id } = await params

    // DID-07: Attempt delete directly and catch P2025 for 404 (non-atomic check-then-delete fix)
    try {
      await db.deal.delete({ where: { id } })
      return NextResponse.json({ success: true })
    } catch (error: unknown) {
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 })
      }
      console.error("[deals/[id]] DELETE error:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[deals/[id]] DELETE unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
