import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateContactSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ━━ Shared constants ━━
const ALLOWED_FIELDS = ["firstName", "lastName", "email", "phone", "jobTitle", "clientId", "leadId", "notes", "isPrimary"] as const

// ━━ Admin check helper ━━
function isAdmin(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

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

    return NextResponse.json(contact)
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

  // If email is being updated, check for duplicates (excluding current contact)
  if (data.email) {
    const existing = await db.contact.findFirst({
      where: { email: data.email, NOT: { id } },
    })
    if (existing) {
      return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 })
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

  // If isPrimary is being set to true, unset other primary contacts for same client/lead (transactional)
  if (sanitizedData.isPrimary === true) {
    // Get current contact to find client/lead
    const current = await db.contact.findUnique({ where: { id } })
    if (current) {
      const targetClientId = (sanitizedData.clientId as string) ?? current.clientId
      const targetLeadId = (sanitizedData.leadId as string) ?? current.leadId

      await db.$transaction(async (tx) => {
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
      })
    }
  }

  try {
    const contact = await db.contact.update({
      where: { id },
      data: sanitizedData,
      include: {
        client: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(contact)
  } catch (error: unknown) {
    console.error("Error updating contact:", error)
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}

// DELETE /api/contacts/[id] - Hard delete contact
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  try {
    // Check if contact exists first
    const existing = await db.contact.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    await db.contact.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting contact:", error)
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 })
  }
}
