import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/approvals - List approvals (ADMIN/SUPER_ADMIN only for full access)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = session.user.role
    const userId = session.user.id

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING"
    const type = searchParams.get("type")
    const agentId = searchParams.get("agentId")

    const where: any = {}
    if (status) where.status = status
    if (type) where.type = type
    if (agentId) where.agentId = agentId

    // Non-admin users can only see their own approvals
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      where.requesterId = userId
    }

    const approvals = await db.approval.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, type: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(approvals)
  } catch (error: any) {
    console.error("[approvals] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/approvals - Create an approval request
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { type, requesterType, agentId, title, description, data } = await req.json()

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

    return NextResponse.json(approval, { status: 201 })
  } catch (error: any) {
    console.error("[approvals] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/approvals - Approve, reject, or request improvement
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { id, status, feedback } = await req.json()

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

    const approval = await db.approval.findUnique({
      where: { id },
      include: { agent: true }
    })

    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 })
    }

    // Can only act on PENDING approvals
    if (approval.status !== "PENDING") {
      return NextResponse.json({ error: `This approval is already ${approval.status.toLowerCase()}` }, { status: 400 })
    }

    const updated = await db.approval.update({
      where: { id },
      data: {
        status,
        feedback: feedback || null,
        approvedById: userId,
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
        approvedBy: { select: { id: true, name: true } },
      }
    })

    // If approval was requested by a human, notify them
    if (approval.requesterType === "HUMAN" && approval.requesterId) {
      await db.notification.create({
        data: {
          userId: approval.requesterId,
          title: `Approval ${status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Needs Improvement"}`,
          message: `Your request "${approval.title}" has been ${status.toLowerCase()}.${feedback ? ` Feedback: ${feedback}` : ""}`,
          type: status === "APPROVED" ? "SUCCESS" : status === "REJECTED" ? "ERROR" : "WARNING",
          link: "/dashboard/approvals",
          metadata: JSON.stringify({ approvalId: id }),
        }
      })
    }

    // If this is a CHAT_DELETION approval, handle the actual deletion
    if (approval.type === "CHAT_DELETION" && status === "APPROVED") {
      try {
        let approvalData: any = {};
        try { approvalData = JSON.parse(approval.data); } catch {}
        const chatId = approvalData.chatId;
        if (chatId) {
          // Delete the chat and its messages
          await db.chatMessage.deleteMany({ where: { chatId } })
          await db.chat.delete({ where: { id: chatId } }).catch(() => {
            // Chat may already be deleted
          })
        }
      } catch (deleteErr) {
        console.error("Failed to delete chat during approval:", deleteErr)
      }
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
              content: `[Approval Feedback] Your request "${approval.title}" needs improvement. Feedback: ${feedback || "No specific feedback provided. Please revise and resubmit."}`,
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
  } catch (error: any) {
    console.error("[approvals] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
