import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/project-methods — List all project methods (admin/PM only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`project-methods-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    // Use raw SQL — only select id and name.
    // Avoids Prisma trying to SELECT "updatedAt" which may not exist on older deployments.
    const methods = await db.$queryRawUnsafe(
      `SELECT "id", "name" FROM "ProjectMethod" ORDER BY "name" ASC`
    ) as unknown as Array<{ id: string; name: string }>

    return NextResponse.json(methods)
  } catch (error: unknown) {
    console.error("[project-methods] GET failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch methods" }, { status: 500 })
  }
}

// POST /api/project-methods — Create a new project method (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`project-methods-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: { name?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const name = (body.name || "").trim()
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    await ensureAllTables()

    // W46: Use crypto.randomUUID() instead of weak ID generation
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // INSERT only id, name, createdAt — NEVER reference updatedAt.
    // On older deployments the updatedAt column may not exist in the table,
    // causing "table ProjectMethod has no column named updatedAt" error.
    // createdAt is safe because it has always been in the CREATE TABLE.
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "ProjectMethod" ("id", "name", "createdAt") VALUES (?, ?, ?)`,
        id, name, now
      )
    } catch (dbError: unknown) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
      }
      // If createdAt is also missing (very old table), insert just id and name
      if (msg.includes("no column named createdAt") || msg.includes("createdAt")) {
        try {
          await db.$executeRawUnsafe(
            `INSERT INTO "ProjectMethod" ("id", "name") VALUES (?, ?)`,
            id, name
          )
        } catch (dbError2: unknown) {
          const msg2 = dbError2 instanceof Error ? dbError2.message : String(dbError2)
          if (msg2.includes("UNIQUE") || msg2.includes("unique")) {
            return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
          }
          console.error("[project-methods] POST INSERT (fallback) failed:", msg2)
          return NextResponse.json({ error: "Failed to create method" }, { status: 500 })
        }
      } else {
        console.error("[project-methods] POST INSERT failed:", msg)
        return NextResponse.json({ error: "Failed to create method" }, { status: 500 })
      }
    }

    return NextResponse.json({ id, name, createdAt: now }, { status: 201 })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[project-methods] POST failed:", errMsg)
    return NextResponse.json({ error: "Failed to create method" }, { status: 500 })
  }
}

// PATCH /api/project-methods — Update a project method (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`project-methods-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: { id?: string; name?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body.id) return NextResponse.json({ error: "ID is required" }, { status: 400 })
    const name = (body.name || "").trim()
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    await ensureAllTables()

    // UPDATE only name — NEVER reference updatedAt
    try {
      await db.$executeRawUnsafe(
        `UPDATE "ProjectMethod" SET "name" = ? WHERE "id" = ?`,
        name, body.id
      )
    } catch (dbError: unknown) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
      }
      console.error("[project-methods] PATCH UPDATE failed:", msg)
      return NextResponse.json({ error: "Failed to update method" }, { status: 500 })
    }

    return NextResponse.json({ id: body.id, name })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[project-methods] PATCH failed:", errMsg)
    return NextResponse.json({ error: "Failed to update method" }, { status: 500 })
  }
}

// DELETE /api/project-methods — Remove a project method (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminOrProjectManager(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`project-methods-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

    await ensureAllTables()

    // Nullify projectMethodId on clients (safe — wrapped in try since column may not exist)
    try {
      await db.$executeRawUnsafe(`UPDATE "Client" SET "projectMethodId" = NULL WHERE "projectMethodId" = ?`, id)
    } catch {
      // Non-critical
    }

    // C13: Clean up join table before deleting the method
    try {
      await db.$executeRawUnsafe(`DELETE FROM "_ProjectMethodToProject" WHERE "A" = ?`, id)
    } catch {
      // Non-critical if join table doesn't exist
    }

    await db.$executeRawUnsafe(`DELETE FROM "ProjectMethod" WHERE "id" = ?`, id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[project-methods] DELETE failed:", errMsg)
    return NextResponse.json({ error: "Failed to delete method" }, { status: 500 })
  }
}
