import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { canViewAuditTrail, getAccessibleDepartments } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/audit-trail — Query audit logs with filters
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
    const { success: rateOk } = rateLimit(`audit-trail:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const department = searchParams.get("department") || ""
    const page = searchParams.get("page") || ""
    const action = searchParams.get("action") || ""
    const userIdFilter = searchParams.get("userId") || ""
    const entityType = searchParams.get("entityType") || ""
    const entityId = searchParams.get("entityId") || ""
    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""
    const cursor = searchParams.get("cursor") || ""
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)

    // Build where clause based on RBAC
    const accessibleDepts = getAccessibleDepartments(userRole, session.user.department || undefined)

    const where: Prisma.AuditLogWhereInput = {}

    // Department filter (RBAC)
    if (department) {
      if (!accessibleDepts.includes(department)) {
        return NextResponse.json({ error: "Forbidden — cannot access this department" }, { status: 403 })
      }
      where.department = department
    } else {
      where.department = { in: accessibleDepts }
    }

    // Page filter
    if (page) where.page = page

    // Action filter
    if (action) where.action = action

    // User filter (only SUPER_ADMIN/ADMIN can filter by user)
    if (userIdFilter) {
      if (!["SUPER_ADMIN", "ADMIN"].includes(userRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      where.userId = userIdFilter
    }

    // Entity filters
    if (entityType) where.entityType = entityType
    if (entityId) where.entityId = entityId

    // Date range filter
    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.createdAt = dateFilter
    }

    // Search (description)
    if (search) {
      where.description = { contains: search }
    }

    // Status filter
    if (status) where.status = status

    // Cursor-based pagination — merge with existing date filter
    const cursorFilter: Prisma.AuditLogWhereInput = cursor
      ? { ...where, createdAt: { ...(where.createdAt as Prisma.DateTimeFilter | undefined), lt: new Date(cursor) } }
      : where

    const includeTotal = searchParams.get("includeTotal") === "1"

    // Lean select for list views (skip bulky optional fields)
    const select = {
      id: true,
      userId: true,
      userName: true,
      userRole: true,
      userDepartment: true,
      department: true,
      page: true,
      action: true,
      entityType: true,
      entityId: true,
      description: true,
      ipAddress: true,
      status: true,
      createdAt: true,
      oldValue: true,
      newValue: true,
    } as const

    const logsPromise = db.auditLog.findMany({
      where: cursorFilter,
      orderBy: { createdAt: "desc" },
      take: limit,
      select,
    })

    const [logs, total] = includeTotal
      ? await Promise.all([logsPromise, db.auditLog.count({ where })])
      : [await logsPromise, undefined as number | undefined]

    // Determine next cursor
    const nextCursor = logs.length === limit && logs.length > 0
      ? logs[logs.length - 1].createdAt.toISOString()
      : null

    return NextResponse.json({
      data: logs,
      nextCursor,
      ...(typeof total === "number" ? { total } : {}),
    })
  } catch (error: unknown) {
    console.error("[audit-trail] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 })
  }
}
