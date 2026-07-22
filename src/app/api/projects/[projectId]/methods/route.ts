import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/projects/[projectId]/methods — Get methods assigned to a project
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // C2: Authorization check — non-admin/PM users must be a member of the project.
    // PROJECT_MANAGER can view methods since they have admin-like project access.
    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { projectId: id } = await params
    // W33: Validate projectId format
    if (!id || !/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    const methods = await db.$queryRawUnsafe(
      `SELECT pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id" WHERE j."B" = ? ORDER BY pm."name"`,
      id
    ) as unknown as Array<{ id: string; name: string }>

    return NextResponse.json(methods)
  } catch (error: unknown) {
    console.error("[project-methods] GET project methods failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch project methods" }, { status: 500 })
  }
}

// PUT /api/projects/[projectId]/methods — Assign methods to a project
export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // C1: Admin/PM authorization check
    if (!isAdminOrProjectManager(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 })

    const { projectId: id } = await params
    // W33: Validate projectId format
    if (!id || !/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    await ensureAllTables()

    let body: { methodIds?: string[] }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const methodIds = Array.isArray(body.methodIds) ? body.methodIds : []

    // C23: Validate method IDs against existing records
    if (methodIds.length > 0) {
      const validIds = methodIds.filter((m) => m && typeof m === "string")
      const placeholders = validIds.map(() => "?").join(", ")
      const existingMethods = await db.$queryRawUnsafe(
        `SELECT "id" FROM "ProjectMethod" WHERE "id" IN (${placeholders})`,
        ...validIds
      ) as unknown as Array<{ id: string }>
      const existingIdSet = new Set(existingMethods.map((m) => m.id))
      const invalidIds = validIds.filter((m) => !existingIdSet.has(m))
      if (invalidIds.length > 0) {
        return NextResponse.json({ error: `Invalid method IDs: ${invalidIds.join(", ")}` }, { status: 400 })
      }
    }

    // C9: Wrap delete-all + insert in a transaction
    await db.$transaction(async (tx) => {
      // Delete all existing assignments
      await tx.$executeRawUnsafe(`DELETE FROM "_ProjectMethodToProject" WHERE "B" = ?`, id)

      // Insert new assignments
      for (const methodId of methodIds) {
        if (methodId && typeof methodId === "string") {
          try {
            await tx.$executeRawUnsafe(
              `INSERT INTO "_ProjectMethodToProject" ("A", "B") VALUES (?, ?)`,
              methodId, id
            )
          } catch (err: any) {
            // Ignore duplicate/unique constraint errors
            if (!err?.message?.includes("UNIQUE") && !err?.message?.includes("unique")) {
              console.warn(`[project-methods] Failed to assign method ${methodId}:`, err?.message)
            }
          }
        }
      }
    })

    return NextResponse.json({ success: true, methodIds })
  } catch (error: unknown) {
    console.error("[project-methods] PUT project methods failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update project methods" }, { status: 500 })
  }
}
