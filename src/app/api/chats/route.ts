import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/chats - List chats for an agent or all chats for user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const userRole = (session.user as any).role
    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")
    const statusParam = searchParams.get("status") || "ACTIVE"
    // Support comma-separated statuses (e.g., "ACTIVE,ENDED")
    const statuses = statusParam.split(",").map(s => s.trim()).filter(Boolean)

    const where: any = { userId, status: { in: statuses } }
    if (agentId) where.agentId = agentId

    const chats = await db.chat.findMany({
      where,
      include: {
        agent: {
          select: { id: true, name: true, type: true, status: true }
        },
        messages: {
          select: { id: true, role: true, content: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1, // Just get the last message for preview
        },
        _count: {
          select: { messages: true }
        }
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json(chats)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/chats - Create a new chat
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const userRole = (session.user as any).role
    const { agentId, title } = await req.json()

    if (!agentId) {
      return NextResponse.json({ error: "Agent ID is required" }, { status: 400 })
    }

    // Check access
    if (userRole !== "SUPER_ADMIN") {
      const access = await db.userAgentAccess.findFirst({
        where: { userId, agentId }
      })
      if (!access?.canChat) {
        return NextResponse.json({ error: "You don't have access to this agent" }, { status: 403 })
      }
    }

    const chat = await db.chat.create({
      data: {
        agentId,
        userId,
        title: title || "New Chat",
        status: "ACTIVE",
      }
    })

    return NextResponse.json(chat, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/chats - Update a chat (rename, archive, share)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { id, title, status, isShared } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "Chat ID is required" }, { status: 400 })
    }

    const chat = await db.chat.findUnique({ where: { id } })
    if (!chat || chat.userId !== userId) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    const data: any = {}
    if (title !== undefined) data.title = title
    if (status !== undefined) data.status = status
    if (isShared !== undefined) data.isShared = isShared

    const updated = await db.chat.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/chats - Delete a chat (or request approval for DEVELOPER role)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const userRole = (session.user as any).role
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Chat ID is required" }, { status: 400 })
    }

    const chat = await db.chat.findUnique({
      where: { id },
      include: { agent: { select: { id: true, name: true } } }
    })
    if (!chat || chat.userId !== userId) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // DEVELOPER users must request approval for chat deletion
    if (userRole === "DEVELOPER" || userRole === "CLIENT") {
      // Check if there's already a pending approval for this chat deletion
      const existingApproval = await db.approval.findFirst({
        where: {
          type: "CHAT_DELETION",
          status: "PENDING",
          data: { contains: chat.id },
        }
      })

      if (existingApproval) {
        return NextResponse.json({
          success: true,
          pendingApproval: true,
          message: "A deletion request for this chat is already pending approval",
        })
      }

      // Create an approval request instead of deleting
      const requester = await db.user.findUnique({ where: { id: userId } })
      const approval = await db.approval.create({
        data: {
          type: "CHAT_DELETION",
          requesterType: "HUMAN",
          requesterId: userId,
          agentId: chat.agentId,
          title: `Delete Chat: "${chat.title}"`,
          description: `${requester?.name || "A developer"} requested deletion of chat "${chat.title}" with agent ${chat.agent?.name || "Unknown"}.`,
          data: JSON.stringify({
            chatId: chat.id,
            chatTitle: chat.title,
            agentId: chat.agentId,
            agentName: chat.agent?.name,
            requestedBy: requester?.name,
            requesterId: userId,
            messageCount: await db.chatMessage.count({ where: { chatId: chat.id } }),
          }),
          status: "PENDING",
        },
      })

      // Notify all SUPER_ADMIN users
      const superAdmins = await db.user.findMany({
        where: { role: "SUPER_ADMIN", isActive: true },
      })

      for (const admin of superAdmins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            title: "Chat Deletion Request",
            message: `${requester?.name || "A developer"} requested deletion of chat "${chat.title}". Please review and approve or reject.`,
            type: "APPROVAL",
            link: "/dashboard/approvals",
            metadata: JSON.stringify({ approvalId: approval.id, type: "CHAT_DELETION", chatId: chat.id }),
          }
        })
      }

      return NextResponse.json({
        success: true,
        pendingApproval: true,
        message: "Deletion request sent for approval",
        approvalId: approval.id,
      })
    }

    // SUPER_ADMIN and ADMIN can delete directly
    // Delete all messages first (cascade should handle this, but be safe)
    await db.chatMessage.deleteMany({ where: { chatId: id } })
    await db.chat.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
