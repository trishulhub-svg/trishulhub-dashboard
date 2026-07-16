import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { decryptCredential } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { rateLimit } from "@/lib/rate-limit"
import { canManageProjectSecrets, isValidProjectId } from "@/lib/project-access"

// ── POST: Reveal a project's encrypted token ──
// Admin / PROJECT_MANAGER only (matches project credentials reveal).
// Rate limited: 5 requests per minute per user. Audit logged.
//
// Body: { kind: "github" | "turso" }
// Returns: { token: "<plaintext>" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { projectId } = await params
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    // Secrets: Admin / PROJECT_MANAGER only (not regular members)
    if (!canManageProjectSecrets(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    // Rate limit — strict for token reveals (5/min)
    const rl = rateLimit(`infra-reveal-${session.user.id}`, 5, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limited — too many token reveals. Try again in a minute." }, { status: 429 })
    }

    const body = await req.json()
    const kind = body?.kind

    if (kind !== "github" && kind !== "turso") {
      return NextResponse.json({ error: "Invalid kind. Must be 'github' or 'turso'." }, { status: 400 })
    }

    // Fetch infrastructure record
    const infra = await db.projectInfrastructure.findUnique({
      where: { projectId },
    })

    if (!infra) {
      return NextResponse.json({ error: "No infrastructure configured for this project" }, { status: 404 })
    }

    // Decrypt the requested token
    let plaintext: string
    let hasToken: boolean

    if (kind === "github") {
      if (!infra.githubTokenEnc || !infra.githubTokenIv || !infra.githubTokenTag) {
        return NextResponse.json({ error: "No GitHub token set for this project" }, { status: 404 })
      }
      hasToken = true
      plaintext = decryptCredential(
        infra.githubTokenEnc,
        infra.githubTokenIv,
        infra.githubTokenTag
      )
    } else {
      if (!infra.tursoTokenEnc || !infra.tursoTokenIv || !infra.tursoTokenTag) {
        return NextResponse.json({ error: "No Turso token set for this project" }, { status: 404 })
      }
      hasToken = true
      plaintext = decryptCredential(
        infra.tursoTokenEnc,
        infra.tursoTokenIv,
        infra.tursoTokenTag
      )
    }

    if (!hasToken) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 })
    }

    // Audit log the reveal
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "READ",
      entityType: "ProjectInfrastructure",
      entityId: infra.id,
      description: `Revealed ${kind} token for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      success: true,
      kind,
      token: plaintext,
    })
  } catch (error) {
    console.error("[infra/tokens/reveal] POST error:", error)
    return NextResponse.json({ error: "Failed to reveal token" }, { status: 500 })
  }
}
