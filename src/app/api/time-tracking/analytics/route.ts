import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/time-tracking/analytics - Analytics data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") || "employee" // employee | project
    // [FIX M8: Validate type parameter early]
    if (type !== "employee" && type !== "project") {
      return NextResponse.json({ error: "Invalid type. Use 'employee' or 'project'" }, { status: 400 })
    }
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")
    const filterUserId = searchParams.get("userId")
    const filterProjectId = searchParams.get("projectId")

    // Default to this week if no dates provided
    const now = new Date()
    let startDate: Date
    let endDate: Date

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam)
      endDate = new Date(endDateParam)
      // [FIX M9: Validate date parameters]
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format for startDate or endDate" }, { status: 400 })
      }
      endDate.setDate(endDate.getDate() + 1)
    } else {
      // This week (Monday to Sunday)
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1 // Monday = 0
      startDate = new Date(now)
      startDate.setDate(now.getDate() - diff)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 7)
    }

    const where: any = {
      date: { gte: startDate, lt: endDate },
      status: "COMPLETED",
    }

    // Non-admins only see their own
    if (!isAdminUser) {
      where.userId = userId
    } else if (filterUserId) {
      where.userId = filterUserId
    }

    if (filterProjectId) {
      where.projectId = filterProjectId
    }

    const entries = await db.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        project: { select: { id: true, name: true } },
      },
    })

    if (type === "employee") {
      // Group by employee
      const employeeMap = new Map<string, {
        userId: string
        name: string
        email: string
        role: string
        totalHours: number
        entries: number
      }>()

      for (const entry of entries) {
        const key = entry.userId
        if (!employeeMap.has(key)) {
          employeeMap.set(key, {
            userId: entry.userId,
            name: entry.user?.name || "Unknown",
            email: entry.user?.email || "",
            role: entry.user?.role || "",
            totalHours: 0,
            entries: 0,
          })
        }
        const emp = employeeMap.get(key)!
        emp.totalHours += entry.totalHours || 0
        emp.entries += 1
      }

      const result = Array.from(employeeMap.values())
        .sort((a, b) => b.totalHours - a.totalHours)
        .map((emp) => ({
          ...emp,
          totalHours: Math.round(emp.totalHours * 100) / 100,
        }))

      return NextResponse.json({
        type: "employee",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        data: result,
        totalHours: result.reduce((sum, e) => sum + e.totalHours, 0),
      })
    }

    if (type === "project") {
      // Group by project
      const projectMap = new Map<string, {
        projectId: string
        projectName: string
        totalHours: number
        entries: number
        contributors: Set<string>
      }>()

      for (const entry of entries) {
        const key = entry.projectId || "no-project"
        if (!projectMap.has(key)) {
          projectMap.set(key, {
            projectId: entry.projectId || "no-project",
            projectName: entry.project?.name || "No Project",
            totalHours: 0,
            entries: 0,
            contributors: new Set(),
          })
        }
        const proj = projectMap.get(key)!
        proj.totalHours += entry.totalHours || 0
        proj.entries += 1
        proj.contributors.add(entry.userId)
      }

      const result = Array.from(projectMap.values())
        .sort((a, b) => b.totalHours - a.totalHours)
        .map((proj) => ({
          projectId: proj.projectId,
          projectName: proj.projectName,
          totalHours: Math.round(proj.totalHours * 100) / 100,
          entries: proj.entries,
          contributorCount: proj.contributors.size,
        }))

      return NextResponse.json({
        type: "project",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        data: result,
        totalHours: result.reduce((sum, p) => sum + p.totalHours, 0),
      })
    }

    // This should never be reached due to early validation above
    return NextResponse.json({ error: "Unhandled analytics type" }, { status: 400 })
  } catch (error: any) {
    console.error("[time-tracking/analytics] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
