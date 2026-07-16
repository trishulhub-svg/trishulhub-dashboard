import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { decryptFromJson } from "@/lib/encryption"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

/**
 * POST /api/vault-secrets/reveal
 *
 * Returns the plaintext secret value once. List endpoints never return plaintext.
 *
 * Access: SUPER_ADMIN or ADMIN
 * Rate limit: 5 per minute per user
 * Audit: every reveal is logged
 *
 * Body: { id: string }
 * Returns: { success: true, keyValue: "<plaintext>" }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      )
    }

    const rl = rateLimit(`vault-secrets-reveal-${session.user.id}`, 5, 60_000)
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many reveal requests. Try again in a minute." },
        { status: 429 }
      )
    }

    let body: { id?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const id = body.id
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Secret ID is required" }, { status: 400 })
    }

    const secret = await db.vaultSecret.findUnique({
      where: { id },
      select: { id: true, name: true, keyValue: true, category: true },
    })

    if (!secret) {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 })
    }

    if (!secret.keyValue) {
      return NextResponse.json({ error: "No secret value set" }, { status: 404 })
    }

    let plaintext: string
    try {
      plaintext = decryptFromJson(secret.keyValue)
    } catch (err) {
      console.error(
        "[vault-secrets/reveal] decrypt error:",
        err instanceof Error ? err.message : String(err)
      )
      return NextResponse.json(
        { error: "Failed to decrypt secret. Check ENCRYPTION_KEY configuration." },
        { status: 500 }
      )
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "READ",
      entityType: "VaultSecret",
      entityId: secret.id,
      description: `Revealed vault secret "${secret.name}" (${secret.category})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, keyValue: plaintext })
  } catch (error: unknown) {
    console.error(
      "[vault-secrets/reveal] POST error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
