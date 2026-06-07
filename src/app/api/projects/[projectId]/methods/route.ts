import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/projects/[projectId]/methods — Get methods assigned to a project
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { projectId: id } = await params
    if (!id) return NextResponse.json({ error: "Project ID required" }, { status: 400 })

    await ensureAllTables()

    const methods = await db.$queryRawUnsafe(
      `SELECT pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id" WHERE j."B" = ? ORDER BY pm."name"`,
      id
    ) as Array<{ id: string; name: string }>

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

    const { projectId: id } = await params
    if (!id) return NextResponse.json({ error: "Project ID required" }, { status: 400 })

    await ensureAllTables()

    let body: { methodIds?: string[] }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const methodIds = Array.isArray(body.methodIds) ? body.methodIds : []

    // Delete all existing assignments
    await db.$executeRawUnsafe(`DELETE FROM "_ProjectMethodToProject" WHERE "B" = ?`, id)

    // Insert new assignments
    for (const methodId of methodIds) {
      if (methodId && typeof methodId === "string") {
        try {
          await db.$executeRawUnsafe(
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

    return NextResponse.json({ success: true, methodIds })
  } catch (error: unknown) {
    console.error("[project-methods] PUT project methods failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update project methods" }, { status: 500 })
  }
}
