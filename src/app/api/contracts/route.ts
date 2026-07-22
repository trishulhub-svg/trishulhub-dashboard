import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { z } from "zod"

export const maxDuration = 60

const contractLinkSchema = z.object({
  clientId: z.string().min(1),
  contractUrl: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .url("Must be a valid URL")
        .refine(
          (u) => u.startsWith("https://") || u.startsWith("http://"),
          "Contract link must start with http:// or https://"
        ),
      z.null(),
    ])
    .optional(),
})

function normalizeContractUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  return trimmed === "" ? null : trimmed
}

/** GET /api/contracts?clientId= — return saved contract link for a client */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const clientId = new URL(req.url).searchParams.get("clientId")
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })

    const { success: rateOk } = rateLimit(
      `contracts-get:${session.user.id}`,
      RATE_LIMITS.crm.limit,
      RATE_LIMITS.crm.windowMs
    )
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, company: true, contractUrl: true },
    })
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    return NextResponse.json(
      deepSanitize({
        clientId: client.id,
        contractUrl: client.contractUrl ?? null,
        hasContract: Boolean(client.contractUrl),
      })
    )
  } catch (error: unknown) {
    console.error("[contracts] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load contract link" }, { status: 500 })
  }
}

/** PUT /api/contracts — save or clear a client's contract link */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { success: rateOk } = rateLimit(
      `contracts-put:${session.user.id}`,
      RATE_LIMITS.crmWrite.limit,
      RATE_LIMITS.crmWrite.windowMs
    )
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = contractLinkSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const { clientId } = parsed.data
    const contractUrl = normalizeContractUrl(parsed.data.contractUrl ?? null)

    const existing = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, contractUrl: true },
    })
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    const client = await db.client.update({
      where: { id: clientId },
      data: { contractUrl },
      select: { id: true, name: true, company: true, contractUrl: true },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "BUSINESS",
      page: "clients",
      action: "UPDATE",
      entityType: "Client",
      entityId: clientId,
      description: contractUrl
        ? `Saved contract link for client: ${existing.name}`
        : `Cleared contract link for client: ${existing.name}`,
      oldValue: existing.contractUrl ?? undefined,
      newValue: contractUrl ?? undefined,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json(
      deepSanitize({
        clientId: client.id,
        contractUrl: client.contractUrl ?? null,
        hasContract: Boolean(client.contractUrl),
      })
    )
  } catch (error: unknown) {
    console.error("[contracts] PUT error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to save contract link" }, { status: 500 })
  }
}

/** DELETE /api/contracts?clientId= — clear saved contract link */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const clientId = new URL(req.url).searchParams.get("clientId")
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })

    await ensureAllTables()

    const existing = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, contractUrl: true },
    })
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    await db.client.update({
      where: { id: clientId },
      data: { contractUrl: null },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "BUSINESS",
      page: "clients",
      action: "DELETE",
      entityType: "Client",
      entityId: clientId,
      description: `Cleared contract link for client: ${existing.name}`,
      oldValue: existing.contractUrl || undefined,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, contractUrl: null, hasContract: false })
  } catch (error: unknown) {
    console.error("[contracts] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to clear contract link" }, { status: 500 })
  }
}
