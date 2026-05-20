import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateLeadSchema, validateRequest } from "@/lib/validations"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ━━ Shared constants (mirrors leads/route.ts) ━━
const VALID_STATUSES = ["NEW", "CONTACTED", "INTERESTED", "PROPOSAL", "NEGOTIATING", "WON", "LOST"] as const
const VALID_SOURCES = ["MANUAL", "AI_FOUND", "REFERRAL", "SOCIAL_MEDIA"] as const
const ALLOWED_FIELDS = ["name", "email", "company", "website", "phone", "source", "score", "status", "notes", "clientId"] as const

// GET /api/leads/[id] - Single lead detail with relations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-leads-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params

    const lead = await db.lead.findUnique({
      where: { id },
      include: { client: true, emails: true, deals: true, contacts: true },
    })

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    return NextResponse.json(lead)
  } catch (error: unknown) {
    console.error("[leads/[id]] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load lead details" }, { status: 500 })
  }
}

// POST /api/leads/[id] - Convert lead to client
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-leads-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params

    // Find the lead
    const lead = await db.lead.findUnique({
      where: { id },
      include: { client: true },
    })

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    // Already converted? (checked inside transaction below to prevent race conditions)

    // Create/link client inside a single transaction to prevent race conditions
    // where two concurrent requests both pass the "already converted" check.
    try {
      const result = await db.$transaction(async (tx) => {
        // Re-check lead status inside transaction
        const freshLead = await tx.lead.findUnique({
          where: { id },
          include: { client: true },
        })

        if (!freshLead) {
          throw new Error("Lead not found")
        }

        // Already converted?
        if (freshLead.clientId && freshLead.client) {
          throw new Error("ALREADY_CONVERTED")
        }

        // Check for duplicate email in clients
        const existingClient = await tx.client.findFirst({ where: { email: freshLead.email } })
        if (existingClient) {
          await tx.lead.update({
            where: { id },
            data: { clientId: existingClient.id, status: "WON" },
          })
          return { client: existingClient, linked: true }
        }

        // Create a new client from the lead data
        const newClient = await tx.client.create({
          data: {
            name: freshLead.name,
            email: freshLead.email,
            phone: freshLead.phone || null,
            company: freshLead.company || null,
            website: freshLead.website || null,
            status: "ACTIVE",
            notes: freshLead.notes ? `Converted from lead. Original notes: ${freshLead.notes}` : "Converted from lead",
          },
        })

        // Update lead to link to new client and set status to WON
        await tx.lead.update({
          where: { id },
          data: { clientId: newClient.id, status: "WON" },
        })

        return { client: newClient, linked: false }
      })

      if (result.linked) {
        return NextResponse.json({
          message: "Lead linked to existing client (email already exists)",
          client: result.client,
          linked: true,
        })
      }

      return NextResponse.json({
        message: "Lead converted to client successfully",
        client: result.client,
        linked: false,
      }, { status: 201 })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg === "ALREADY_CONVERTED") {
        // Fetch the linked client for the response
        const leadWithClient = await db.lead.findUnique({ where: { id }, include: { client: true } })
        return NextResponse.json({ error: "Lead is already converted to a client", client: leadWithClient?.client }, { status: 409 })
      }
      if (msg === "Lead not found") {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 })
      }
      console.error("Error converting lead to client:", error)
      return NextResponse.json({ error: "Failed to convert lead to client" }, { status: 500 })
    }
  } catch (error: unknown) {
    // Outer catch for unexpected errors
    console.error("[leads/[id]] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to convert lead" }, { status: 500 })
  }
}

// PATCH /api/leads/[id] - Update lead
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-leads-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params

    // Wrap req.json() in try/catch
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // Validate body with updateLeadSchema
    const validation = validateRequest(updateLeadSchema, { ...(body as Record<string, unknown>), id })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const data = validation.data

    // Validate status against VALID_STATUSES (defense-in-depth, schema already validates)
    if (data.status !== undefined && !VALID_STATUSES.includes(data.status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 })
    }

    // Validate source against VALID_SOURCES (defense-in-depth, schema already validates)
    if (data.source !== undefined && !VALID_SOURCES.includes(data.source as typeof VALID_SOURCES[number])) {
      return NextResponse.json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` }, { status: 400 })
    }

    // Validate score range (defense-in-depth, schema already validates)
    if (data.score !== undefined) {
      const score = Number(data.score)
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json({ error: "Score must be between 0 and 100" }, { status: 400 })
      }
    }

    // If email is being updated, check for duplicates (excluding current lead)
    if (data.email) {
      const existing = await db.lead.findFirst({
        where: { email: data.email, NOT: { id } },
      })
      if (existing) {
        return NextResponse.json({ error: "A lead with this email already exists" }, { status: 409 })
      }
    }

    // Remove id from update data and sanitize
    const { id: _id, ...updateData } = data

    const sanitizedData: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (updateData[key] !== undefined) {
        sanitizedData[key] = updateData[key] === "" ? null : updateData[key]
      }
    }

    try {
      const lead = await db.lead.update({
        where: { id },
        data: sanitizedData,
        include: { client: true, emails: true },
      })
      return NextResponse.json(lead)
    } catch (error: unknown) {
      console.error("Error updating lead:", error)
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
    }
  } catch (error: unknown) {
    // Outer catch for unexpected errors
    console.error("[leads/[id]] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
  }
}

// DELETE /api/leads/[id] - Hard delete lead and associated emails
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdmin(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-leads-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params

    // Check if lead exists first
    const existing = await db.lead.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    // Delete associated LeadEmail records first (cascade if not set in Prisma)
    await db.leadEmail.deleteMany({ where: { leadId: id } })

    // Hard delete the lead
    await db.lead.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[leads/[id]] DELETE error:", error instanceof Error ? error.message : error)
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 })
  }
}
