import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { encryptToJson, decryptFromJson } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

const ALLOWED_CATEGORIES = [
  "BREVO",
  "OPENROUTER",
  "ZAI",
  "SMTP",
  "GOOGLE_AI",
  "NVIDIA",
  "OTHER",
] as const

function maskKeyValue(plaintext: string): string {
  if (!plaintext) return "****"
  return `****${plaintext.slice(-4)}`
}

/** Fail closed — never store vault secrets as plaintext. */
function safeEncryptKey(plaintext: string): string {
  return encryptToJson(plaintext)
}

function requireVaultAdmin(role: string | undefined): boolean {
  return role === "SUPER_ADMIN"
}

function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const upper = raw.trim().toUpperCase()
  return (ALLOWED_CATEGORIES as readonly string[]).includes(upper) ? upper : "OTHER"
}

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/vault-secrets/[id]
 * Update name, category, notes, and optionally rotate keyValue.
 * Access: SUPER_ADMIN or ADMIN
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  return updateSecret(req, context)
}

/** PUT mirrors PATCH for clients that prefer full-replacement semantics. */
export async function PUT(req: NextRequest, context: RouteContext) {
  return updateSecret(req, context)
}

async function updateSecret(req: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    if (!requireVaultAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: "Secret ID is required" }, { status: 400 })
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const existing = await db.vaultSecret.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 })
    }

    const data: Prisma.VaultSecretUncheckedUpdateInput = {}
    let rotatedValue = false

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
      }
      data.name = body.name.trim().slice(0, 200)
    }

    if (body.category !== undefined) {
      const cat = normalizeCategory(body.category)
      if (cat) data.category = cat
    }

    if (body.notes !== undefined) {
      if (body.notes === null || body.notes === "") {
        data.notes = null
      } else if (typeof body.notes === "string") {
        data.notes = body.notes.trim().slice(0, 2000)
      }
    }

    if (body.keyValue !== undefined && body.keyValue !== null) {
      if (typeof body.keyValue !== "string" || !body.keyValue.trim()) {
        return NextResponse.json({ error: "Secret value cannot be empty" }, { status: 400 })
      }
      try {
        data.keyValue = safeEncryptKey(body.keyValue.trim())
      } catch (err) {
        console.error(
          "[vault-secrets] ENCRYPTION_KEY missing or invalid — refusing plaintext store:",
          err instanceof Error ? err.message : String(err)
        )
        return NextResponse.json(
          { error: "Server encryption is not configured. Set ENCRYPTION_KEY before storing secrets." },
          { status: 503 }
        )
      }
      rotatedValue = true
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const updated = await db.vaultSecret.update({ where: { id }, data })

    let plaintext = ""
    try {
      plaintext = decryptFromJson(updated.keyValue || "")
    } catch {
      plaintext = ""
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "UPDATE",
      entityType: "VaultSecret",
      entityId: id,
      description: rotatedValue
        ? `Updated vault secret "${updated.name}" (including secret value rotation)`
        : `Updated vault secret "${updated.name}"`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      category: updated.category,
      keyValue: maskKeyValue(plaintext),
      notes: updated.notes,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error: unknown) {
    console.error(
      "[vault-secrets] PATCH error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

/**
 * DELETE /api/vault-secrets/[id]
 * Access: SUPER_ADMIN or ADMIN
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    if (!requireVaultAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: "Secret ID is required" }, { status: 400 })
    }

    const existing = await db.vaultSecret.findUnique({
      where: { id },
      select: { id: true, name: true, category: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 })
    }

    await db.vaultSecret.delete({ where: { id } })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "DELETE",
      entityType: "VaultSecret",
      entityId: id,
      description: `Deleted vault secret "${existing.name}" (${existing.category})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error(
      "[vault-secrets] DELETE error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
