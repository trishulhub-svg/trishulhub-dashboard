/**
 * GET/PUT /api/time-tracking/activity-catalog
 * Super Admin: configure non-project activity labels / visibility for the timer picker.
 * Project names remain owned by the Projects section (demo projects included as projects).
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  activitiesVisibleForRole,
  getTimeActivityCatalog,
  saveTimeActivityCatalog,
  type TimeActivityKey,
} from "@/lib/time-activity-catalog"
import { z } from "zod"

const putSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(["TRAINING", "SUPERVISION", "HR_ADMIN", "RD_SA"]),
        label: z.string().trim().min(1).max(60),
        enabled: z.boolean(),
      })
    )
    .min(1)
    .max(10),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const catalog = await getTimeActivityCatalog()
    const role = session.user.role
    return NextResponse.json({
      catalog,
      visible: activitiesVisibleForRole(catalog, role),
      canEdit: role === "SUPER_ADMIN",
    })
  } catch (e) {
    console.error("[time-tracking/activity-catalog GET]", e)
    return NextResponse.json({ error: "Failed to load activity catalog" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Only Super Admin can edit the activity list" }, { status: 403 })
    }

    const rl = rateLimit(
      `tt-activity-cat-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json().catch(() => null)
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const catalog = await saveTimeActivityCatalog(
      parsed.data.items as Array<{ key: TimeActivityKey; label: string; enabled: boolean }>
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "TEAM_WORK",
      page: "time-tracking",
      action: "CONFIG_CHANGE",
      entityType: "AppSetting",
      entityId: "time_activity_catalog",
      description: "Updated time-tracking activity catalog (non-project activities)",
      newValue: JSON.stringify(catalog),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ catalog, canEdit: true })
  } catch (e) {
    console.error("[time-tracking/activity-catalog PUT]", e)
    return NextResponse.json({ error: "Failed to save activity catalog" }, { status: 500 })
  }
}
