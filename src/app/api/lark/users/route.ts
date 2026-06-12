import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ensureAllTables } from "@/lib/auto-migrate"
import { isAdmin } from "@/lib/rbac"
import { db } from "@/lib/db"
import { getAllUsers } from "@/lib/lark/client"
import { getLarkConfig, getLarkToken } from "@/lib/lark/auth"

// GET — List all TrishulHub users with their Lark mapping status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()

    const config = await getLarkConfig()
    if (!config?.appId || !config.appSecret) {
      return NextResponse.json({ error: "Lark not configured" }, { status: 400 })
    }

    // Get all active non-CLIENT users
    const users = await db.user.findMany({
      where: { isActive: true, role: { not: "CLIENT" } },
      select: { id: true, name: true, email: true, role: true, department: true },
      orderBy: { name: "asc" },
    })

    // Get existing mappings
    const mappings = await db.$queryRawUnsafe<Array<{ userId: string; larkOpenId: string; larkName: string; larkEmail: string; matchedBy: string }>>(
      'SELECT "userId", "larkOpenId", "larkName", "larkEmail", "matchedBy" FROM "LarkUserMapping"'
    )

    const mappingMap = new Map(mappings.map((m) => [m.userId, m]))

    // Try to get Lark users for auto-matching
    let larkUsers: Array<{ open_id: string; name: string; email?: string }> = []
    try {
      const token = await getLarkToken()
      if (token) {
        const fetched = await getAllUsers()
        larkUsers = fetched.map((u) => ({ open_id: u.open_id, name: u.name, email: u.email }))
      }
    } catch {
      // Non-critical
    }

    // Build response with mapping status
    const result = users.map((user) => {
      const mapping = mappingMap.get(user.id)
      const larkUser = larkUsers.find((lu) => lu.email?.toLowerCase() === user.email.toLowerCase())

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        larkMapped: !!mapping,
        larkOpenId: mapping?.larkOpenId || null,
        larkName: mapping?.larkName || larkUser?.name || null,
        larkEmail: mapping?.larkEmail || larkUser?.email || null,
        matchedBy: mapping?.matchedBy || null,
        autoMatchAvailable: !mapping && !!larkUser,
      }
    })

    return NextResponse.json({ users: result, totalLarkUsers: larkUsers.length })
  } catch (err) {
    console.error("[lark/users] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — Create or update a user mapping
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()

    const body = await req.json()
    const { userId, larkOpenId, larkName, larkEmail, matchedBy } = body as {
      userId: string
      larkOpenId: string
      larkName?: string
      larkEmail?: string
      matchedBy?: string
    }

    if (!userId || !larkOpenId) {
      return NextResponse.json({ error: "userId and larkOpenId are required" }, { status: 400 })
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Upsert mapping (delete existing, insert new — Turso safe)
    await db.$executeRawUnsafe('DELETE FROM "LarkUserMapping" WHERE "userId" = ?', userId)
    await db.$executeRawUnsafe(
      `INSERT INTO "LarkUserMapping" ("id", "userId", "larkOpenId", "larkName", "larkEmail", "matchedBy", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      `map_${userId}_${Date.now()}`,
      userId,
      larkOpenId,
      larkName || "",
      larkEmail || "",
      matchedBy || "manual"
    )

    return NextResponse.json({ success: true, message: `Mapped ${user.name} to Lark user` })
  } catch (err) {
    console.error("[lark/users] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH — Auto-match users by email
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()

    const body = await req.json()
    const { autoMatch } = body as { autoMatch: boolean }

    if (!autoMatch) {
      return NextResponse.json({ error: "Only autoMatch is supported" }, { status: 400 })
    }

    // Get all active non-CLIENT users
    const users = await db.user.findMany({
      where: { isActive: true, role: { not: "CLIENT" } },
      select: { id: true, name: true, email: true },
    })

    // Get existing mappings
    const existingMappings = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      'SELECT "userId" FROM "LarkUserMapping"'
    )
    const mappedUserIds = new Set(existingMappings.map((m) => m.userId))

    // Get all Lark users
    const larkUsers = await getAllUsers()
    const larkByEmail = new Map<string, { open_id: string; name: string; email?: string }>()
    for (const lu of larkUsers) {
      if (lu.email) {
        larkByEmail.set(lu.email.toLowerCase(), lu)
      }
    }

    let matched = 0
    for (const user of users) {
      if (mappedUserIds.has(user.id)) continue
      if (!user.email) continue

      const larkUser = larkByEmail.get(user.email.toLowerCase())
      if (larkUser) {
        await db.$executeRawUnsafe(
          `INSERT OR IGNORE INTO "LarkUserMapping" ("id", "userId", "larkOpenId", "larkName", "larkEmail", "matchedBy", "createdAt")
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          `map_${user.id}_${Date.now()}`,
          user.id,
          larkUser.open_id,
          larkUser.name || "",
          larkUser.email || "",
          "email_auto"
        )
        matched++
      }
    }

    return NextResponse.json({ success: true, matched, total: users.length })
  } catch (err) {
    console.error("[lark/users] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE — Remove a user mapping
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    await db.$executeRawUnsafe('DELETE FROM "LarkUserMapping" WHERE "userId" = ?', userId)

    return NextResponse.json({ success: true, message: "Mapping removed" })
  } catch (err) {
    console.error("[lark/users] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}