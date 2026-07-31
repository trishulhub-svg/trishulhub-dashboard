/**
 * GET /api/time-tracking/active-me
 * Lightweight: is the current user clocked in? Used by global header indicator.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(
      `tt-active-me-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const rows = await db.$queryRawUnsafe<
      Array<{
        id: string
        clockIn: string
        activityType: string | null
        description: string | null
        projectName: string | null
      }>
    >(
      `SELECT t."id" as id, t."clockIn" as clockIn, t."activityType" as activityType,
        t."description" as description, p."name" as projectName
       FROM "TimeEntry" t
       LEFT JOIN "Project" p ON p."id" = t."projectId"
       WHERE t."userId" = ? AND t."status" = 'ACTIVE'
       ORDER BY t."clockIn" DESC
       LIMIT 1`,
      session.user.id
    )

    const row = rows[0]
    if (!row) {
      return NextResponse.json({ active: false })
    }

    const label =
      row.projectName ||
      (row.activityType === "TRAINING"
        ? "Training"
        : row.activityType === "SUPERVISION"
          ? "Supervision"
          : row.activityType === "HR_ADMIN"
            ? "HR & Administration"
            : row.activityType === "RD_SA"
              ? "R&D / SA"
              : row.description?.trim() || "Clocked in")

    return NextResponse.json({
      active: true,
      entryId: row.id,
      clockIn: row.clockIn,
      label,
    })
  } catch (e) {
    console.error("[time-tracking/active-me GET]", e)
    return NextResponse.json({ error: "Failed to check clock status" }, { status: 500 })
  }
}
