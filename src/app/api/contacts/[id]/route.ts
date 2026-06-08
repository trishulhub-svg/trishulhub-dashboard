import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateContactSchema, validateRequest } from "@/lib/validations"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"

// ━━ Shared constants ━━
const ALLOWED_FIELDS = ["firstName", "lastName", "email", "phone", "jobTitle", "clientId", "leadId", "notes", "isPrimary"] as const

// GET /api/contacts/[id] - Single contact detail with relations
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

    await ensureAllTables()

    const { id } = await params

    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, name: true, email: true, status: true } },
      },
    })

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    return NextResponse.json(deepSanitize(contact))
  } catch (error: unknown) {
    console.error("[contacts/[id]] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load contact details" }, { status: 500 })
  }
}

// PATCH /api/contacts/[id] - Update contact
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
    const rl = rateLimit(`crm-contacts-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
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

    const validation = validateRequest(updateContactSchema, { ...(body as Record<string, unknown>), id })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const data = validation.data

    // Remove id from update data and sanitize
    const { id: _id, ...updateData } = data

    const sanitizedData: Record<string, any> = {}
    for (const key of ALLOWED_FIELDS) {
      if (updateData[key] !== undefined) {
        sanitizedData[key] = updateData[key] === "" ? null : updateData[key]
      }
    }

    // Wrap email duplicate check + isPrimary unset + contact update in a single transaction (E20 fix)
    try {
      const contact = await db.$transaction(async (tx) => {
        // Email duplicate check inside transaction (prevents TOCTOU race)
        if (sanitizedData.email) {
          const existing = await tx.contact.findFirst({ where: { email: sanitizedData.email, NOT: { id } } })
          if (existing) throw new Error("DUPLICATE_EMAIL")
        }

        if (sanitizedData.isPrimary === true) {
          const current = await tx.contact.findUnique({ where: { id } })
          if (current) {
            const targetClientId = (sanitizedData.clientId as string) ?? current.clientId
            const targetLeadId = (sanitizedData.leadId as string) ?? current.leadId
            if (targetClientId) {
              await tx.contact.updateMany({
                where: { clientId: targetClientId, isPrimary: true, NOT: { id } },
                data: { isPrimary: false },
              })
            }
            if (targetLeadId) {
              await tx.contact.updateMany({
                where: { leadId: targetLeadId, isPrimary: true, NOT: { id } },
                data: { isPrimary: false },
              })
            }
          }
        }
        return tx.contact.update({
          where: { id },
          data: sanitizedData,
          include: {
            client: { select: { id: true, name: true } },
            lead: { select: { id: true, name: true } },
          },
        })
      })
      return NextResponse.json(contact)
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "DUPLICATE_EMAIL") {
        return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 })
      }
      console.error("[contacts/[id]] PATCH error:", error instanceof Error ? error.message : error)
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[contacts/[id]] PATCH unexpected error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/contacts/[id] - Hard delete contact
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
    const rl = rateLimit(`crm-contacts-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    await ensureAllTables()

    const { id } = await params

    // Check if contact exists first
    const existing = await db.contact.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    await db.contact.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[contacts/[id]] DELETE error:", error instanceof Error ? error.message : error)
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 })
  }
}
