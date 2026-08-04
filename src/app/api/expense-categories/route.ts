import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import {
  DEFAULT_EXPENSE_CATEGORIES,
  normalizeExpenseCategoryName,
} from "@/lib/expense-categories"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

type CategoryRow = { id: string; name: string }

async function listCategories(): Promise<CategoryRow[]> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT "id", "name" FROM "ExpenseCategory" ORDER BY "name" ASC`
  )) as CategoryRow[]

  if (rows.length > 0) return rows

  // Fallback seed if table empty (older deploys before migrate seed ran)
  const now = new Date().toISOString()
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ExpenseCategory" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
      crypto.randomUUID(),
      name,
      now,
      now
    )
  }
  return (await db.$queryRawUnsafe(
    `SELECT "id", "name" FROM "ExpenseCategory" ORDER BY "name" ASC`
  )) as CategoryRow[]
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`expense-categories-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    const categories = await listCategories()
    return NextResponse.json(categories)
  } catch (error: unknown) {
    console.error("[expense-categories] GET failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`expense-categories-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: { name?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const name = normalizeExpenseCategoryName(body.name || "")
    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Category name is required (min 2 characters)" }, { status: 400 })
    }
    if (name.length > 40) {
      return NextResponse.json({ error: "Category name must be 40 characters or fewer" }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "ExpenseCategory" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
        id,
        name,
        now,
        now
      )
    } catch (dbError: unknown) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 })
      }
      console.error("[expense-categories] POST INSERT failed:", msg)
      return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "BUSINESS",
      page: "expenses",
      action: "CREATE",
      entityType: "ExpenseCategory",
      entityId: id,
      description: `Created expense category: ${name}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ id, name }, { status: 201 })
  } catch (error: unknown) {
    console.error("[expense-categories] POST failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`expense-categories-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: { id?: string; name?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body.id) return NextResponse.json({ error: "ID is required" }, { status: 400 })
    const name = normalizeExpenseCategoryName(body.name || "")
    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Category name is required (min 2 characters)" }, { status: 400 })
    }
    if (name.length > 40) {
      return NextResponse.json({ error: "Category name must be 40 characters or fewer" }, { status: 400 })
    }

    const existing = (await db.$queryRawUnsafe(
      `SELECT "id", "name" FROM "ExpenseCategory" WHERE "id" = ? LIMIT 1`,
      body.id
    )) as CategoryRow[]
    if (!existing[0]) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    const oldName = existing[0].name
    if (oldName === name) return NextResponse.json({ id: body.id, name })

    try {
      await db.$executeRawUnsafe(
        `UPDATE "ExpenseCategory" SET "name" = ?, "updatedAt" = ? WHERE "id" = ?`,
        name,
        new Date().toISOString(),
        body.id
      )
    } catch (dbError: unknown) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 })
      }
      console.error("[expense-categories] PATCH UPDATE failed:", msg)
      return NextResponse.json({ error: "Failed to rename category" }, { status: 500 })
    }

    // Keep expense rows in sync with renamed category key
    await db.$executeRawUnsafe(
      `UPDATE "Expense" SET "category" = ? WHERE "category" = ?`,
      name,
      oldName
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "BUSINESS",
      page: "expenses",
      action: "UPDATE",
      entityType: "ExpenseCategory",
      entityId: body.id,
      description: `Renamed expense category: ${oldName} → ${name}`,
      oldValue: oldName,
      newValue: name,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ id: body.id, name, previousName: oldName })
  } catch (error: unknown) {
    console.error("[expense-categories] PATCH failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to rename category" }, { status: 500 })
  }
}
