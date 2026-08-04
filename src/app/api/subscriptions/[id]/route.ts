import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateSubscriptionSchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// TODO: Extract DEFAULT_EXCHANGE_RATES to shared constants (duplicated from subscriptions/route.ts)
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  GBP: 105.5,
}

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

    const sanitizedData: Record<string, any> = {}
    const allowedFields = ["service", "amount", "currency", "exchangeRate", "frequency", "status", "category", "projectId", "startDate", "endDate", "notes"]

    for (const key of allowedFields) {
      if (updateFields[key as keyof typeof updateFields] !== undefined) {
        if (key === "endDate" || key === "startDate") {
          const raw = updateFields[key as keyof typeof updateFields]
          if (raw === "" || raw === null) {
            // Empty string or null clears the date (only valid for endDate; startDate is ignored so existing value is kept)
            if (key === "endDate") sanitizedData[key] = null
            // startDate === "" → do not touch startDate
          } else {
            const d = new Date(raw as string)
            if (isNaN(d.getTime())) {
              return NextResponse.json({ error: `Invalid ${key} format` }, { status: 400 })
            }
            sanitizedData[key] = d
          }
        } else if (key === "projectId" && (updateFields[key] === "" || updateFields[key] === null)) {
          sanitizedData[key] = null
        } else if (key === "category" && updateFields[key] === null) {
          // Zod enum rejects empty strings, so we only need to handle null here.
          sanitizedData[key] = null
        } else if (key === "notes") {
          // Phase 7c: Defensive null/undefined check — zod schema enforces string|null|undefined,
          // but guard against runtime type drift to prevent .slice() on non-string values.
          const notesVal = updateFields[key]
          sanitizedData[key] = (typeof notesVal === "string" ? notesVal.slice(0, 2000) : "") || null
        } else {
          sanitizedData[key] = updateFields[key as keyof typeof updateFields]
        }
      }
    }

    // If currency changed but exchangeRate not provided, use default
    if (sanitizedData.currency && !sanitizedData.exchangeRate) {
      sanitizedData.exchangeRate = DEFAULT_EXCHANGE_RATES[sanitizedData.currency as string] || 1
    }

    // Wrap findUnique + business logic + update in a transaction for atomicity
    const subscription = await db.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { id } })
      if (!existing) {
        throw { code: "NOT_FOUND", status: 404 }
      }

      // H-FIN-5: Validate endDate > startDate using effective values (merge with existing record)
      if (sanitizedData.startDate || sanitizedData.endDate !== undefined) {
        const effectiveStart = sanitizedData.startDate instanceof Date ? sanitizedData.startDate : existing.startDate
        const effectiveEnd = sanitizedData.endDate === null
          ? null
          : sanitizedData.endDate instanceof Date ? sanitizedData.endDate : existing.endDate
        if (effectiveEnd && effectiveStart && effectiveEnd <= effectiveStart) {
          throw { code: "INVALID_DATE_RANGE", status: 400 }
        }
      }

      // If status changed to STOPPED, set endDate to now if not provided
      if (sanitizedData.status === "STOPPED" && !sanitizedData.endDate) {
        sanitizedData.endDate = new Date()
      }

      // If status changed to ACTIVE and no explicit endDate was provided, clear it
      // so it doesn't show as expired. But if user explicitly sent an endDate, respect it.
      // Also skip this if the sub was already active (user is just editing other fields).
      const wasActive = existing.status === "ACTIVE"
      const endDateExplicitlySent = "endDate" in sanitizedData
      if (sanitizedData.status === "ACTIVE" && !endDateExplicitlySent && !wasActive) {
        sanitizedData.endDate = null
      }

      return tx.subscription.update({
        where: { id },
        data: sanitizedData,
        include: { project: { select: { id: true, name: true } } },
      })
    })
    // Phase 7c: Audit log subscription update (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "BUSINESS", page: "subscriptions", action: "UPDATE",
      entityType: "Subscription", entityId: id,
      description: `Updated subscription: ${subscription.service} (${subscription.frequency})`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json(subscription)
    } catch (error: unknown) {
    const errObj = error as { code?: string; status?: number }
    if (errObj?.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }
    if (errObj?.code === "INVALID_DATE_RANGE") {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 })
    }
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

    // Phase 7c: Wrap existence check + delete in a transaction to handle race conditions
    // and capture subscription info for the audit log atomically.
    let deletedSubscription: { id: string; service: string; status: string } | null = null
    try {
      deletedSubscription = await db.$transaction(async (tx) => {
        const existing = await tx.subscription.findUnique({
          where: { id },
          select: { id: true, service: true, status: true },
        })
        if (!existing) {
          throw new Error("NOT_FOUND")
        }
        await tx.subscription.delete({ where: { id } })
        return existing
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
      }
      // Prisma P2025: record not found (race condition between find + delete)
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
      }
      console.error("[subscriptions] DELETE error:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "An error occurred" }, { status: 500 })
    }

    // Phase 7c: Audit log subscription deletion (fire-and-forget)
    if (deletedSubscription) {
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole,
        department: "BUSINESS", page: "subscriptions", action: "DELETE",
        entityType: "Subscription", entityId: deletedSubscription.id,
        description: `Deleted subscription: ${deletedSubscription.service} (was ${deletedSubscription.status})`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
    }
    return NextResponse.json({ success: true })
    } catch (error: unknown) {
      console.error("[subscriptions] DELETE error:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "An error occurred" }, { status: 500 })
    }
}
