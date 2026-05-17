import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// ━━ Zod schema for creating a lead email ━━
const createLeadEmailSchema = z.object({
  leadId: z.string().min(1, "Lead ID is required"),
  subject: z.string().min(1, "Subject is required").max(500, "Subject must be at most 500 characters"),
  body: z.string().min(1, "Body is required").max(50000, "Body must be at most 50000 characters"),
})

// GET /api/leads/emails?leadId=xxx - List emails for a lead (ADMIN/SUPER_ADMIN only)
export async function GET(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-emails-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get("leadId")

    if (!leadId) {
      return NextResponse.json({ error: "leadId query parameter is required" }, { status: 400 })
    }

    const emails = await db.leadEmail.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(JSON.parse(JSON.stringify(emails)))
  } catch (error: unknown) {
    console.error("[leads/emails] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch lead emails" }, { status: 500 })
  }
}

// POST /api/leads/emails - Create a lead email (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-emails-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = createLeadEmailSchema.safeParse(body)
    if (!validation.success) {
      const firstError = validation.error.issues?.[0]
      return NextResponse.json(
        { error: firstError?.message || "Invalid input" },
        { status: 400 }
      )
    }

    const { leadId, subject, body: emailBody } = validation.data

    // Verify the lead exists
    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    const leadEmail = await db.leadEmail.create({
      data: {
        leadId,
        subject,
        body: emailBody,
        direction: "OUTBOUND",
        status: "PENDING_APPROVAL",
      },
    })

    return NextResponse.json(JSON.parse(JSON.stringify(leadEmail)), { status: 201 })
  } catch (error: unknown) {
    console.error("[leads/emails] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to create lead email" }, { status: 500 })
  }
}
