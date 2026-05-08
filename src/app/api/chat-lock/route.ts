// Chat Locking API - Prevents concurrent access to the same chat by different users
// POST: Acquire lock on a chat
// DELETE: Release lock
// GET: Check lock status

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// Lock TTL constant — 30 minutes
const LOCK_TTL_MS = 30 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    // Rate limiting for chat-lock GET
    const { success: getRateOk } = rateLimit(`chat-lock-get:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!getRateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

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
    // Rate limiting for chat-lock POST
    const { success: postRateOk } = rateLimit(`chat-lock-post:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!postRateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    const { chatId } = await req.json()

    if (!chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 })
    }

    // SECURITY: Verify the user has access to this chat's agent before locking
    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { id: true, userId: true, agentId: true },
    })
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }
    // Non-admin users can only lock chats they own or have access to
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && chat.userId !== userId) {
      const hasAccess = await db.userAgentAccess.findFirst({
        where: { userId, agentId: chat.agentId, canChat: true },
      })
      if (!hasAccess) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    // CRITICAL FIX: Atomic lock acquisition — use updateMany with condition
    // instead of findUnique + update (TOCTOU race condition). The old pattern
    // allowed two concurrent requests to both see lockedBy=null and both acquire the lock.
    const result = await db.chat.updateMany({
      where: { id: chatId, lockedBy: null },
      data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
    })

    if (result.count === 0) {
      // Lock already held — check if stale or owned by same user
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

      // Check if lock is stale (older than 30 minutes)
      if (chat.lockedAt && Date.now() - new Date(chat.lockedAt).getTime() > LOCK_TTL_MS) {
        // Force-acquire stale lock
        await db.chat.update({
          where: { id: chatId },
          data: { lockedBy: userId, lockedAt: new Date(), lockedByName: userName },
        })
        return NextResponse.json({ locked: true, lockedBy: userId, lockedByName: userName, message: "Stale lock force-acquired" })
      }

      // Already locked by us — refresh
      if (chat.lockedBy === userId) {
        await db.chat.update({
          where: { id: chatId },
          data: { lockedAt: new Date() },
        })
        return NextResponse.json({ locked: true, lockedBy: userId, lockedByName: chat.lockedByName, message: "Already locked by you" })
      }

      // Locked by another user — check if admin can override
      if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
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
    // Rate limiting for chat-lock DELETE
    const { success: deleteRateOk } = rateLimit(`chat-lock-delete:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!deleteRateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    const chatId = req.nextUrl.searchParams.get("chatId")

    if (!chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 })
    }

    // CRITICAL FIX: Use atomic updateMany to prevent TOCTOU race condition
    // Only release the lock if it belongs to the requesting user
    const releaseResult = await db.chat.updateMany({
      where: { id: chatId, lockedBy: userId },
      data: { lockedBy: null, lockedAt: null, lockedByName: null },
    })

    if (releaseResult.count === 0) {
      // Lock doesn't belong to this user — check if admin override
      const chat = await db.chat.findUnique({
        where: { id: chatId },
        select: { lockedBy: true, lockedByName: true },
      })

      if (!chat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 })
      }

      // If locked by another user, only admin can release
      if (chat.lockedBy && chat.lockedBy !== userId) {
        if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
          return NextResponse.json({ error: "Only the user who locked this chat or an admin can release it" }, { status: 403 })
        }
        // Admin override — release anyone's lock
        await db.chat.updateMany({
          where: { id: chatId },
          data: { lockedBy: null, lockedAt: null, lockedByName: null },
        })
      }
      // If lockedBy is null, lock was already released — nothing to do
    }

    return NextResponse.json({ locked: false, message: "Lock released" })
  } catch (error: any) {
    console.error("[chat-lock] DELETE error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
