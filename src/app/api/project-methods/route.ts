import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/project-methods — List all project methods (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`project-methods-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    const methods = await db.projectMethod.findMany({ orderBy: { name: "asc" } })
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
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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

    // Ensure the updatedAt column exists — it may be missing on older deployments
    // due to a BigInt serialization bug in auto-migrate's PRAGMA table_info check.
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "ProjectMethod" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
      )
    } catch {
      // Column already exists — expected and OK
    }

    // Now safe to INSERT with all columns including updatedAt
    const id = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "ProjectMethod" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
        id, name, now, now
      )
    } catch (dbError: unknown) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
      }
      console.error("[project-methods] POST INSERT failed:", msg)
      return NextResponse.json({ error: "Failed to create method", debug: msg }, { status: 500 })
    }

    const method = await db.projectMethod.findUnique({ where: { id } })
    return NextResponse.json(method, { status: 201 })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[project-methods] POST failed:", errMsg)
    return NextResponse.json({ error: "Failed to create method", debug: errMsg }, { status: 500 })
  }
}

// PATCH /api/project-methods — Update a project method (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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

    // Ensure updatedAt column exists
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "ProjectMethod" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
      )
    } catch {
      // Column already exists — OK
    }

    // Update name and updatedAt
    const now = new Date().toISOString()
    try {
      await db.$executeRawUnsafe(
        `UPDATE "ProjectMethod" SET "name" = ?, "updatedAt" = ? WHERE "id" = ?`,
        name, now, body.id
      )
    } catch (dbError: unknown) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
      }
      console.error("[project-methods] PATCH UPDATE failed:", msg)
      return NextResponse.json({ error: "Failed to update method", debug: msg }, { status: 500 })
    }

    const method = await db.projectMethod.findUnique({ where: { id: body.id } })
    return NextResponse.json(method)
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[project-methods] PATCH failed:", errMsg)
    return NextResponse.json({ error: "Failed to update method", debug: errMsg }, { status: 500 })
  }
}

// DELETE /api/project-methods — Remove a project method (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`project-methods-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

    await ensureAllTables()

    // Nullify projectMethodId on any clients that reference this method
    try {
      await db.$executeRawUnsafe(`UPDATE "Client" SET "projectMethodId" = NULL WHERE "projectMethodId" = ?`, id)
    } catch {
      // Non-critical — client table might not have the column yet
    }
    // Delete the method
    await db.$executeRawUnsafe(`DELETE FROM "ProjectMethod" WHERE "id" = ?`, id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[project-methods] DELETE failed:", errMsg)
    return NextResponse.json({ error: "Failed to delete method", debug: errMsg }, { status: 500 })
  }
}
