import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// GET /api/earnings - Get salary/earnings for the current user (or a target user for admin)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    const { success: rateOk } = rateLimit(
      `earnings-get:${userId}`,
      RATE_LIMITS.finance.limit,
      RATE_LIMITS.finance.windowMs,
    )
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // Admins can pass ?userId=... to view another user's earnings
    const { searchParams } = new URL(req.url)
    const targetUserIdRaw = isAdmin ? searchParams.get("userId") : null

    // Phase 7c: Validate userId format to prevent IDOR / enumeration attacks.
    // Accept cuid-style identifiers (letters, digits, underscore, hyphen, 1-100 chars).
    if (targetUserIdRaw !== null && targetUserIdRaw !== "" && !/^[a-zA-Z0-9_-]{1,100}$/.test(targetUserIdRaw)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
    }

    const fetchUserId = targetUserIdRaw || userId
    const isCrossUserAccess = isAdmin && targetUserIdRaw && targetUserIdRaw !== userId

    await ensureAllTables().catch((err) => {
      console.error("[earnings] ensureAllTables failed:", err instanceof Error ? err.message : err)
    })

    // Phase 7c: Use aggregate query for accurate totals (no `take: 100` limit) and a separate
    // paginated fetch for the recent entries list.
    const [salaryEntries, totalAgg] = await Promise.all([
      db.expense.findMany({
        where: {
          category: "SALARY",
          employeeId: fetchUserId,
        },
        orderBy: { date: "desc" },
        take: 100,
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          paymentRef: true,
          createdAt: true,
        },
      }),
      db.expense.aggregate({
        where: {
          category: "SALARY",
          employeeId: fetchUserId,
        },
        _sum: { amount: true },
      }),
    ])

    // Calculate totals from the authoritative aggregate (not the limited list)
    const totalINR = totalAgg._sum.amount || 0
    // Approximate GBP conversion (1 GBP ≈ 105 INR)
    const totalGBP = totalINR / 105

    // Phase 7c: Audit log cross-user salary access (admin viewing another user's earnings)
    // Self-access is a routine read and not logged to avoid audit noise.
    if (isCrossUserAccess) {
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole,
        department: "BUSINESS", page: "earnings", action: "READ",
        entityType: "User", entityId: fetchUserId,
        description: `Admin viewed earnings for user ${fetchUserId}`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
    }

    return NextResponse.json({
      entries: salaryEntries,
      totalINR: Math.round(totalINR * 100) / 100,
      totalGBP: Math.round(totalGBP * 100) / 100,
    })
  } catch (error) {
    console.error("[earnings] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch earnings" }, { status: 500 })
  }
}