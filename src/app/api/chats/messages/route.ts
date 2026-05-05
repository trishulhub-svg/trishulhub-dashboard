import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// PATCH /api/chats/messages - Update message metadata
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    // Rate limiting for messages PATCH
    const { success: patchRateOk } = rateLimit(`messages-patch:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!patchRateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    const body = await req.json()
    const { messageId, metadata } = body

    if (!messageId) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 })
    }

    // Find the message and verify access
    const message = await db.chatMessage.findUnique({ where: { id: messageId }, include: { chat: true } })
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    if (message.chat.userId !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // CRITICAL FIX: Whitelist allowed metadata keys to prevent mass assignment.
    // Previously, any key in metadata was persisted to DB, allowing injection of
    // arbitrary fields (e.g. role, permissions). Now only known-safe keys are allowed.
    let data: { metadata: string };
    if (metadata !== undefined) {
      const allowedMetaKeys = ['todoItems', 'planSteps', 'apiKeyId', 'cost', 'model', 'agentic', 'totalSteps', 'usedTools', 'steps', 'thinkingPreview', 'autoTodoItems', 'isError', 'retryPrompt', 'attachments'];
      const sanitizedMeta: Record<string, unknown> = {};
      const metaObj = typeof metadata === "string" ? (() => { try { return JSON.parse(metadata); } catch { console.warn('[messages] Failed to parse metadata JSON'); return {}; } })() : metadata;
      for (const key of allowedMetaKeys) {
        if (metaObj[key] !== undefined) {
          sanitizedMeta[key] = metaObj[key];
        }
      }
      data = { metadata: JSON.stringify(sanitizedMeta) };
    } else {
      return NextResponse.json({ error: "Metadata is required" }, { status: 400 });
    }

    const updated = await db.chatMessage.update({
      where: { id: messageId },
      data,
    })

    return NextResponse.json({ success: true, message: updated })
  } catch (error: any) {
    console.error("[chats/messages] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// GET /api/chats/messages - Get messages for a chat
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    // Rate limiting for messages GET
    const { success: getRateOk } = rateLimit(`messages-get:${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!getRateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get("chatId")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    // Validate limit/offset
    if (isNaN(limit) || isNaN(offset) || limit < 0 || offset < 0) {
      return NextResponse.json({ error: "Invalid limit or offset" }, { status: 400 })
    }
    const safeLimit = Math.min(limit, 100)

    if (!chatId) {
      return NextResponse.json({ error: "Chat ID is required" }, { status: 400 })
    }

    // Verify chat belongs to user
    const chat = await db.chat.findUnique({ where: { id: chatId } })
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Allow access if user owns the chat or if chat is shared
    if (chat.userId !== userId && !chat.isShared) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const messages = await db.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: safeLimit,
    })

    const total = await db.chatMessage.count({ where: { chatId } })

    return NextResponse.json({ messages, total })
  } catch (error: any) {
    console.error("[chats/messages] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
