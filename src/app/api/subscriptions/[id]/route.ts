import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateSubscriptionSchema, validateRequest } from "@/lib/validations"

// PATCH /api/subscriptions/[id] - Update subscription
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const validation = validateRequest(updateSubscriptionSchema, { ...body, id })

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data
  const { id: _id, ...updateFields } = data

  const sanitizedData: Record<string, any> = {}
  const allowedFields = ["service", "rate", "currency", "frequency", "status", "category", "projectId", "endDate", "notes"]

  for (const key of allowedFields) {
    if (updateFields[key as keyof typeof updateFields] !== undefined) {
      if (key === "endDate") {
        sanitizedData[key] = updateFields[key] ? new Date(updateFields[key] as string) : null
      } else if (key === "projectId" && updateFields[key] === "") {
        sanitizedData[key] = null
      } else {
        sanitizedData[key] = updateFields[key as keyof typeof updateFields]
      }
    }
  }

  // If status changed to STOPPED, set endDate to now if not provided
  if (sanitizedData.status === "STOPPED" && !sanitizedData.endDate) {
    sanitizedData.endDate = new Date()
  }

  const existing = await db.subscription.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
  }

  try {
    const subscription = await db.subscription.update({
      where: { id },
      data: sanitizedData,
      include: { project: { select: { id: true, name: true } } },
    })
    return NextResponse.json(subscription)
  } catch {
    return NextResponse.json({ error: "Subscription update failed" }, { status: 500 })
  }
}

// DELETE /api/subscriptions/[id] - Delete subscription
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const existing = await db.subscription.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
  }

  try {
    await db.subscription.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Subscription delete failed" }, { status: 500 })
  }
}
