import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/chats/messages - Get messages for a chat
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
