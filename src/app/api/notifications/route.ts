import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/notifications - List notifications for user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get("unread") === "true"

    const where: any = { userId }
    if (unreadOnly) where.isRead = false

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json(notifications)
  } catch (error: any) {
    console.error("[notifications] error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/notifications - Mark as read
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, isRead } = await req.json()
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
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

// PUT /api/notifications - Legacy: Mark as read
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: "Notification ID required" }, { status: 400 })
    }

    // SECURITY: Verify notification belongs to the requesting user
    const notification = await db.notification.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    await db.notification.update({ where: { id }, data: { isRead: true } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[notifications] error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
