import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canPerformFileAction, isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import * as drive from "@/lib/google-drive"

function sanitize(str: string, max: number = 500): string {
  return str.replace(/<[^>]*>/g, "").slice(0, max)
}

// ── GET: Get single file details ──
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const { id } = await params
    const userId = session.user.id

    // Rate limit
    const rl = rateLimit(`file-get-${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const file = await db.fileMetadata.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            file: false,
          },
        },
      },
    })

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    return NextResponse.json(JSON.parse(JSON.stringify(file)))
  } catch (error: unknown) {
    console.error("[files/[id]] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 })
  }
}

// ── PUT: Rename, star/unstar, move, update description ──
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const { id } = await params
    const userId = session.user.id
    const role = session.user.role

    // Rate limit
    const rl = rateLimit(`file-write-${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json() as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const existing = await db.fileMetadata.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Permission check: need EDIT or higher to modify file
    const canEdit = await canPerformFileAction(id, userId, role, "edit")
    if (!canEdit) {
      return NextResponse.json({ error: "You don't have permission to edit this file. VIEW access only allows viewing and downloading." }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}

    // Rename
    if (body.name !== undefined && typeof body.name === "string") {
      const newName = sanitize(body.name, 500)
      if (newName) {
        try {
          await drive.renameFile(existing.driveFileId, newName)
        } catch (err) {
          console.error("[files/[id]] Drive rename error:", err)
        }
        updateData.name = newName
      }
    }

    // Star/Unstar
    if (body.starred !== undefined && typeof body.starred === "boolean") {
      updateData.starred = body.starred
    }

    // Move
    if (body.newParentId !== undefined && typeof body.newParentId === "string") {
      try {
        await drive.moveFile(existing.driveFileId, body.newParentId)
      } catch (err) {
        console.error("[files/[id]] Drive move error:", err)
      }
      updateData.parentId = body.newParentId
    }

    // Update description
    if (body.description !== undefined) {
      const desc = body.description === null ? null : sanitize(String(body.description), 2000)
      try {
        await drive.updateDescription(existing.driveFileId, desc || "")
      } catch (err) {
        console.error("[files/[id]] Drive description update error:", err)
      }
      updateData.description = desc
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const updated = await db.fileMetadata.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(JSON.parse(JSON.stringify(updated)))
  } catch (error: unknown) {
    console.error("[files/[id]] PUT error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update file" }, { status: 500 })
  }
}

// ── DELETE: Trash or permanently delete ──
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const { id } = await params
    const userId = session.user.id
    const role = session.user.role

    // Rate limit
    const rl = rateLimit(`file-delete-${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const permanent = searchParams.get("permanent") === "true"
    const restore = searchParams.get("restore") === "true"

    const existing = await db.fileMetadata.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Permission check: need DELETE permission (ADMIN/OWNER only)
    const canDelete = await canPerformFileAction(id, userId, role, "delete")
    if (!canDelete) {
      return NextResponse.json({ error: "You don't have permission to delete this file. Only ADMIN and OWNER can delete files." }, { status: 403 })
    }

    // Restore from trash
    if (restore) {
      try {
        await drive.restoreFile(existing.driveFileId)
      } catch (err) {
        console.error("[files/[id]] Drive restore error:", err)
      }
      await db.fileMetadata.update({
        where: { id },
        data: { trashed: false },
      })
      return NextResponse.json({ success: true })
    }

    // Delete from Google Drive
    try {
      await drive.deleteFile(existing.driveFileId, permanent)
    } catch (err) {
      console.error("[files/[id]] Drive delete error:", err)
    }

    // Update or delete local metadata
    if (permanent) {
      await db.fileMetadata.delete({ where: { id } })
    } else {
      await db.fileMetadata.update({
        where: { id },
        data: { trashed: true },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[files/[id]] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
  }
}
