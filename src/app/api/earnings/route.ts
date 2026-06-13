import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

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
    const targetUserId = isAdmin ? searchParams.get("userId") : null
    const fetchUserId = targetUserId || userId

    // Fetch salary expenses for the target user
    const salaryEntries = await db.expense.findMany({
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
    })

    // Calculate totals
    const totalINR = salaryEntries.reduce((sum, e) => sum + (e.amount || 0), 0)
    // Approximate GBP conversion (1 GBP ≈ 105 INR)
    const totalGBP = totalINR / 105

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