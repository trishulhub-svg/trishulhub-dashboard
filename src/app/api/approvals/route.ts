import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageApprovals } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { deepSanitize } from "@/lib/utils"
import { notifyRoles, notifyUsers } from "@/lib/notify"
import {
  APPROVAL_TYPES,
  isValidApprovalStatus,
  isValidApprovalType,
} from "@/lib/approval-types"

// GET /api/approvals - List approvals (ADMIN/SUPER_ADMIN only for full access)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`approvals-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const userRole = session.user.role
    const userId = session.user.id

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get("status")
    const type = searchParams.get("type")
    if (type && !isValidApprovalType(type)) {
      return NextResponse.json({ error: "Invalid approval type" }, { status: 400 })
    }
    const where: Record<string, unknown> = {}
    if (type) where.type = type

    const canManage = canManageApprovals(userRole)
    if (!canManage) {
      where.requesterId = userId
      if (statusParam && !isValidApprovalStatus(statusParam)) {
        return NextResponse.json({ error: "Invalid status parameter" }, { status: 400 })
      }
      if (statusParam) where.status = statusParam
    } else {
      if (statusParam && !isValidApprovalStatus(statusParam)) {
        return NextResponse.json({ error: "Invalid status parameter" }, { status: 400 })
      }
      where.status = statusParam || "PENDING"
    }

    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const take = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200)
    const skip = (page - 1) * take

    try {
      const approvals = await db.approval.findMany({
        where,
        include: {
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      })
      return NextResponse.json(deepSanitize(approvals))
    } catch (queryErr: unknown) {
      // Soft-fail: schema drift should not blank the Approvals UI for minutes
      console.error("[approvals] GET query error (returning []):", queryErr instanceof Error ? queryErr.message : String(queryErr))
      return NextResponse.json([])
    }
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

    if (!isValidApprovalType(type)) {
      return NextResponse.json({
        error: `Invalid approval type. Must be one of: ${APPROVAL_TYPES.join(", ")}`,
      }, { status: 400 })
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
    try {
      void notifyRoles(["SUPER_ADMIN", "ADMIN"], {
        title: "New Approval Request",
        message: `${requesterType === "AI" ? "AI Agent" : "Team member"} requests approval: ${title}`,
        type: "APPROVAL",
        link: "/dashboard/approvals",
        metadata: { approvalId: approval.id, type },
      })
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

    // Only ADMIN, SUPER_ADMIN, and PROJECT_MANAGER can approve/reject AI approvals.
    // PROJECT_MANAGER is included via canManageApprovals. Note: this endpoint
    // is only for AI/non-leave approvals — leave approvals are handled by
    // /api/team which uses isAdmin (excludes PM) for status changes.
    if (!canManageApprovals(userRole)) {
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
        // Developers cannot open /dashboard/approvals — send them to home
        const requester = await db.user.findUnique({
          where: { id: approval.requesterId },
          select: { role: true },
        })
        const canOpenApprovals =
          requester?.role === "SUPER_ADMIN" ||
          requester?.role === "ADMIN" ||
          requester?.role === "PROJECT_MANAGER"

        void notifyUsers({
          userIds: approval.requesterId,
          title: `Approval ${status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Needs Improvement"}`,
          message: `Your request "${approval.title}" has been ${status.toLowerCase()}.${sanitizedFeedback ? ` Feedback: ${sanitizedFeedback}` : ""}`,
          type: status === "APPROVED" ? "SUCCESS" : status === "REJECTED" ? "ERROR" : "WARNING",
          link: canOpenApprovals ? "/dashboard/approvals" : "/dashboard",
          metadata: { approvalId: id },
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
