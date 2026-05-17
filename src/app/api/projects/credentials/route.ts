import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { encrypt, decrypt } from "@/lib/encryption"

// GET /api/projects/credentials — List credentials for a project
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = rateLimit(`credentials-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 })

  // Verify project exists
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  // For non-admin users, check project access
  if (!isAdmin(session.user.role)) {
    if (session.user.role === "CLIENT") {
      const client = await db.client.findFirst({ where: { userId: session.user.id } })
      if (!client || client.id !== project.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    } else {
      const member = await db.projectMember.findFirst({ where: { projectId, userId: session.user.id } })
      if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const credentials = await db.projectCredential.findMany({
    where: { projectId },
    select: { id: true, title: true, username: true, password: true, iv: true, tag: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  })

  // Decrypt passwords before sending to client
  const decrypted = credentials.map((cred) => {
    try {
      const password = decrypt(cred.password, cred.iv, cred.tag)
      return { ...cred, password, iv: undefined, tag: undefined }
    } catch {
      return { ...cred, password: "[DECRYPTION ERROR]", iv: undefined, tag: undefined }
    }
  })

  return NextResponse.json(decrypted)
}

// POST /api/projects/credentials — Create a new credential
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })

  const rl = rateLimit(`credentials-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  let body: { projectId?: string; title?: string; username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { projectId, title, username, password } = body
  if (!projectId || !title || !username || !password) {
    return NextResponse.json({ error: "projectId, title, username, and password are required" }, { status: 400 })
  }

  // Verify project exists
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 400 })

  try {
    const encrypted = encrypt(password)
    const credential = await db.projectCredential.create({
      data: {
        projectId,
        title: title.trim(),
        username: username.trim(),
        password: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag,
      },
    })
    return NextResponse.json({ id: credential.id, title: credential.title, username: credential.username }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 })
  }
}

// PATCH /api/projects/credentials — Update a credential
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })

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

  // H-PRJ-2 FIX: Verify the associated project exists
  const project = await db.project.findUnique({ where: { id: existing.projectId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  try {
    const data: Record<string, unknown> = {}
    if (body.title) data.title = body.title.trim()
    if (body.username) data.username = body.username.trim()
    if (body.password) {
      const encrypted = encrypt(body.password)
      data.password = encrypted.encrypted
      data.iv = encrypted.iv
      data.tag = encrypted.tag
    }

    const credential = await db.projectCredential.update({
      where: { id: body.id },
      data,
    })
    return NextResponse.json({ id: credential.id, title: credential.title, username: credential.username })
  } catch {
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 })
  }
}

// DELETE /api/projects/credentials — Remove a credential
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })

  const rl = rateLimit(`credentials-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Credential ID is required" }, { status: 400 })

  try {
    // H-PRJ-3 FIX: Verify credential exists before deleting
    const existing = await db.projectCredential.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 })

    await db.projectCredential.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 })
  }
}
