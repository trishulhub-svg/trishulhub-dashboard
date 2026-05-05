// Chat Locking API - Prevents concurrent access to the same chat by different users
// POST: Acquire lock on a chat
// DELETE: Release lock
// GET: Check lock status

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role

    const chatId = req.nextUrl.searchParams.get("chatId")
    if (!chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 })
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { lockedBy: true, lockedAt: true, lockedByName: true, userId: true },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // SECURITY: Only the chat owner or admin can check lock status
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && chat.userId !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Auto-release stale locks (older than 30 minutes)
    const LOCK_TTL_MS = 30 * 60 * 1000
    if (chat.lockedBy && chat.lockedAt && (Date.now() - new Date(chat.lockedAt).getTime() > LOCK_TTL_MS)) {
      await db.chat.update({
        where: { id: chatId },
        data: { lockedBy: null, lockedAt: null, lockedByName: null },
      })
      return NextResponse.json({
        locked: false,
        lockedBy: null,
        lockedByName: null,
        lockedAt: null,
        message: "Stale lock auto-released",
      })
    }

    return NextResponse.json({
      locked: !!chat.lockedBy,
      lockedBy: chat.lockedBy,
      lockedByName: chat.lockedByName,
      lockedAt: chat.lockedAt?.toISOString() || null,
    })
  } catch (error: any) {
    console.error("[chat-lock] GET error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userName = session.user.name || session.user.email || "Unknown"
    const userRole = session.user.role
    const { chatId } = await req.json()

    if (!chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 })
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { lockedBy: true, lockedByName: true, lockedAt: true, status: true },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // If chat is ENDED, auto-release lock
    if (chat.status === "ENDED") {
      await db.chat.update({
        where: { id: chatId },
        data: { lockedBy: null, lockedAt: null, lockedByName: null },
      })
      return NextResponse.json({ locked: false, lockedBy: null, lockedByName: null, message: "Chat ended, lock released" })
    }

    // If already locked by the same user, just confirm
    if (chat.lockedBy === userId) {
      return NextResponse.json({ locked: true, lockedBy: userId, lockedByName: chat.lockedByName, message: "Already locked by you" })
    }

    // If locked by another user, check if current user is admin
    if (chat.lockedBy && chat.lockedBy !== userId) {
      if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
        // Admins can override locks
        await db.chat.update({
          where: { id: chatId },
          data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
        })
        return NextResponse.json({ locked: true, lockedBy: userId, lockedByName: userName, message: "Lock overridden by admin" })
      }
      return NextResponse.json({
        error: `This chat is currently being worked on by ${chat.lockedByName}`,
        lockedBy: chat.lockedBy,
        lockedByName: chat.lockedByName,
      }, { status: 423 })
    }

    // Acquire lock
    await db.chat.update({
      where: { id: chatId },
      data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
    })

    return NextResponse.json({ locked: true, lockedBy: userId, lockedByName: userName, message: "Lock acquired" })
  } catch (error: any) {
    console.error("[chat-lock] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const chatId = req.nextUrl.searchParams.get("chatId")

    if (!chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 })
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { lockedBy: true, lockedByName: true },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Only the locker or admin can release
    if (chat.lockedBy && chat.lockedBy !== userId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only the user who locked this chat or an admin can release it" }, { status: 403 })
    }

    await db.chat.update({
      where: { id: chatId },
      data: { lockedBy: null, lockedAt: null, lockedByName: null },
    })

    return NextResponse.json({ locked: false, message: "Lock released" })
  } catch (error: any) {
    console.error("[chat-lock] DELETE error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
