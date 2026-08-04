import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { deepSanitize } from "@/lib/utils"
import { z } from "zod"

const createContactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().email("Valid email is required"),
  phone: z.string().trim().max(50).optional().nullable(),
  clientId: z.string().min(1).optional().nullable(),
  leadId: z.string().min(1).optional().nullable(),
})

const patchContactSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(50).optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`contacts-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const clientId = new URL(req.url).searchParams.get("clientId")
    const where: Prisma.ContactWhereInput = clientId ? { clientId } : {}

    const contacts = await db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(deepSanitize(contacts))
  } catch (error: unknown) {
    console.error("[contacts] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`contacts-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = createContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const { firstName, lastName, email, phone, clientId, leadId } = parsed.data

    const existing = await db.contact.findFirst({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 })
    }

    const contact = await db.contact.create({
      data: {
        firstName,
        lastName: lastName ?? null,
        email,
        phone: phone ?? null,
        clientId: clientId ?? null,
        leadId: leadId ?? null,
      },
    })

    return NextResponse.json(deepSanitize(contact), { status: 201 })
  } catch (error: unknown) {
    console.error("[contacts] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = patchContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const { id, email, ...rest } = parsed.data

    if (email) {
      const dup = await db.contact.findFirst({ where: { email, NOT: { id } } })
      if (dup) return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 })
    }

    const contact = await db.contact.update({
      where: { id },
      data: { ...rest, ...(email ? { email } : {}) },
    })
    return NextResponse.json(deepSanitize(contact))
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }
    console.error("[contacts] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    await db.contact.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }
    console.error("[contacts] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 })
  }
}
