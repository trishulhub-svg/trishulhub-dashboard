import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, canPerformFileAction, getDescendantFileIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// ── GET: List permissions for a file ──
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    // Rate limit
    const rl = rateLimit(`file-perms-get-${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const fileId = searchParams.get("fileId")

    if (!fileId) {
      return NextResponse.json({ error: "fileId query parameter is required" }, { status: 400 })
    }

    // Verify user has access to view permissions
    const canView = await canPerformFileAction(fileId, userId, role, "view")
    if (!canView && !isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const permissions = await db.filePermission.findMany({
      where: { fileId },
    })

    // Enrich with user names
    const enriched = await Promise.all(
      permissions.map(async (perm) => {
        const user = await db.user.findUnique({
          where: { id: perm.userId },
          select: { id: true, name: true, email: true, role: true },
        })
        return {
          ...perm,
          user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
        }
      })
    )

    // Also get the file creator info
    const file = await db.fileMetadata.findUnique({
      where: { id: fileId },
      select: { createdBy: true },
    })

    let creator: { id: string; name: string; email: string; role: string } | null = null
    if (file?.createdBy) {
      const creatorUser = await db.user.findUnique({
        where: { id: file.createdBy },
        select: { id: true, name: true, email: true, role: true },
      })
      if (creatorUser) creator = creatorUser
    }

    return NextResponse.json(JSON.parse(JSON.stringify({
      permissions: enriched,
      creator,
    })))
  } catch (error: unknown) {
    console.error("[files/permissions] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 })
  }
}

// ── POST: Grant permission to user (supports folder cascade) ──
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    if (!isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden. Only admins can manage permissions." }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`file-perms-write-${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json() as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { fileId, targetUserId, accessLevel, cascade } = body

    if (!fileId || !targetUserId) {
      return NextResponse.json({ error: "fileId and userId are required" }, { status: 400 })
    }

    const validLevels = ["VIEW", "EDIT", "ADMIN"]
    const level = (accessLevel as string) || "VIEW"
    if (!validLevels.includes(level)) {
      return NextResponse.json({ error: "Invalid access level. Must be VIEW, EDIT, or ADMIN" }, { status: 400 })
    }

    // Check caller can manage permissions on this file
    const canManage = await canPerformFileAction(fileId as string, userId, role, "manage_permissions")
    if (!canManage) {
      return NextResponse.json({ error: "You don't have permission to manage access for this file." }, { status: 403 })
    }

    // Cannot change the creator's access
    const file = await db.fileMetadata.findUnique({
      where: { id: fileId as string },
      select: { createdBy: true, driveFileId: true, id: true },
    })
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check target user exists
    const targetUser = await db.user.findUnique({ where: { id: targetUserId as string } })
    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 })
    }

    // Prevent removing creator's implicit OWNER access
    if (file.createdBy === targetUserId) {
      return NextResponse.json({ error: "Cannot modify the file creator's access. They always have OWNER access." }, { status: 400 })
    }

    // Upsert permission on this file
    const permission = await db.filePermission.upsert({
      where: {
        fileId_userId: {
          fileId: fileId as string,
          userId: targetUserId as string,
        },
      },
      update: {
        accessLevel: level,
        grantedBy: userId,
      },
      create: {
        fileId: fileId as string,
        driveFileId: file.driveFileId,
        userId: targetUserId as string,
        accessLevel: level,
        grantedBy: userId,
      },
    })

    let cascadeCount = 0

    // Cascade: if this is a folder and cascade=true, apply same permission to all descendants
    if (cascade === true) {
      const descendantIds = await getDescendantFileIds(file.driveFileId)

      for (const descId of descendantIds) {
        // Skip if target user is the creator of the descendant
        const descFile = await db.fileMetadata.findUnique({
          where: { id: descId },
          select: { createdBy: true, driveFileId: true },
        })
        if (!descFile || descFile.createdBy === targetUserId) continue

        await db.filePermission.upsert({
          where: {
            fileId_userId: {
              fileId: descId,
              userId: targetUserId as string,
            },
          },
          update: {
            accessLevel: level,
            grantedBy: userId,
          },
          create: {
            fileId: descId,
            driveFileId: descFile.driveFileId,
            userId: targetUserId as string,
            accessLevel: level,
            grantedBy: userId,
          },
        })
        cascadeCount++
      }
    }

    return NextResponse.json(JSON.parse(JSON.stringify({
      permission,
      cascadeCount,
      message: cascadeCount > 0
        ? `Permission granted to ${cascadeCount + 1} items (folder + ${cascadeCount} children)`
        : "Permission granted",
    })))
  } catch (error: unknown) {
    console.error("[files/permissions] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to grant permission" }, { status: 500 })
  }
}

// ── DELETE: Remove permission (supports cascade) ──
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    if (!isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden. Only admins can manage permissions." }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`file-perms-write-${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json() as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { fileId, targetUserId, cascade } = body

    if (!fileId || !targetUserId) {
      return NextResponse.json({ error: "fileId and userId are required" }, { status: 400 })
    }

    // Check caller can manage permissions
    const canManage = await canPerformFileAction(fileId as string, userId, role, "manage_permissions")
    if (!canManage) {
      return NextResponse.json({ error: "You don't have permission to manage access for this file." }, { status: 403 })
    }

    // Cannot remove creator's access
    const file = await db.fileMetadata.findUnique({
      where: { id: fileId as string },
      select: { createdBy: true, driveFileId: true },
    })
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (file.createdBy === targetUserId) {
      return NextResponse.json({ error: "Cannot remove the file creator's access." }, { status: 400 })
    }

    // Remove permission on this file
    await db.filePermission.deleteMany({
      where: {
        fileId: fileId as string,
        userId: targetUserId as string,
      },
    })

    let cascadeCount = 0

    // Cascade: if this is a folder and cascade=true, remove from all descendants
    if (cascade === true) {
      const descendantIds = await getDescendantFileIds(file.driveFileId)

      for (const descId of descendantIds) {
        const result = await db.filePermission.deleteMany({
          where: {
            fileId: descId,
            userId: targetUserId as string,
          },
        })
        cascadeCount += result.count
      }
    }

    return NextResponse.json({
      success: true,
      cascadeCount,
      message: cascadeCount > 0
        ? `Permission removed from ${1 + cascadeCount} items`
        : "Permission removed",
    })
  } catch (error: unknown) {
    console.error("[files/permissions] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to remove permission" }, { status: 500 })
  }
}
