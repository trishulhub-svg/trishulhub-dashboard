import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
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

/** Mask a decrypted secret for display: show only the last 4 chars. */
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

function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "OTHER"
  const upper = raw.trim().toUpperCase()
  return (ALLOWED_CATEGORIES as readonly string[]).includes(upper) ? upper : "OTHER"
}

/**
 * GET /api/vault-secrets
 * List all vault secrets with masked key values. Never returns plaintext.
 * Access: SUPER_ADMIN or ADMIN
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!requireVaultAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const secrets = await db.vaultSecret.findMany({
      orderBy: { updatedAt: "desc" },
    })

    const masked = secrets.map((secret) => {
      let plaintext = ""
      try {
        plaintext = decryptFromJson(secret.keyValue || "")
      } catch {
        plaintext = ""
      }
      return {
        id: secret.id,
        name: secret.name,
        category: secret.category,
        keyValue: maskKeyValue(plaintext),
        notes: secret.notes,
        createdBy: secret.createdBy,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      }
    })

    return NextResponse.json(masked)
  } catch (error: unknown) {
    console.error(
      "[vault-secrets] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

/**
 * POST /api/vault-secrets
 * Create a new vault secret. keyValue is encrypted at rest.
 * Body: { name, category, keyValue, notes? }
 * Access: SUPER_ADMIN or ADMIN
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    if (!requireVaultAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (typeof body.keyValue !== "string" || !body.keyValue.trim()) {
      return NextResponse.json({ error: "Secret value is required" }, { status: 400 })
    }

    const name = body.name.trim().slice(0, 200)
    const category = normalizeCategory(body.category)
    const plaintextKeyValue = body.keyValue.trim()
    const notes =
      typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim().slice(0, 2000)
        : null

    let encryptedValue: string
    try {
      encryptedValue = safeEncryptKey(plaintextKeyValue)
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

    const secret = await db.vaultSecret.create({
      data: {
        name,
        category,
        keyValue: encryptedValue,
        notes,
        createdBy: session.user.id,
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "CREATE",
      entityType: "VaultSecret",
      entityId: secret.id,
      description: `Created vault secret "${secret.name}" (${secret.category})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json(
      {
        id: secret.id,
        name: secret.name,
        category: secret.category,
        keyValue: maskKeyValue(plaintextKeyValue),
        notes: secret.notes,
        createdBy: secret.createdBy,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error(
      "[vault-secrets] POST error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
