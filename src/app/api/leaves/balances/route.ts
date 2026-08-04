import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { deepSanitize } from "@/lib/utils"
import { z } from "zod"

function countDaysInYear(start: Date, end: Date, year: number): number {
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const endDate = new Date(end)
  endDate.setHours(23, 59, 59, 999)
  while (d <= endDate) {
    if (d.getFullYear() === year) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

async function computeUsedDays(userId: string, year: number): Promise<number> {
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

  const leaves = await db.leave.findMany({
    where: {
      userId,
      status: "APPROVED",
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
    },
    select: { startDate: true, endDate: true },
  })

  return leaves.reduce((sum, leave) => sum + countDaysInYear(leave.startDate, leave.endDate, year), 0)
}

async function getOrCreateBalance(userId: string, year: number) {
  const used = await computeUsedDays(userId, year)
  const existing = await db.leaveBalance.findUnique({
    where: { userId_year: { userId, year } },
  })

  if (existing) {
    if (existing.used !== used) {
      return db.leaveBalance.update({
        where: { id: existing.id },
        data: { used },
      })
    }
    return existing
  }

  return db.leaveBalance.create({
    data: { userId, year, allowance: 12, used },
  })
}

const patchBalanceSchema = z.object({
  userId: z.string().min(1),
  year: z.number().int().min(2000).max(2100).optional(),
  allowance: z.number().int().min(0).max(365),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = rateLimit(`leave-bal-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const year = new Date().getFullYear()
    const { searchParams } = new URL(req.url)
    let targetUserId = session.user.id

    if (searchParams.get("userId")) {
      if (!isAdmin(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      targetUserId = searchParams.get("userId")!
    }

    const balance = await getOrCreateBalance(targetUserId, year)
    const remaining = Math.max(0, balance.allowance - balance.used)

    return NextResponse.json(deepSanitize({ ...balance, remaining, year }))
  } catch (error: unknown) {
    console.error("[leave-balances] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load leave balance" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = patchBalanceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const year = parsed.data.year ?? new Date().getFullYear()
    const balance = await getOrCreateBalance(parsed.data.userId, year)

    const updated = await db.leaveBalance.update({
      where: { id: balance.id },
      data: { allowance: parsed.data.allowance },
    })

    const remaining = Math.max(0, updated.allowance - updated.used)
    return NextResponse.json(deepSanitize({ ...updated, remaining, year }))
  } catch (error: unknown) {
    console.error("[leave-balances] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update leave balance" }, { status: 500 })
  }
}
