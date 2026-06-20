import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { encryptToJson, decryptFromJson } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

/** Mask a decrypted API key for display: show only the last 4 chars. */
function maskKeyValue(plaintext: string): string {
  if (!plaintext) return ""
  return `****${plaintext.slice(-4)}`
}

/** Encrypt a plaintext key for at-rest storage.
 * Falls back to plaintext if ENCRYPTION_KEY is not configured (dev only) —
 * logs a warning so it's not silent. */
function safeEncryptKey(plaintext: string): string {
  try {
    return encryptToJson(plaintext)
  } catch (err) {
    console.warn(
      "[api-keys] Encryption failed — storing plaintext as fallback. " +
      "Set ENCRYPTION_KEY to enable at-rest encryption:",
      err instanceof Error ? err.message : String(err)
    )
    return plaintext
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role

    // Only SUPER_ADMIN and ADMIN can view API keys (read access).
    // Write access (POST/PUT/DELETE) is restricted to SUPER_ADMIN — see below.
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const keys = await db.apiKey.findMany({
      orderBy: { priority: "asc" },
      include: {
        _count: {
          select: { usageLogs: true },
        },
      },
    })

    // SECURITY: Always mask key values (show only last 4 chars of the DECRYPTED
    // value) — even for SUPER_ADMIN. Full key values are NEVER returned in GET
    // to prevent leakage. Use POST /api/api-keys/reveal to view the plaintext.
    const maskedKeys = keys.map((key) => {
      let plaintext = ""
      try {
        plaintext = decryptFromJson(key.keyValue || "")
      } catch {
        plaintext = ""
      }
      return {
        ...key,
        keyValue: maskKeyValue(plaintext),
      }
    })

    return NextResponse.json(JSON.parse(JSON.stringify(maskedKeys)))
  } catch (error: unknown) {
    console.error("[api-keys] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // SECURITY (Phase A8): Only SUPER_ADMIN can create API keys.
    // Matches canManageApiKeys() in src/lib/rbac.ts.
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: super admin access required" }, { status: 403 })
    }

    const body = await req.json().catch(() => {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    })
    if (body instanceof NextResponse) return body

    // Validate required field types
    if (typeof body.keyName !== "string" || typeof body.keyValue !== "string") {
      return NextResponse.json({ error: "Key Name and API Key Value must be strings" }, { status: 400 })
    }

    if (!body.keyName || !body.keyValue) {
      return NextResponse.json({ error: "Key Name and API Key Value are required" }, { status: 400 })
    }

    const plaintextKeyValue = body.keyValue as string
    const encryptedKeyValue = safeEncryptKey(plaintextKeyValue)

    const config = await db.apiKey.create({
      data: {
        provider: body.provider || "OPENROUTER",
        keyName: body.keyName,
        keyValue: encryptedKeyValue,
        monthlyBudget: body.monthlyBudget || 18,
        currentSpend: 0,
        status: body.status || "ACTIVE",
        priority: body.priority || 1,
      },
    })

    // Audit log the key creation (do NOT log the key value itself)
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "CREATE",
      entityType: "ApiKey",
      entityId: config.id,
      description: `Created API key "${config.keyName}" (${config.provider})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    // Return the plaintext key value ONCE with a warning — it won't be shown
    // again in GET. The stored value is the encrypted envelope.
    return NextResponse.json(
      {
        ...config,
        keyValue: plaintextKeyValue,
        _warning: "Copy this key now. It won't be shown again.",
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("[api-keys] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // SECURITY (Phase A8): Only SUPER_ADMIN can update API keys.
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: super admin access required" }, { status: 403 })
    }

    let parsedBody: Record<string, unknown>
    try {
      parsedBody = await req.json() as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { id, ...body } = parsedBody
    if (!id || typeof id !== "string") return NextResponse.json({ error: "API key ID is required" }, { status: 400 })

    // SECURITY: Whitelist allowed fields only (prevent mass assignment)
    const data: Prisma.ApiKeyUncheckedUpdateInput = {}
    if (body.keyName !== undefined && body.keyName !== null) data.keyName = body.keyName as string
    if (body.keyValue !== undefined && body.keyValue !== null) {
      // Encrypt the new plaintext key value before storing
      data.keyValue = safeEncryptKey(body.keyValue as string)
    }
    if (body.provider !== undefined && body.provider !== null) data.provider = body.provider as string
    if (body.monthlyBudget !== undefined && body.monthlyBudget !== null) data.monthlyBudget = body.monthlyBudget as number
    if (body.status !== undefined && body.status !== null) data.status = body.status as string
    if (body.priority !== undefined && body.priority !== null) data.priority = body.priority as number
    if (body.currentSpend !== undefined && body.currentSpend !== null && session.user.role === "SUPER_ADMIN") data.currentSpend = body.currentSpend as number

    const key = await db.apiKey.update({ where: { id }, data })
    // SECURITY: Always mask key values in PUT response (consistent with GET)
    let plaintext = ""
    try {
      plaintext = decryptFromJson(key.keyValue || "")
    } catch {
      plaintext = ""
    }
    const masked = { ...key, keyValue: maskKeyValue(plaintext) }

    // Audit log the update
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "UPDATE",
      entityType: "ApiKey",
      entityId: id,
      description: body.keyValue
        ? `Updated API key "${key.keyName}" (including key value rotation)`
        : `Updated API key "${key.keyName}"`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json(JSON.parse(JSON.stringify(masked)))
  } catch (error: unknown) {
    console.error("[api-keys] PUT error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // SECURITY (Phase A8): Only SUPER_ADMIN can delete API keys
    // (already enforced before Phase A8 — kept as-is).
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can delete API keys" }, { status: 403 })
    }

    // Support both query param and JSON body for the ID
    let id: string | null = null

    // Try query param first
    const urlId = req.nextUrl.searchParams.get("id")
    if (urlId) {
      id = urlId
    } else {
      // Try JSON body
      try {
        const body = await req.json()
        id = body.id
      } catch {
        // No body
      }
    }

    if (!id) {
      return NextResponse.json({ error: "API key ID is required" }, { status: 400 })
    }

    // Look up the key for audit logging before deleting
    const keyForAudit = await db.apiKey.findUnique({
      where: { id },
      select: { keyName: true, provider: true },
    })

    // C20: Wrap all delete operations in a transaction for atomicity
    await db.$transaction(async (tx) => {
      // Delete usage logs for this key first (foreign key constraint)
      await tx.apiUsageLog.deleteMany({
        where: { apiKeyId: id as string },
      })

      await tx.apiKey.delete({ where: { id: id as string } })
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "SYSTEM",
      page: "api-keys",
      action: "DELETE",
      entityType: "ApiKey",
      entityId: id,
      description: `Deleted API key "${keyForAudit?.keyName || id}" (${keyForAudit?.provider || "unknown"})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[api-keys] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
