import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureTrainingAssignmentSchema } from "@/lib/training-assignment-migrate"
import { sendTrainingBuzzEmail } from "@/lib/email"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { z } from "zod"

const bodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((d) => d.all === true || !!d.userId, {
    message: "Provide userId or all: true",
  })

type OpenRow = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: Date
  status: string
}

async function loadOpenByUsers(userIds?: string[]): Promise<OpenRow[]> {
  const where =
    userIds && userIds.length > 0
      ? { status: { not: "DONE" as const }, userId: { in: userIds } }
      : { status: { not: "DONE" as const } }
  return db.trainingAssignment.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { title: "asc" }],
    select: {
      id: true,
      userId: true,
      title: true,
      notes: true,
      dueDate: true,
      status: true,
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    await ensureTrainingAssignmentSchema()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const role = session.user.role || ""
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      return NextResponse.json({ error: "Only Admin or Super Admin can buzz training" }, { status: 403 })
    }

    const rl = rateLimit(
      `training-buzz-${session.user.id}`,
      RATE_LIMITS.crmWrite?.limit ?? 30,
      RATE_LIMITS.crmWrite?.windowMs ?? 60_000
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Too many buzz requests — wait a moment" }, { status: 429 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
    }

    const { userId, all } = parsed.data
    const openRows = await loadOpenByUsers(all ? undefined : userId ? [userId] : undefined)

    if (openRows.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        skipped: 0,
        failed: 0,
        message: all ? "No open trainings to buzz" : "This person has no open trainings",
      })
    }

    const byUser = new Map<string, OpenRow[]>()
    for (const row of openRows) {
      const list = byUser.get(row.userId) || []
      list.push(row)
      byUser.set(row.userId, list)
    }

    const users = await db.user.findMany({
      where: { id: { in: [...byUser.keys()] }, isActive: true },
      select: { id: true, name: true, email: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    let sent = 0
    let skipped = 0
    let failed = 0
    const results: Array<{ userId: string; name: string; ok: boolean; error?: string; count: number }> = []

    for (const [uid, items] of byUser) {
      const user = userMap.get(uid)
      if (!user?.email) {
        skipped += 1
        results.push({ userId: uid, name: user?.name || uid, ok: false, error: "No email / inactive", count: items.length })
        continue
      }
      const result = await sendTrainingBuzzEmail({
        to: user.email,
        userName: user.name || user.email,
        items: items.map((i) => ({
          title: i.title,
          dueDate: i.dueDate,
          status: i.status,
          notes: i.notes,
        })),
        triggeredBy: session.user.id,
      })
      if (result.success) {
        sent += 1
        results.push({ userId: uid, name: user.name || user.email, ok: true, count: items.length })
      } else {
        failed += 1
        results.push({
          userId: uid,
          name: user.name || user.email,
          ok: false,
          error: result.error || "Send failed",
          count: items.length,
        })
      }
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "LEARNING",
      page: "training-assign",
      action: "NOTIFY",
      entityType: "TrainingAssignment",
      entityId: all ? "buzz-all" : userId || "buzz",
      description: all
        ? `Buzzed all open training (${sent} sent, ${failed} failed, ${skipped} skipped)`
        : `Buzzed training for user ${userId} (${sent} sent)`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({ sent, failed, skipped, all: !!all, userId: userId || null }),
    })

    return NextResponse.json({
      ok: failed === 0,
      sent,
      failed,
      skipped,
      people: byUser.size,
      results,
      message:
        sent > 0
          ? `Sent ${sent} reminder email${sent === 1 ? "" : "s"}`
          : failed > 0
            ? "Could not send reminder emails — check SMTP"
            : "Nothing to send",
    })
  } catch (err) {
    console.error("[training/assignments/buzz]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send buzz emails" },
      { status: 500 }
    )
  }
}
