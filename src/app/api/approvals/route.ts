import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/approvals - List approvals (ADMIN/SUPER_ADMIN only for full access)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rl = rateLimit(`approvals-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const userRole = session.user.role
    const userId = session.user.id

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get("status")
    const type = searchParams.get("type")
    const agentId = searchParams.get("agentId")

    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (agentId) where.agentId = agentId

    // Non-admin users can only see their own approval requests
    const isAdminRole = userRole === "SUPER_ADMIN" || userRole === "ADMIN"
    if (!isAdminRole) {
      where.requesterId = userId
      // Non-admins see all their own approvals unless specific status requested
      if (statusParam) where.status = statusParam
    } else {
      // Admins default to PENDING but can override via ?status=
      where.status = statusParam || "PENDING"
    }

    // Pagination
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const take = Math.max(Number(searchParams.get("limit")) || 50, 1)
    const skip = (page - 1) * take

    const approvals = await db.approval.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, type: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    })

    return NextResponse.json(approvals)
  } catch (error: unknown) {
    console.error("[approvals] GET Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/approvals - Create an approval request
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rl = rateLimit(`approvals-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const userId = session.user.id
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
    const { type, requesterType, agentId, title, description, data } = body

    if (!type || !title) {
      return NextResponse.json({ error: "Type and title are required" }, { status: 400 })
    }

    // SECURITY: Validate approval type and requester type
    const validApprovalTypes = ["TASK", "INVOICE", "EMAIL", "QUOTATION", "PROJECT_PLAN", "CODE_REVIEW", "LEAD_OUTREACH", "CONTENT_PIECE", "CHAT_DELETION", "TASK_EXECUTION", "EXPENSE_APPROVAL", "INVOICE_SENDING", "EMAIL_SENDING", "CODE_DEPLOYMENT", "DATA_EXPORT", "SCHEDULED_ACTION", "CROSS_AGENT_REQUEST"]
    if (!validApprovalTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid approval type" }, { status: 400 })
    }
    if (requesterType && !["AI", "HUMAN"].includes(requesterType)) {
      return NextResponse.json({ error: "Invalid requester type" }, { status: 400 })
    }

    // Size limit on data field
    if (JSON.stringify(data).length > 10000) {
      return NextResponse.json({ error: "Data field exceeds maximum size of 10KB" }, { status: 400 })
    }

    const approval = await db.approval.create({
      data: {
        type,
        requesterType: requesterType || "HUMAN",
        requesterId: userId,
        agentId: agentId || null,
        title,
        description: description || null,
        data: JSON.stringify(data || {}),
        status: "PENDING",
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
      }
    })

    // Notify all admins/super_admins about new approval request
    const admins = await db.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "ADMIN"] },
        isActive: true,
      }
    })

    try {
      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            title: "New Approval Request",
            message: `${requesterType === "AI" ? "AI Agent" : "Team member"} requests approval: ${title}`,
            type: "APPROVAL",
            link: "/dashboard/approvals",
            metadata: JSON.stringify({ approvalId: approval.id, type }),
          }
        })
      }
    } catch (notifyErr: unknown) {
      console.error("[approvals] notification error (non-blocking):", notifyErr)
    }

    return NextResponse.json(approval, { status: 201 })
  } catch (error: unknown) {
    console.error("[approvals] POST Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/approvals - Approve, reject, or request improvement
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rl = rateLimit(`approvals-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const userId = session.user.id
    const userRole = session.user.role
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
    const { id, status, feedback } = body

    // Sanitize feedback
    const sanitizedFeedback = String(feedback || "").slice(0, 500).replace(/[<>]/g, "")

    // Only ADMIN and SUPER_ADMIN can approve/reject
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only administrators can approve or reject requests" }, { status: 403 })
    }

    if (!id || !status) {
      return NextResponse.json({ error: "ID and status are required" }, { status: 400 })
    }

    if (!["APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"].includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be APPROVED, REJECTED, or NEEDS_IMPROVEMENT" }, { status: 400 })
    }

    // Wrap approval update in transaction
    const updated = await db.$transaction(async (tx) => {
      const approval = await tx.approval.findUnique({
        where: { id },
        include: { agent: true }
      })

      if (!approval) return null

      // Can only act on PENDING approvals
      if (approval.status !== "PENDING") {
        throw new Error(`This approval is already ${approval.status.toLowerCase()}`)
      }

      return await tx.approval.update({
        where: { id },
        data: {
          status,
          feedback: sanitizedFeedback || null,
          approvedById: userId,
          ...(status === "APPROVED" ? { approvedAt: new Date() } : {}),
        },
        include: {
          agent: { select: { id: true, name: true, type: true } },
          approvedBy: { select: { id: true, name: true } },
        }
      })
    })

    if (!updated) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 })
    }

    // Re-fetch the approval for agent/requester info needed for notifications
    const approval = await db.approval.findUnique({
      where: { id },
      include: { agent: true }
    })
    if (!approval) {
      return NextResponse.json(updated)
    }

    // If approval was requested by a human, notify them
    if (approval.requesterType === "HUMAN" && approval.requesterId) {
      try {
        await db.notification.create({
          data: {
            userId: approval.requesterId,
            title: `Approval ${status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Needs Improvement"}`,
            message: `Your request "${approval.title}" has been ${status.toLowerCase()}.${sanitizedFeedback ? ` Feedback: ${sanitizedFeedback}` : ""}`,
            type: status === "APPROVED" ? "SUCCESS" : status === "REJECTED" ? "ERROR" : "WARNING",
            link: "/dashboard/approvals",
            metadata: JSON.stringify({ approvalId: id }),
          }
        })
      } catch (notifyErr: unknown) {
        console.error("[approvals] notification error (non-blocking):", notifyErr)
      }
    }

    // If this is a CHAT_DELETION approval, handle the actual deletion
    if (approval.type === "CHAT_DELETION" && status === "APPROVED") {
      try {
        let approvalData: { chatId?: string; [key: string]: unknown } = {};
        try { approvalData = JSON.parse(approval.data); } catch (parseErr) { console.warn("[approvals] Failed to parse approval data:", parseErr); }
        const chatId = approvalData.chatId;
        if (chatId) {
          // Delete the chat and its messages
          await db.chatMessage.deleteMany({ where: { chatId } })
          await db.chat.delete({ where: { id: chatId } }).catch((err) => console.error("[approvals] Chat deletion failed:", err))
        }
      } catch (deleteErr: unknown) {
        console.error("[approvals] Failed to delete chat during approval:", deleteErr)
      }
      // TODO: Wrap chat deletion in transaction with approval update
    }

    // If it was an AI agent that requested approval, update agent status
    if (approval.requesterType === "AI" && approval.agentId) {
      if (status === "APPROVED") {
        await db.agent.update({
          where: { id: approval.agentId },
          data: { status: "IDLE" }
        })
      } else if (status === "NEEDS_IMPROVEMENT") {
        await db.agent.update({
          where: { id: approval.agentId },
          data: { status: "IDLE" }
        })
        // Notify the agent's chat users
        const chats = await db.chat.findMany({
          where: { agentId: approval.agentId, status: "ACTIVE" },
          take: 1,
        })
        if (chats[0]) {
          await db.chatMessage.create({
            data: {
              chatId: chats[0].id,
              role: "system",
              content: `[Approval Feedback] Your request "${approval.title}" needs improvement. Feedback: ${sanitizedFeedback || "No specific feedback provided. Please revise and resubmit."}`,
            }
          })
        }
      } else if (status === "REJECTED") {
        await db.agent.update({
          where: { id: approval.agentId },
          data: { status: "IDLE" }
        })
      }
    }

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("already ")) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[approvals] PATCH Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
