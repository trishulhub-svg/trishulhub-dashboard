import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { canExportAuditTrail, getAccessibleDepartments } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// TODO: Add PDF generation using a serverless-compatible library

// GET /api/audit-trail/export — Export as CSV
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!canExportAuditTrail(userRole)) {
      return NextResponse.json({ error: "Forbidden — export requires SUPER_ADMIN or ADMIN" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`audit-trail-export:${userId}`, RATE_LIMITS.financeWrite.limit, RATE_LIMITS.financeWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const department = searchParams.get("department") || ""
    const page = searchParams.get("page") || ""
    const action = searchParams.get("action") || ""
    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""

    const accessibleDepts = getAccessibleDepartments(userRole, session.user.department || undefined)

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {
      department: department ? department : { in: accessibleDepts },
    }
    if (page) where.page = page
    if (action) where.action = action
    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.createdAt = dateFilter
    }

    // Fetch logs (max 10000 for CSV export safety)
    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
    })

    // Build CSV
    const csvHeaders = [
      "Timestamp", "User ID", "User Name", "Role", "Department", "User Department",
      "Page", "Action", "Entity Type", "Entity ID", "Description",
      "Status", "IP Address", "User Agent",
    ]

    const escapeCsv = (val: string | null | undefined): string => {
      if (!val) return '""'
      const escaped = val.replace(/"/g, '""')
      return `"${escaped}"`
    }

    const rows = logs.map(log => [
      escapeCsv(log.createdAt.toISOString()),
      escapeCsv(log.userId),
      escapeCsv(log.userName),
      escapeCsv(log.userRole),
      escapeCsv(log.department),
      escapeCsv(log.userDepartment),
      escapeCsv(log.page),
      escapeCsv(log.action),
      escapeCsv(log.entityType),
      escapeCsv(log.entityId),
      escapeCsv(log.description),
      escapeCsv(log.status),
      escapeCsv(log.ipAddress),
      escapeCsv(log.userAgent),
    ].join(","))

    const csv = [csvHeaders.join(","), ...rows].join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-trail-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  } catch (error: unknown) {
    console.error("[audit-trail-export] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to export audit logs" }, { status: 500 })
  }
}
