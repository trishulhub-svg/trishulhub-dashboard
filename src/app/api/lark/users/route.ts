import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ensureAllTables } from "@/lib/auto-migrate"
import { isAdmin } from "@/lib/rbac"
import { db } from "@/lib/db"
import { getAllUsers } from "@/lib/lark/client"
import { getLarkConfig, getLarkToken } from "@/lib/lark/auth"

// ── In-memory cache for Lark users list (5-minute TTL) ──
let larkUsersCache: {
  data: Array<{ open_id: string; name: string; email?: string }>
  fetchedAt: number
} | null = null
const LARK_USERS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getCachedLarkUsers(): Promise<{
  users: Array<{ open_id: string; name: string; email?: string }>
  error: string | null
}> {
  // Return cached data if still valid
  if (larkUsersCache && Date.now() - larkUsersCache.fetchedAt < LARK_USERS_CACHE_TTL) {
    return { users: larkUsersCache.data, error: null }
  }

  let larkUsers: Array<{ open_id: string; name: string; email?: string }> = []
  let larkError: string | null = null
  try {
    const token = await getLarkToken()
    if (token) {
      const fetched = await getAllUsers()
      larkUsers = fetched.map((u) => ({ open_id: u.open_id, name: u.name, email: u.email }))
      // Update cache
      larkUsersCache = { data: larkUsers, fetchedAt: Date.now() }
    }
  } catch (err) {
    larkError = err instanceof Error ? err.message : "Failed to fetch Lark users"
  }

  return { users: larkUsers, error: larkError }
}

function invalidateLarkUsersCache() {
  larkUsersCache = null
}

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

    const { searchParams } = new URL(req.url)
    const autoMatch = searchParams.get("autoMatch") === "true"
    const allLarkUsersParam = searchParams.get("allLarkUsers") === "true"

    // If autoMatch=true, run auto-matching first
    if (autoMatch) {
      await performAutoMatch()
    }

    // Get Lark users (with caching)
    const { users: larkUsers, error: larkError } = await getCachedLarkUsers()

    // Build error/warning messages for the caller
    let responseLarkError: string | null = null
    if (larkError) {
      responseLarkError = larkError
    } else if (larkUsers.length === 0) {
      responseLarkError = "No Lark users found — check if contact:contact.base:readonly scope is enabled in Lark app settings."
    } else if (!larkUsers.some((lu) => lu.email)) {
      responseLarkError = "Lark users found but none have email addresses. Enable contact:contact.base:readonly scope in Lark app settings to retrieve email fields."
    }

    // If allLarkUsers=true, return the full Lark users list directly
    if (allLarkUsersParam) {
      return NextResponse.json({
        allLarkUsers: larkUsers,
        totalLarkUsers: larkUsers.length,
        larkError: responseLarkError,
      })
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

    // Build response with mapping status
    const result = users.map((user) => {
      const mapping = mappingMap.get(user.id)

      // Try email match first, then name match as fallback
      const larkUserByEmail = larkUsers.find((lu) => lu.email?.toLowerCase() === user.email?.toLowerCase())
      const larkUserByName = !larkUserByEmail && user.name
        ? larkUsers.find((lu) => lu.name?.toLowerCase() === user.name.toLowerCase())
        : null
      const larkUser = larkUserByEmail || larkUserByName
      const matchMethod = larkUserByEmail ? "email_auto" : larkUserByName ? "name_auto" : null

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        larkMapped: !!mapping,
        larkOpenId: mapping?.larkOpenId || larkUser?.open_id || null,
        larkName: mapping?.larkName || larkUser?.name || null,
        larkEmail: mapping?.larkEmail || larkUserByEmail?.email || null,
        matchedBy: mapping?.matchedBy || matchMethod,
        autoMatchAvailable: !mapping && !!larkUser,
        matchMethod: matchMethod || null,
      }
    })

    return NextResponse.json({
      users: result,
      totalLarkUsers: larkUsers.length,
      larkError: responseLarkError,
    })
  } catch (err) {
    console.error("[lark/users] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── Internal auto-match logic (shared between GET and PATCH) ──
async function performAutoMatch(): Promise<number> {
  const users = await db.user.findMany({
    where: { isActive: true, role: { not: "CLIENT" } },
    select: { id: true, name: true, email: true },
  })

  const existingMappings = await db.$queryRawUnsafe<Array<{ userId: string }>>(
    'SELECT "userId" FROM "LarkUserMapping"'
  )
  const mappedUserIds = new Set(existingMappings.map((m) => m.userId))

  const larkUsers = await getAllUsers()

  // Invalidate cache since we just fetched fresh data
  larkUsersCache = { data: larkUsers.map((u) => ({ open_id: u.open_id, name: u.name, email: u.email })), fetchedAt: Date.now() }

  const larkByEmail = new Map<string, { open_id: string; name: string; email?: string }>()
  const larkByName = new Map<string, { open_id: string; name: string; email?: string }>()
  for (const lu of larkUsers) {
    if (lu.email) larkByEmail.set(lu.email.toLowerCase(), lu)
    if (lu.name) larkByName.set(lu.name.toLowerCase(), lu)
  }

  let matched = 0
  for (const user of users) {
    if (mappedUserIds.has(user.id)) continue

    let larkUser = user.email ? larkByEmail.get(user.email.toLowerCase()) : null
    let matchBy = "email_auto"
    if (!larkUser && user.name) {
      larkUser = larkByName.get(user.name.toLowerCase())
      matchBy = "name_auto"
    }
    if (!larkUser) continue

    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "LarkUserMapping" ("id", "userId", "larkOpenId", "larkName", "larkEmail", "matchedBy", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      `map_${user.id}_${Date.now()}`,
      user.id,
      larkUser.open_id,
      larkUser.name || "",
      larkUser.email || "",
      matchBy
    )
    matched++
  }

  return matched
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

    const users = await db.user.findMany({
      where: { isActive: true, role: { not: "CLIENT" } },
      select: { id: true, name: true, email: true },
    })

    const matched = await performAutoMatch()

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