import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateSubscriptionSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// PATCH /api/subscriptions/[id] - Update subscription
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  // Rate limit
  const rl = rateLimit(`subs-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
  }

  // Wrap req.json() in try/catch for malformed JSON
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const validation = validateRequest(updateSubscriptionSchema, { ...(body as Record<string, unknown>), id })

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data
  const { id: _id, ...updateFields } = data

  const sanitizedData: Record<string, unknown> = {}
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

  const subscription = await db.subscription.update({
    where: { id },
    data: sanitizedData,
    include: { project: { select: { id: true, name: true } } },
  })
  return NextResponse.json(subscription)
  } catch (error: unknown) {
    console.error("[subscriptions] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/subscriptions/[id] - Delete subscription
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`subs-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 })
  }

  const { id } = await params

  const existing = await db.subscription.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
  }

  await db.subscription.delete({ where: { id } })
  return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[subscriptions] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
