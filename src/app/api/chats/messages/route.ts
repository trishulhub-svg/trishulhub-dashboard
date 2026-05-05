import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// PATCH /api/chats/messages - Update message metadata
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
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
      const metaObj = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
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
    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get("chatId")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

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
      take: limit,
    })

    const total = await db.chatMessage.count({ where: { chatId } })

    return NextResponse.json({ messages, total })
  } catch (error: any) {
    console.error("[chats/messages] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
