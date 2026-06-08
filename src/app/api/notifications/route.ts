import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { ensureAllTables } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"

// Cleanup old notifications (fire-and-forget)
async function cleanupOldNotifications() {
  try {
    await db.notification.deleteMany({
      where: {
        AND: [
          { isRead: true },
          { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, // 30 days
        ],
      },
    })
    await db.notification.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // 90 days
      },
    })
  } catch (err) {
    console.warn("[notifications] Cleanup failed:", err)
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
    const page = parseInt(searchParams.get("page") || "1")
    const limit = 50

    // Fire-and-forget cleanup (C15)
    cleanupOldNotifications()

    // W23: Type-safe where clause
    const where: Prisma.NotificationWhereInput = { userId }
    if (unreadOnly) where.isRead = false

    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit, // W22: pagination
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { userId, isRead: false } }), // I18: unread count
    ])

    // I16: JSON.parse(JSON.stringify()) handles Prisma Date serialization for downstream consumers
    return NextResponse.json({
      notifications: JSON.parse(JSON.stringify(notifications)),
      total,
      page,
      hasMore: page * limit < total,
      unreadCount,
    })
  } catch (error: any) {
    console.error("[notifications] error:", error.message)
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

    // C14: Rate limiting
    const rl = rateLimit(`notifications-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // C13: Only SUPER_ADMIN/ADMIN can create notifications manually
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { title, message, type, link } = body as {
      title?: string
      message?: string
      type?: string
      link?: string
    }

    if (!title || !message) {
      return NextResponse.json(
        { error: "title and message are required" },
        { status: 400 }
      )
    }

    // W25: Explicitly reject invalid notification types
    const allowedTypes = ["INFO", "WARNING", "ERROR", "SUCCESS", "TASK", "APPROVAL", "AGENT"]
    const notificationType = type || "INFO"
    if (!allowedTypes.includes(notificationType)) {
      return NextResponse.json(
        { error: `Invalid notification type. Valid types: ${allowedTypes.join(", ")}` },
        { status: 400 }
      )
    }

    // C13/W26: Validate link field for safe URLs (prevent XSS)
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
    })

    // I16: JSON.parse(JSON.stringify()) handles Prisma Date serialization
    return NextResponse.json(JSON.parse(JSON.stringify(notification)))
  } catch (error: any) {
    console.error("[notifications] POST error:", error.message)
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

    // C14: Rate limiting
    const rl = rateLimit(`notifications-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // W21: Wrap body parsing in try/catch
    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { id, isRead, markAllRead } = body

    // Batch: mark all as read in one DB query instead of N requests
    if (markAllRead) {
      await db.notification.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true },
      })
      return NextResponse.json({ success: true, updated: true })
    }

    if (!id) {
      return NextResponse.json({ error: "Notification ID required" }, { status: 400 })
    }

    const notification = await db.notification.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    const updated = await db.notification.update({
      where: { id },
      data: { isRead: isRead !== undefined ? isRead : true },
    })
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[notifications] error:", error.message)
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

    // C14: Rate limiting
    const rl = rateLimit(`notifications-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Notification ID required" }, { status: 400 })
    }

    const notification = await db.notification.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    await db.notification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[notifications] error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
