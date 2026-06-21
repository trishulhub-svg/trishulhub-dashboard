import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { encryptCredential } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ── Helpers ──

function isValidProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{10,50}$/.test(id)
}

/** Check if user is a member of the project, an admin, or a project manager */
async function canAccessProject(userId: string, role: string, projectId: string): Promise<boolean> {
  if (isAdminOrProjectManager(role)) return true
  const membership = await db.projectMember.findFirst({
    where: { userId, projectId },
    select: { id: true },
  })
  return !!membership
}

/** Serialize infrastructure for API response — masks all token fields */
function serializeInfra(infra: any) {
  return {
    id: infra.id,
    projectId: infra.projectId,
    githubRepoUrl: infra.githubRepoUrl || "",
    githubBranch: infra.githubBranch || "",
    tursoUrl: infra.tursoUrl || "",
    vercelProjectId: infra.vercelProjectId || "",
    deployUrl: infra.deployUrl || "",
    hasGithubToken: !!infra.githubTokenEnc,
    hasTursoToken: !!infra.tursoTokenEnc,
    // Token fields are NEVER returned in this endpoint — use /tokens/reveal
    updatedBy: infra.updatedBy || null,
    createdAt: infra.createdAt?.toISOString() ?? null,
    updatedAt: infra.updatedAt?.toISOString() ?? null,
  }
}

// ── GET: Fetch project infrastructure ──
// Returns non-secret fields + boolean flags for token presence.
// Available to: assigned project members + ADMIN+
export async function GET(
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

    // Access check
    const hasAccess = await canAccessProject(session.user.id, session.user.role, projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: not a project member" }, { status: 403 })
    }

    // Fetch or return empty placeholder
    const infra = await db.projectInfrastructure.findUnique({
      where: { projectId },
    })

    if (!infra) {
      return NextResponse.json({
        success: true,
        infrastructure: {
          id: null,
          projectId,
          githubRepoUrl: "",
          githubBranch: "",
          tursoUrl: "",
          vercelProjectId: "",
          deployUrl: "",
          hasGithubToken: false,
          hasTursoToken: false,
          updatedBy: null,
          createdAt: null,
          updatedAt: null,
        },
      })
    }

    return NextResponse.json({
      success: true,
      infrastructure: serializeInfra(infra),
    })
  } catch (error) {
    console.error("[infra] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch infrastructure" }, { status: 500 })
  }
}

// ── PUT: Update non-secret infrastructure fields ──
// Available to: ADMIN+ (project members can view but only admins edit)
export async function PUT(
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

    // Only ADMIN+ (including PROJECT_MANAGER) can edit infrastructure fields.
    // Token fields (POST endpoint) are still SUPER_ADMIN only.
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`infra-put-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 })
    }

    const body = await req.json()

    // Sanitize and validate non-secret fields
    const sanitize = (val: unknown, maxLen: number): string | null => {
      if (typeof val !== "string") return null
      const trimmed = val.trim().slice(0, maxLen)
      return trimmed || null
    }

    const data: {
      githubRepoUrl?: string | null
      githubBranch?: string | null
      tursoUrl?: string | null
      vercelProjectId?: string | null
      deployUrl?: string | null
      updatedBy?: string
    } = {}

    if ("githubRepoUrl" in body) data.githubRepoUrl = sanitize(body.githubRepoUrl, 500)
    if ("githubBranch" in body) data.githubBranch = sanitize(body.githubBranch, 100)
    if ("tursoUrl" in body) data.tursoUrl = sanitize(body.tursoUrl, 500)
    if ("vercelProjectId" in body) data.vercelProjectId = sanitize(body.vercelProjectId, 200)
    if ("deployUrl" in body) data.deployUrl = sanitize(body.deployUrl, 500)
    data.updatedBy = session.user.id

    // Upsert (create if doesn't exist, update if it does)
    const infra = await db.projectInfrastructure.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
    })

    // Audit log
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "TEAM_WORK",
      page: "projects",
      action: "UPDATE",
      entityType: "ProjectInfrastructure",
      entityId: infra.id,
      description: `Updated infrastructure for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      success: true,
      infrastructure: serializeInfra(infra),
    })
  } catch (error) {
    console.error("[infra] PUT error:", error)
    return NextResponse.json({ error: "Failed to update infrastructure" }, { status: 500 })
  }
}

// ── PUT tokens: Update encrypted token fields ──
// Available to: SUPER_ADMIN only
// This is a separate endpoint because tokens need special handling (encryption + audit)
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

    // Only SUPER_ADMIN can set tokens
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: super admin access required to set tokens" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`infra-tokens-${session.user.id}`, 10, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 })
    }

    const body = await req.json()
    const data: {
      githubTokenEnc?: string | null
      githubTokenIv?: string | null
      githubTokenTag?: string | null
      tursoTokenEnc?: string | null
      tursoTokenIv?: string | null
      tursoTokenTag?: string | null
      updatedBy?: string
    } = { updatedBy: session.user.id }

    // Encrypt GitHub token if provided
    if (typeof body.githubToken === "string" && body.githubToken.trim()) {
      const enc = encryptCredential(body.githubToken.trim())
      data.githubTokenEnc = enc.encrypted
      data.githubTokenIv = enc.iv
      data.githubTokenTag = enc.tag
    } else if (body.githubToken === "" || body.githubToken === null) {
      // Clear the token
      data.githubTokenEnc = null
      data.githubTokenIv = null
      data.githubTokenTag = null
    }

    // Encrypt Turso token if provided
    if (typeof body.tursoToken === "string" && body.tursoToken.trim()) {
      const enc = encryptCredential(body.tursoToken.trim())
      data.tursoTokenEnc = enc.encrypted
      data.tursoTokenIv = enc.iv
      data.tursoTokenTag = enc.tag
    } else if (body.tursoToken === "" || body.tursoToken === null) {
      data.tursoTokenEnc = null
      data.tursoTokenIv = null
      data.tursoTokenTag = null
    }

    // Upsert
    const infra = await db.projectInfrastructure.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
    })

    // Audit log (don't log the token value itself)
    const tokenChanges: string[] = []
    if ("githubTokenEnc" in data) tokenChanges.push(`githubToken=${data.githubTokenEnc ? "set" : "cleared"}`)
    if ("tursoTokenEnc" in data) tokenChanges.push(`tursoToken=${data.tursoTokenEnc ? "set" : "cleared"}`)

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "CONFIG_CHANGE",
      entityType: "ProjectInfrastructure",
      entityId: infra.id,
      description: `Updated tokens for project ${projectId}: ${tokenChanges.join(", ")}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      success: true,
      infrastructure: serializeInfra(infra),
    })
  } catch (error) {
    console.error("[infra] POST (tokens) error:", error)
    return NextResponse.json({ error: "Failed to update tokens" }, { status: 500 })
  }
}
