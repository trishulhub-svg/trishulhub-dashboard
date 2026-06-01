import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
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

    const permissions = await db.filePermission.findMany({
      where: { fileId },
      include: {
        file: false,
      },
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

    return NextResponse.json(JSON.parse(JSON.stringify(enriched)))
  } catch (error: unknown) {
    console.error("[files/permissions] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 })
  }
}

// ── POST: Grant permission to user ──
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

    const { fileId, targetUserId, accessLevel } = body

    if (!fileId || !targetUserId) {
      return NextResponse.json({ error: "fileId and userId are required" }, { status: 400 })
    }

    const validLevels = ["VIEW", "EDIT", "ADMIN"]
    const level = (accessLevel as string) || "VIEW"
    if (!validLevels.includes(level)) {
      return NextResponse.json({ error: "Invalid access level. Must be VIEW, EDIT, or ADMIN" }, { status: 400 })
    }

    // Check file exists
    const file = await db.fileMetadata.findUnique({ where: { id: fileId as string } })
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check target user exists
    const targetUser = await db.user.findUnique({ where: { id: targetUserId as string } })
    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 })
    }

    // Upsert permission
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

    return NextResponse.json(JSON.parse(JSON.stringify(permission)))
  } catch (error: unknown) {
    console.error("[files/permissions] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to grant permission" }, { status: 500 })
  }
}

// ── DELETE: Remove permission ──
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

    const { fileId, targetUserId } = body

    if (!fileId || !targetUserId) {
      return NextResponse.json({ error: "fileId and userId are required" }, { status: 400 })
    }

    await db.filePermission.deleteMany({
      where: {
        fileId: fileId as string,
        userId: targetUserId as string,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[files/permissions] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to remove permission" }, { status: 500 })
  }
}
