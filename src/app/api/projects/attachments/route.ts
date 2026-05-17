import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/projects/attachments — List attachments for a project
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = rateLimit(`attachments-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
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
      // C-PRJ-2 FIX: Check project membership for DEVELOPER/VIEWER too
      const member = await db.projectMember.findFirst({ where: { projectId, userId: session.user.id } })
      if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Return attachments WITHOUT fileData to keep payload small
  const attachments = await db.projectAttachment.findMany({
    where: { projectId },
    select: { id: true, fileName: true, fileSize: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(attachments)
}

// POST /api/projects/attachments — Upload a PDF attachment
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })

  const rl = rateLimit(`attachments-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  let body: { projectId?: string; fileName?: string; fileData?: string; fileSize?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { projectId, fileName, fileData, fileSize } = body
  if (!projectId || !fileName || !fileData) {
    return NextResponse.json({ error: "projectId, fileName, and fileData are required" }, { status: 400 })
  }

  // Validate file is a PDF by extension
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 })
  }

  // M-PRJ-10 FIX: Validate file content starts with PDF magic bytes (%PDF-)
  try {
    const decodedStart = Buffer.from(fileData.slice(0, 40), 'base64').toString('utf8')
    if (!decodedStart.startsWith('%PDF-')) {
      return NextResponse.json({ error: "Invalid PDF content — file does not appear to be a valid PDF" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "Invalid file data" }, { status: 400 })
  }

  // Verify project exists
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 400 })

  // Calculate actual file size from base64 (server-side, can't be spoofed)
  const actualSize = Buffer.byteLength(fileData, 'base64')
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (actualSize > maxSize) {
    return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 })
  }

  try {
    const attachment = await db.projectAttachment.create({
      data: {
        projectId,
        fileName,
        fileData, // base64 encoded
        fileSize: actualSize,
      },
    })
    return NextResponse.json({ id: attachment.id, fileName: attachment.fileName, fileSize: attachment.fileSize }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to upload attachment" }, { status: 500 })
  }
}

// DELETE /api/projects/attachments — Remove an attachment
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })

  const rl = rateLimit(`attachments-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Attachment ID is required" }, { status: 400 })

  try {
    // H-PRJ-1 FIX: Verify attachment exists before deleting
    const attachment = await db.projectAttachment.findUnique({ where: { id } })
    if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

    await db.projectAttachment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 })
  }
}

// GET /api/projects/attachments?download=id — Download file data
export async function PUT(req: NextRequest) {
  // Reuse PUT as download endpoint (returns fileData)
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = rateLimit(`attachments-download-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Attachment ID is required" }, { status: 400 })

  const attachment = await db.projectAttachment.findUnique({ where: { id } })
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

  // C-PRJ-2 FIX: Check project access for ALL non-admin roles
  // Previously only checked CLIENT, leaving DEVELOPER/VIEWER with full access
  if (!isAdmin(session.user.role)) {
    const project = await db.project.findUnique({ where: { id: attachment.projectId } })
    if (project) {
      if (session.user.role === "CLIENT") {
        const client = await db.client.findFirst({ where: { userId: session.user.id } })
        if (!client || client.id !== project.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      } else {
        // DEVELOPER, VIEWER: must be a project member to download
        const member = await db.projectMember.findFirst({ where: { projectId: attachment.projectId, userId: session.user.id } })
        if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }
  }

  return NextResponse.json({ id: attachment.id, fileName: attachment.fileName, fileData: attachment.fileData, fileSize: attachment.fileSize })
}
