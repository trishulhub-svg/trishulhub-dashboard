import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { ensureAllTables } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const notificationSchema = z.object({
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(1000),
  type: z.string().optional(),
  link: z.string().max(500).optional(),
})

const notificationPatchSchema = z.object({
  id: z.string().optional(),
  isRead: z.boolean().optional(),
  markAllRead: z.boolean().optional(),
})

let lastCleanup = 0

async function cleanupOldNotifications() {
  try {
    await db.notification.deleteMany({
      where: {
        AND: [
          { isRead: true },
          { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        ],
      },
    })
    await db.notification.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    })
  } catch (err: unknown) {
    console.warn("[notifications] Cleanup failed:", err instanceof Error ? err.message : String(err))
  }
}

// GET /api/notifications - List notifications for user
export async function GET(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get("unread") === "true"
    const countOnly = searchParams.get("countOnly") === "true"
    const page = parseInt(searchParams.get("page") || "1")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 50)

    // Lightweight badge poll — single count query
    if (countOnly) {
      const unreadCount = await db.notification.count({
        where: { userId, isRead: false },
      })
      return NextResponse.json({ unreadCount })
    }

    // Cleanup off the hot path for countOnly; keep debounced on list fetches
    if (Date.now() - lastCleanup > 3600000) {
      lastCleanup = Date.now()
      void cleanupOldNotifications()
    }

    const where: Prisma.NotificationWhereInput = { userId }
    if (unreadOnly) where.isRead = false

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          isRead: true,
          link: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where: { userId, isRead: false } }),
    ])

    return NextResponse.json({
      notifications,
      page,
      unreadCount,
    })
  } catch (error: unknown) {
    console.error("[notifications] error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/notifications - Create a notification
export async function POST(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`notifications-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = notificationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(", ")}` },
        { status: 400 }
      )
    }
    const { title, message, type, link } = parsed.data

    const allowedTypes = ["INFO", "WARNING", "ERROR", "SUCCESS", "TASK", "APPROVAL", "AGENT"]
    const notificationType = type || "INFO"
    if (!allowedTypes.includes(notificationType)) {
      return NextResponse.json(
        { error: `Invalid notification type. Valid types: ${allowedTypes.join(", ")}` },
        { status: 400 }
      )
    }

    if (link && !link.startsWith("/") && !link.startsWith("https://") && !link.startsWith("http://")) {
      return NextResponse.json({ error: "Invalid link URL" }, { status: 400 })
    }

    const notification = await db.notification.create({
      data: {
        userId: session.user.id,
        title: String(title).slice(0, 255),
        message: String(message).slice(0, 1000),
        type: notificationType,
        link: link ? String(link).slice(0, 500) : null,
      },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        isRead: true,
        link: true,
        createdAt: true,
      },
    })

    return NextResponse.json(notification)
  } catch (error: unknown) {
    console.error("[notifications] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/notifications - Mark as read (single or batch)
export async function PATCH(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`notifications-${session.user.id}`, 60, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = notificationPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(", ")}` },
        { status: 400 }
      )
    }
    const { id, isRead, markAllRead } = parsed.data

    if (markAllRead) {
      const result = await db.notification.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true },
      })
      return NextResponse.json({ success: true, updated: result.count })
    }

    if (!id) {
      return NextResponse.json({ error: "Notification ID required" }, { status: 400 })
    }

    const result = await db.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { isRead: isRead !== undefined ? isRead : true },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, id, isRead: isRead !== undefined ? isRead : true })
  } catch (error: unknown) {
    console.error("[notifications] PATCH error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/notifications - Delete a notification
export async function DELETE(req: NextRequest) {
  try {
    await ensureAllTables()

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`notifications-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Notification ID required" }, { status: 400 })
    }

    const result = await db.notification.deleteMany({
      where: { id, userId: session.user.id },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[notifications] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
