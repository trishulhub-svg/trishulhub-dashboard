import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { decryptFromJson } from "@/lib/encryption"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

/**
 * POST /api/api-keys/reveal
 *
 * Returns the plaintext API key value. This is the ONLY endpoint that returns
 * the plaintext — GET /api/api-keys always returns masked values.
 *
 * Access: ADMIN+ (SUPER_ADMIN or ADMIN) — matches the read access of GET /api/api-keys
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

    // SECURITY: ADMIN+ can reveal (matches read access of GET /api/api-keys).
    // Write operations (POST/PUT/DELETE on /api/api-keys) remain SUPER_ADMIN-only.
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      )
    }

    // Strict rate limit on key reveals (5/min)
    const rl = rateLimit(`api-keys-reveal-${session.user.id}`, 5, 60_000)
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
      return NextResponse.json({ error: "API key ID is required" }, { status: 400 })
    }

    const apiKey = await db.apiKey.findUnique({
      where: { id },
      select: { id: true, keyName: true, keyValue: true, provider: true },
    })

    if (!apiKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }

    if (!apiKey.keyValue) {
      return NextResponse.json({ error: "No key value set" }, { status: 404 })
    }

    let plaintext: string
    try {
      plaintext = decryptFromJson(apiKey.keyValue)
    } catch (err) {
      console.error(
        "[api-keys/reveal] decrypt error:",
        err instanceof Error ? err.message : String(err)
      )
      return NextResponse.json(
        { error: "Failed to decrypt key. Check ENCRYPTION_KEY configuration." },
        { status: 500 }
      )
    }

    // Audit log the reveal (fire-and-forget)
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "api-keys",
      action: "READ",
      entityType: "ApiKey",
      entityId: apiKey.id,
      description: `Revealed API key "${apiKey.keyName}" (${apiKey.provider})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, keyValue: plaintext })
  } catch (error: unknown) {
    console.error(
      "[api-keys/reveal] POST error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
