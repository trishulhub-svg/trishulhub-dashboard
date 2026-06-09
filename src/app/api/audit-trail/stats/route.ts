import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { canViewAuditTrail, getAccessibleDepartments } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/audit-trail/stats — Get summary statistics
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!canViewAuditTrail(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureAllTables()

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`audit-trail-stats:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const accessibleDepts = getAccessibleDepartments(userRole, session.user.department || undefined)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Count per department
    const deptCounts = await db.auditLog.groupBy({
      by: ["department"],
      where: {
        department: { in: accessibleDepts },
      },
      _count: true,
      orderBy: { _count: { sort: "desc" } },
    })

    // Count per action type
    const actionCounts = await db.auditLog.groupBy({
      by: ["action"],
      where: {
        department: { in: accessibleDepts },
      },
      _count: true,
      orderBy: { _count: { sort: "desc" } },
    })

    // Total entries
    const total = await db.auditLog.count({
      where: { department: { in: accessibleDepts } },
    })

    // Today's entries
    const todayCount = await db.auditLog.count({
      where: {
        department: { in: accessibleDepts },
        createdAt: { gte: todayStart },
      },
    })

    // Recent 24h activity
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const recentLogs = await db.auditLog.findMany({
      where: {
        department: { in: accessibleDepts },
        createdAt: { gte: dayAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        department: true,
        page: true,
        action: true,
        description: true,
        userName: true,
        createdAt: true,
      },
    })

    // Status counts (SUCCESS vs FAILURE)
    const statusCounts = await db.auditLog.groupBy({
      by: ["status"],
      where: {
        department: { in: accessibleDepts },
      },
      _count: true,
    })

    return NextResponse.json({
      total,
      todayCount,
      departmentCounts: deptCounts.map(d => ({
        department: d.department,
        count: d._count,
      })),
      actionCounts: actionCounts.map(a => ({
        action: a.action,
        count: a._count,
      })),
      statusCounts: statusCounts.map(s => ({
        status: s.status,
        count: s._count,
      })),
      recentActivity: recentLogs,
    })
  } catch (error: unknown) {
    console.error("[audit-trail-stats] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load audit stats" }, { status: 500 })
  }
}
