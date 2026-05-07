// ━━ Inter-Agent Communication Summary API ━━
// GET: Get summary of autonomous inter-agent conversations

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"

// GET /api/agents/autonomy/interagent?limit=100
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)

    // Get all autonomous cross-agent messages
    const messages = await db.crossAgentMessage.findMany({
      where: { isAutonomous: true },
      include: {
        fromAgent: { select: { id: true, name: true, type: true } },
        toAgent: { select: { id: true, name: true, type: true } },
        chat: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    // Group by conversation threads (from→to pairs within time windows)
    const threads: Record<string, any[]> = {}
    for (const msg of messages) {
      const key = `${msg.fromAgentId}->${msg.toAgentId}`
      if (!threads[key]) threads[key] = []
      threads[key].push(msg)
    }

    // Create thread summaries
    const threadSummaries = Object.entries(threads).map(([key, msgs]) => {
      const latest = msgs[0]
      return {
        fromAgent: latest.fromAgent.name,
        fromAgentType: latest.fromAgent.type,
        toAgent: latest.toAgent.name,
        toAgentType: latest.toAgent.type,
        messageCount: msgs.length,
        lastMessage: latest.message.substring(0, 200),
        lastMessageAt: latest.createdAt,
        types: [...new Set(msgs.map(m => m.type))],
      }
    }).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

    // Also get pending non-autonomous cross-agent messages for context
    const pendingMessages = await db.crossAgentMessage.findMany({
      where: { status: "PENDING" },
      include: {
        fromAgent: { select: { id: true, name: true, type: true } },
        toAgent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    return NextResponse.json({
      autonomousThreads: threadSummaries,
      autonomousMessageCount: messages.length,
      pendingMessages: pendingMessages.map(m => ({
        id: m.id,
        fromAgent: m.fromAgent.name,
        toAgent: m.toAgent.name,
        message: m.message.substring(0, 200),
        type: m.type,
        createdAt: m.createdAt,
      })),
    })
  } catch (error: any) {
    console.error("[autonomy/interagent] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
