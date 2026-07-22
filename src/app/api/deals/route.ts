import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { z } from "zod"

const DEAL_STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] as const

const createDealSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  value: z.number().min(0).optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  clientId: z.string().min(1).optional().nullable(),
  leadId: z.string().min(1).optional().nullable(),
  currency: z.string().max(10).optional(),
})

const patchDealSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  value: z.number().min(0).optional(),
  stage: z.enum(DEAL_STAGES).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`deals-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const clientId = new URL(req.url).searchParams.get("clientId")
    const where: Prisma.DealWhereInput = clientId ? { clientId } : {}

    const deals = await db.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(deepSanitize(deals))
  } catch (error: unknown) {
    console.error("[deals] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`deals-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = createDealSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const { title, value, stage, clientId, leadId, currency } = parsed.data

    const deal = await db.deal.create({
      data: {
        title,
        value: value ?? 0,
        stage: stage ?? "LEAD",
        clientId: clientId ?? null,
        leadId: leadId ?? null,
        currency: currency ?? "INR",
        assignedToId: session.user.id,
      },
    })

    return NextResponse.json(deepSanitize(deal), { status: 201 })
  } catch (error: unknown) {
    console.error("[deals] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`deals-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = patchDealSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const { id, ...data } = parsed.data
    const deal = await db.deal.update({ where: { id }, data })
    return NextResponse.json(deepSanitize(deal))
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 })
    }
    console.error("[deals] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 })
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

    await db.deal.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 })
    }
    console.error("[deals] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 })
  }
}
