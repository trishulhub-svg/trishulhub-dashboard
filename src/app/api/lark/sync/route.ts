import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { ensureAllTables } from "@/lib/auto-migrate"
import { isAdmin } from "@/lib/rbac"
import { db } from "@/lib/db"
import { getLarkConfig } from "@/lib/lark/auth"

// GET — Fetch sync logs for the Lark sync dashboard
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const direction = searchParams.get("direction") || null
    const status = searchParams.get("status") || null

    let whereClause = "WHERE 1=1"
    const params: unknown[] = []

    if (direction) {
      whereClause += ' AND "direction" = ?'
      params.push(direction)
    }
    if (status) {
      whereClause += ' AND "status" = ?'
      params.push(status)
    }

    const query = `SELECT * FROM "LarkSyncLog" ${whereClause} ORDER BY "createdAt" DESC LIMIT ?`
    params.push(Math.min(limit, 200))

    const logs = await db.$queryRawUnsafe(query, ...params)

    return NextResponse.json({ logs, config: await getLarkConfig() ? { enabled: true } : { enabled: false } })
  } catch (err) {
    console.error("[lark/sync] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — Trigger a manual full sync of all tasks to Lark
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()

    const config = await getLarkConfig()
    if (!config?.enabled) {
      return NextResponse.json({ error: "Lark sync is disabled" }, { status: 400 })
    }

    // Get all tasks that need syncing
    const tasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        assignedTo: true,
        projectId: true,
        deadline: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    const { syncTaskToLark } = await import("@/lib/lark/sync")
    let synced = 0
    let failed = 0

    for (const task of tasks) {
      try {
        await syncTaskToLark(
          task.id,
          {
            title: task.title,
            description: task.description || undefined,
            status: task.status,
            priority: task.priority,
            assignedTo: task.assignedTo || undefined,
            projectId: task.projectId || undefined,
            deadline: task.deadline || undefined,
          },
          session.user.id
        )
        synced++
      } catch {
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      failed,
      total: tasks.length,
      message: `Synced ${synced} tasks to Lark (${failed} failed)`,
    })
  } catch (err) {
    console.error("[lark/sync] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}