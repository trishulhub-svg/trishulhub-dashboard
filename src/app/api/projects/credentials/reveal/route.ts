import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db, ensureProjectCredentialTable, getAppSetting } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"
import { decryptCredential } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log"

/** Load the credential encryption key from DB (or empty string if not set) */
async function loadCredDbKey(): Promise<string> {
  try { return await getAppSetting("credentialEncryptionKey") } catch { return "" }
}

// POST /api/projects/credentials/reveal — Decrypt one project credential password
// Body: { id: string }
// Rate limited: 10/min per user. Admin / PROJECT_MANAGER only. Audit logged.
export async function POST(req: NextRequest) {
  try {
    await ensureProjectCredentialTable()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`project-cred-reveal-${session.user.id}`, 10, 60_000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many reveal requests. Try again in a minute." }, { status: 429 })
    }

    let body: { id?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const id = body.id?.trim()
    if (!id) return NextResponse.json({ error: "Credential ID is required" }, { status: 400 })

    const cred = await db.projectCredential.findUnique({
      where: { id },
      select: { id: true, title: true, password: true, iv: true, tag: true, projectId: true },
    })
    if (!cred) return NextResponse.json({ error: "Credential not found" }, { status: 404 })

    const dbKey = await loadCredDbKey()
    let password: string
    try {
      password = decryptCredential(cred.password, cred.iv, cred.tag, dbKey || undefined)
    } catch {
      return NextResponse.json({ error: "Failed to decrypt credential" }, { status: 500 })
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "SYSTEM",
      page: "projects",
      action: "READ",
      entityType: "ProjectCredential",
      entityId: cred.id,
      description: buildDescription("READ", "project credential", `${cred.title} password revealed`),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ id: cred.id, password })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[project-credentials/reveal] POST error:", msg)
    return NextResponse.json({ error: "Failed to reveal credential" }, { status: 500 })
  }
}
