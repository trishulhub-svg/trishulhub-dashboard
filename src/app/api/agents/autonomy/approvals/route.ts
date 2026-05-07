// ━━ Approval Gates API ━━
// GET: List pending approvals (created by autonomous agents)
// PATCH: Approve or reject an approval

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const approvals = await db.approval.findMany({
      where: { status: "PENDING" },
      include: {
        agent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    return NextResponse.json(approvals)
  } catch (error: any) {
    console.error("[approvals] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { approvalId, action } = await req.json()
    if (!approvalId || !action) return NextResponse.json({ error: "approvalId and action required" }, { status: 400 })
    if (!["APPROVED", "REJECTED"].includes(action)) return NextResponse.json({ error: "action must be APPROVED or REJECTED" }, { status: 400 })

    const approval = await db.approval.update({
      where: { id: approvalId },
      data: {
        status: action,
        approvedById: session.user.id,
      },
    })

    return NextResponse.json({ success: true, approval })
  } catch (error: any) {
    console.error("[approvals] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
