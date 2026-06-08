import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { deepSanitize } from "@/lib/utils"

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
    // W27: Validate type against whitelist of valid approval types
    const validApprovalTypes = ["TASK", "INVOICE", "EMAIL", "QUOTATION", "PROJECT_PLAN", "CODE_REVIEW", "LEAD_OUTREACH", "CONTENT_PIECE", "CHAT_DELETION", "TASK_EXECUTION", "EXPENSE_APPROVAL", "INVOICE_SENDING", "EMAIL_SENDING", "CODE_DEPLOYMENT", "DATA_EXPORT", "SCHEDULED_ACTION", "CROSS_AGENT_REQUEST"]
    if (type && !validApprovalTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid approval type" }, { status: 400 })
    }
    const where: Record<string, unknown> = {}
    if (type) where.type = type

    // Non-admin users can only see their own approval requests
    const isAdminRole = userRole === "SUPER_ADMIN" || userRole === "ADMIN"
    if (!isAdminRole) {
      where.requesterId = userId
      // W26: Validate statusParam against whitelist for non-admins
      const validStatuses = ["PENDING", "APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"]
      if (statusParam && !validStatuses.includes(statusParam)) {
        return NextResponse.json({ error: "Invalid status parameter" }, { status: 400 })
      }
      if (statusParam) where.status = statusParam
    } else {
      // W26: Validate statusParam against whitelist for admins
      const validStatuses = ["PENDING", "APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"]
      if (statusParam && !validStatuses.includes(statusParam)) {
        return NextResponse.json({ error: "Invalid status parameter" }, { status: 400 })
      }
      // Admins default to PENDING but can override via ?status=
      where.status = statusParam || "PENDING"
    }

    // Pagination
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    // W25: Upper-bound take to prevent unbounded queries
    const take = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200)
    const skip = (page - 1) * take

    const approvals = await db.approval.findMany({
      where,
      include: {
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    })

    // W3: Apply deepSanitize to all approval responses
    return NextResponse.json(deepSanitize(approvals))
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
    const { type, requesterType, title, description, data } = body

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
        title,
        description: description || null,
        data: JSON.stringify(data || {}),
        status: "PENDING",
      },
    })

    // Notify all admins/super_admins about new approval request
    const admins = await db.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "ADMIN"] },
        isActive: true,
      }
    })

    try {
      // W40: Use createMany for single round-trip instead of sequential loop
      if (admins.length > 0) {
        await db.notification.createMany({
          data: admins.map(admin => ({
            userId: admin.id,
            title: "New Approval Request",
            message: `${requesterType === "AI" ? "AI Agent" : "Team member"} requests approval: ${title}`,
            type: "APPROVAL",
            link: "/dashboard/approvals",
            metadata: JSON.stringify({ approvalId: approval.id, type }),
          })),
        })
      }
    } catch (notifyErr: unknown) {
      console.error("[approvals] notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : String(notifyErr))
    }

    // W3: Apply deepSanitize to approval response
    return NextResponse.json(deepSanitize(approval), { status: 201 })
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

    // W28: Basic validation for PATCH body
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: "ID is required and must be a non-empty string" }, { status: 400 })
    }
    const validStatuses = ["APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"]
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be one of: " + validStatuses.join(", ") }, { status: 400 })
    }

    // Wrap approval update in transaction
    const result = await db.$transaction(async (tx) => {
      const approval = await tx.approval.findUnique({
        where: { id },
      })

      if (!approval) return null

      // Can only act on PENDING approvals
      if (approval.status !== "PENDING") {
        throw new Error(`This approval is already ${approval.status.toLowerCase()}`)
      }

      const updated = await tx.approval.update({
        where: { id },
        data: {
          status,
          feedback: sanitizedFeedback || null,
          approvedById: userId,
          ...(status === "APPROVED" ? { approvedAt: new Date() } : {}),
        },
        include: {
          approvedBy: { select: { id: true, name: true } },
        }
      })

      // C17: Chat deletion inside transaction for atomicity
      if (approval.type === "CHAT_DELETION" && status === "APPROVED") {
        try {
          let approvalData: { chatId?: string; [key: string]: unknown } = {}
          try { approvalData = JSON.parse(approval.data); } catch (parseErr) { console.warn("[approvals] Failed to parse approval data:", parseErr); }
          const chatId = approvalData.chatId;
          if (chatId) {
            await tx.chatMessage.deleteMany({ where: { chatId } })
            await tx.chat.delete({ where: { id: chatId } }).catch((err) => console.error("[approvals] Chat deletion failed:", err))
          }
        } catch (deleteErr: unknown) {
          console.error("[approvals] Failed to delete chat during approval:", deleteErr)
        }
      }

      return { updated, approval }
    })

    if (!result) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 })
    }
    const updated = result.updated
    const approval = result.approval

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

    // W3: Apply deepSanitize to response
    return NextResponse.json(deepSanitize(updated))
  } catch (error: unknown) {
    // W4: Generic error message instead of raw error.message
    if (error instanceof Error && error.message.includes("already ")) {
      return NextResponse.json({ error: "This approval has already been processed" }, { status: 400 })
    }
    console.error("[approvals] PATCH Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
