import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db, ensureProjectCredentialTable, getAppSetting } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { encryptCredential } from "@/lib/encryption"
import { createCredentialSchema, validateRequest } from "@/lib/validations"
import { canManageProjectSecrets } from "@/lib/project-access"

/** Load the credential encryption key from DB (or empty string if not set) */
async function loadCredDbKey(): Promise<string> {
  try { return await getAppSetting("credentialEncryptionKey") } catch { return "" }
}

// Helper: verify the user has access to a given project.
// ADMIN/SUPER_ADMIN/PROJECT_MANAGER always pass. CLIENT must own the project.
// DEVELOPER must be a member.
async function verifyProjectAccess(userId: string, userRole: string, projectId: string): Promise<boolean> {
  if (isAdminOrProjectManager(userRole)) return true
  const project = await db.project.findUnique({ where: { id: projectId }, select: { clientId: true } })
  if (!project) return false
  if (userRole === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    return !!client && client.id === project.clientId
  }
  // DEVELOPER or VIEWER: check project membership
  const member = await db.projectMember.findFirst({ where: { projectId, userId } })
  return !!member
}

// GET /api/projects/credentials — List credentials for a project
export async function GET(req: NextRequest) {
  try {
    await ensureProjectCredentialTable()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!canManageProjectSecrets(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`credentials-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("projectId")
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 })

    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    // SECURITY: Never return decrypted passwords in list responses.
    // Clients must call POST /api/projects/credentials/reveal for plaintext.
    const credentials = await db.projectCredential.findMany({
      where: { projectId },
      select: { id: true, title: true, username: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(credentials.map((cred) => ({ ...cred, hasPassword: true })))
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[credentials] GET error:", msg)
    return NextResponse.json({ error: `Failed to load credentials: ${msg.slice(0, 120)}` }, { status: 500 })
  }
}

// POST /api/projects/credentials — Create a new credential
export async function POST(req: NextRequest) {
  try {
    await ensureProjectCredentialTable()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageProjectSecrets(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`credentials-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = validateRequest(createCredentialSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { projectId, title, username, password } = validation.data

    const sanitizedTitle = title.trim().slice(0, 200)
    const sanitizedUsername = username.trim().slice(0, 500)
    const sanitizedPassword = password.trim().slice(0, 1000)

    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    const dbKey = await loadCredDbKey()
    const encrypted = encryptCredential(sanitizedPassword, dbKey || undefined)
    const credential = await db.projectCredential.create({
      data: {
        projectId,
        title: sanitizedTitle,
        username: sanitizedUsername,
        password: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag,
      },
    })
    return NextResponse.json({ id: credential.id, title: credential.title, username: credential.username }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[credentials] POST error:", msg)
    // Return specific error so the admin can diagnose
    const detail = msg.length > 120 ? msg.slice(0, 120) + "..." : msg
    return NextResponse.json({ error: `Failed to create credential: ${detail}` }, { status: 500 })
  }
}

// PATCH /api/projects/credentials — Update a credential
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageProjectSecrets(session.user.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`credentials-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: { id?: string; title?: string; username?: string; password?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body.id) return NextResponse.json({ error: "Credential ID is required" }, { status: 400 })

    const existing = await db.projectCredential.findUnique({ where: { id: body.id } })
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 })

    // Verify project-level authorization
    const hasAccess = await verifyProjectAccess(session.user.id, session.user.role, existing.projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: No access to this credential's project" }, { status: 403 })
    }

    // Verify the associated project exists
    const project = await db.project.findUnique({ where: { id: existing.projectId } })
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    // Use proper Prisma data type instead of Record<string, unknown>
    const data: Prisma.ProjectCredentialUncheckedUpdateInput = {}
    if (body.title) data.title = body.title.trim().slice(0, 200)
    if (body.username) data.username = body.username.trim().slice(0, 500)
    if (body.password) {
      const dbKey = await loadCredDbKey()
      const encrypted = encryptCredential(body.password.trim().slice(0, 1000), dbKey || undefined)
      data.password = encrypted.encrypted
      data.iv = encrypted.iv
      data.tag = encrypted.tag
    }

    const credential = await db.projectCredential.update({
      where: { id: body.id },
      data,
    })
    return NextResponse.json({ id: credential.id, title: credential.title, username: credential.username })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[credentials] PATCH error:", msg)
    return NextResponse.json({ error: `Failed to update credential: ${msg.slice(0, 120)}` }, { status: 500 })
  }
}

// DELETE /api/projects/credentials — Remove a credential
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageProjectSecrets(session.user.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`credentials-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Credential ID is required" }, { status: 400 })

    // Verify credential exists before deleting
    const existing = await db.projectCredential.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 })

    // Verify project-level authorization
    const hasAccess = await verifyProjectAccess(session.user.id, session.user.role, existing.projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: No access to this credential's project" }, { status: 403 })
    }

    await db.projectCredential.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[credentials] DELETE error:", msg)
    return NextResponse.json({ error: `Failed to delete credential: ${msg.slice(0, 120)}` }, { status: 500 })
  }
}