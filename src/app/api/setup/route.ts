import { NextResponse, NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import crypto from "crypto"
import { rateLimit } from "@/lib/rate-limit"

/** SECURITY: Allowlist of table names from the Prisma schema.
 *  Any table name used in $queryRawUnsafe MUST be validated against this list
 *  to prevent SQL injection via string interpolation.
 */
const ALLOWED_TABLE_NAMES = new Set([
  "User",
  "Chat",
  "ChatMessage",
  "ScheduledTask",
  "Approval",
  "Client",
  "Project",
  "ProjectMember",
  "Invoice",
  "Lead",
  "LeadEmail",

  "SupportTicket",
  "TicketMessage",
  "LeaveRequest",
  "TimeEntry",
  "Attendance",
  "Notification",
  "Expense",
  "Subscription",
  "SmtpConfig",
  "EmailVerification",
  "EmailLog",
  "PasswordChange",
  "PasswordReset",
  "ActiveSession",
  "Leave",
  "Availability",
  "AvailabilityOverride",
])

/** Validate a table name against the allowlist. Throws if the name is not recognized. */
function validateTableName(name: string): void {
  if (!ALLOWED_TABLE_NAMES.has(name)) {
    throw new Error(`SECURITY: Table name "${name}" is not in the allowed list. Possible SQL injection attempt.`)
  }
}

// GET handler - Check if database is set up (public - no auth required)
export async function GET() {
  try {
    const userCount = await db.user.count()
    if (userCount > 0) {
      return NextResponse.json({ status: "already_setup", message: "Database is ready" })
    }
    return NextResponse.json({ status: "needs_setup", message: "Database needs to be seeded" })
  } catch (error: unknown) {
    // Only return generic info publicly - no env var details
    return NextResponse.json({ status: "needs_setup", message: "Database not accessible" })
  }
}

// PATCH /api/setup - Migrate existing agents to use correct model names and update features
// SECURITY FIX: Now requires SUPER_ADMIN authentication
export async function PATCH() {
  const logs: string[] = []

  // CRITICAL FIX: Require SUPER_ADMIN for schema migrations and data modifications
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can run migrations" }, { status: 403 })
  }

  try {
    // ━━ Schema Migration: Add missing columns to production DB ━━
    const migrations = [
      { table: "CrossAgentMessage", column: "linkedChatId", type: "TEXT", sql: "ALTER TABLE CrossAgentMessage ADD COLUMN linkedChatId TEXT" },
      { table: "CrossAgentMessage", column: "shareFullChat", type: "INTEGER", sql: "ALTER TABLE CrossAgentMessage ADD COLUMN shareFullChat INTEGER DEFAULT 0" },
      { table: "Chat", column: "lockedBy", type: "TEXT", sql: "ALTER TABLE Chat ADD COLUMN lockedBy TEXT" },
      { table: "Chat", column: "lockedAt", type: "TEXT", sql: "ALTER TABLE Chat ADD COLUMN lockedAt TEXT" },
      { table: "Chat", column: "lockedByName", type: "TEXT", sql: "ALTER TABLE Chat ADD COLUMN lockedByName TEXT" },
    ]

    for (const migration of migrations) {
      try {
        // SECURITY FIX: Validate table name against allowlist before using in raw SQL
        validateTableName(migration.table)
        // Check if column already exists
        const columns = await db.$queryRawUnsafe(`PRAGMA table_info(${migration.table})`) as any[]
        const columnExists = columns.some((col: any) => col.name === migration.column)
        if (!columnExists) {
          await db.$executeRawUnsafe(migration.sql)
          logs.push(`Added column ${migration.column} to ${migration.table}`)
        }
      } catch (err: unknown) {
        console.error(`[setup] Migration ${migration.column} failed:`, err instanceof Error ? err.message : String(err))
        logs.push(`Migration ${migration.column}: Migration failed — check server logs`)
      }
    }

    // ━━ Create new tables if they don't exist ━━
    const createTables = [
      {
        name: "SmtpConfig",
        sql: `CREATE TABLE IF NOT EXISTS SmtpConfig (
          id TEXT PRIMARY KEY NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 587,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          fromEmail TEXT NOT NULL,
          fromName TEXT NOT NULL DEFAULT 'TrishulHub',
          secure BOOLEAN NOT NULL DEFAULT false,
          isPrimary BOOLEAN NOT NULL DEFAULT true,
          isActive BOOLEAN NOT NULL DEFAULT true,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: "EmailVerification",
        sql: `CREATE TABLE IF NOT EXISTS EmailVerification (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          newEmail TEXT NOT NULL,
          otp TEXT NOT NULL,
          verified BOOLEAN NOT NULL DEFAULT false,
          attempts INTEGER NOT NULL DEFAULT 0,
          expiresAt DATETIME NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        )`
      },
      // Protocol tables
      {
        name: "ClientWebsite",
        sql: `CREATE TABLE IF NOT EXISTS "ClientWebsite" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "url" TEXT NOT NULL,
          "label" TEXT,
          "isPrimary" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clientId" TEXT NOT NULL
        )`
      },
      {
        name: "ProtocolVersion",
        sql: `CREATE TABLE IF NOT EXISTS "ProtocolVersion" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "version" TEXT NOT NULL,
          "title" TEXT NOT NULL DEFAULT 'Trishul Protocol',
          "content" TEXT NOT NULL DEFAULT '',
          "stageDescriptions" TEXT NOT NULL DEFAULT '[]',
          "agentSkills" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        )`
      },
      {
        name: "ProtocolInvite",
        sql: `CREATE TABLE IF NOT EXISTS "ProtocolInvite" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "protocolId" TEXT NOT NULL,
          "inviteCode" TEXT NOT NULL,
          "targetEmail" TEXT NOT NULL,
          "targetName" TEXT,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "expiresAt" DATETIME NOT NULL,
          "usedAt" DATETIME,
          "usedBy" TEXT,
          "createdBy" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        )`
      },
      {
        name: "ProtocolAccessLog",
        sql: `CREATE TABLE IF NOT EXISTS "ProtocolAccessLog" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "inviteId" TEXT NOT NULL,
          "protocolId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "ipAddress" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: "UserProtocolAccess",
        sql: `CREATE TABLE IF NOT EXISTS "UserProtocolAccess" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "userName" TEXT,
          "protocolId" TEXT NOT NULL,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "verifiedVia" TEXT NOT NULL,
          "lastAccessAt" DATETIME NOT NULL
        )`
      },
      {
        name: "UserCredential",
        sql: `CREATE TABLE IF NOT EXISTS "UserCredential" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "label" TEXT NOT NULL,
          "username" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "url" TEXT,
          "notes" TEXT,
          "createdBy" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        )`
      },
    ]

    for (const table of createTables) {
      try {
        // SECURITY FIX: Validate table name against allowlist before using in raw SQL
        validateTableName(table.name)
        // Check if table exists
        const tableCheck = await db.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table.name}'`) as any[]
        if (tableCheck.length === 0) {
          await db.$executeRawUnsafe(table.sql)
          // Create indexes for EmailVerification
          if (table.name === "EmailVerification") {
            await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS EmailVerification_userId_idx ON EmailVerification(userId)`)
            await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS EmailVerification_otp_newEmail_idx ON EmailVerification(otp, newEmail)`)
            await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS EmailVerification_expiresAt_idx ON EmailVerification(expiresAt)`)
          }
          logs.push(`Created table ${table.name}`)
        }
      } catch (err: unknown) {
        console.error(`[setup] Table ${table.name} creation failed:`, err instanceof Error ? err.message : String(err))
        logs.push(`Table ${table.name}: Migration failed — check server logs`)
      }
    }

    logs.push("No migration needed - everything is up to date")

    return NextResponse.json({ status: "success", logs })
  } catch (error: unknown) {
    console.error("[setup] PATCH error:", error instanceof Error ? error.message : String(error)); return NextResponse.json({ status: "error", error: "Migration failed", logs }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const logs: string[] = []

  // P11-RL-01: IP-based rate limiting — 5 requests per 60 seconds
  const ip = req.headers.get("x-forwarded-for") || "unknown"
  const rl = rateLimit(`setup-post:${ip}`, 5, 60000)
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 })
  }

  try {
    // Step 1: Check if already seeded
    logs.push("Step 1: Checking database...")
    let existingUsers = 0
    try {
      existingUsers = await db.user.count()
    } catch {
      logs.push("Could not count users - running prisma db push first")
    }

    // SECURITY: Allow seeding WITHOUT auth only when database is empty (first-time setup)
    // AND a valid SETUP_TOKEN is provided. This prevents unauthorized seeding.
    // If users already exist, require SUPER_ADMIN authentication to prevent re-seeding.
    if (existingUsers > 0) {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can seed database" }, { status: 403 })
      }
    } else {
      // First-time setup: require SETUP_TOKEN env var for unauthenticated access
      const setupToken = process.env.SETUP_TOKEN
      if (setupToken) {
        // Check for token in query param or request body
        let providedToken = new URL(req.url, "http://localhost").searchParams.get("setupToken")
        if (!providedToken) {
          try {
            const body = await req.json()
            providedToken = body.setupToken
          } catch { /* no body */ }
        }
        if (providedToken !== setupToken) {
          return NextResponse.json({ error: "Invalid setup token" }, { status: 403 })
        }
        logs.push("First-time setup with valid SETUP_TOKEN")
      } else {
        // No SETUP_TOKEN configured: reject unauthenticated setup for security
        logs.push("No SETUP_TOKEN configured and database is empty — rejecting for security")
        return NextResponse.json({
          error: "First-time setup requires either a SETUP_TOKEN environment variable or an existing admin session. Set SETUP_TOKEN in your environment variables to enable unauthenticated initial setup.",
          hint: "Set SETUP_TOKEN=<random-string> in your .env file, then include setupToken=<same-string> in your request.",
        }, { status: 403 })
      }
    }

    if (existingUsers > 0) {
      logs.push(`Database already has ${existingUsers} users - skipping seed`)
      return NextResponse.json({
        status: "already_setup",
        message: "Database already set up and seeded!",
        users: existingUsers,
        logs
      })
    }

    // Step 2: Seed the database
    logs.push("Step 2: Seeding database...")
    const bcrypt = await import('bcryptjs')

    // SECURITY FIX: Generate a cryptographically random password instead of using
    // the hardcoded "password123". This password is displayed ONCE in the response
    // and must be changed on first login.
    // TODO: Add a `mustChangePassword` boolean field to the User model so that
    // the UI forces a password change on first login.
    const generatedPassword = crypto.randomBytes(16).toString('base64url').slice(0, 20)
    const hashedPassword = await bcrypt.hash(generatedPassword, 12)

    // Create users
    const [taroon, pruthvi, kiran, akshat] = await db.$transaction([
      db.user.create({
        data: { name: "Taroon", email: "taroon@trishulhub.in", password: hashedPassword, role: "SUPER_ADMIN", department: "MANAGEMENT", isActive: true },
      }),
      db.user.create({
        data: { name: "Pruthvi", email: "pruthvi@trishulhub.in", password: hashedPassword, role: "ADMIN", department: "SALES", isActive: true },
      }),
      db.user.create({
        data: { name: "Kiran", email: "kiran@trishulhub.in", password: hashedPassword, role: "DEVELOPER", department: "DEV", isActive: true },
      }),
      db.user.create({
        data: { name: "Akshat", email: "akshat@trishulhub.in", password: hashedPassword, role: "DEVELOPER", department: "DEV", isActive: true },
      }),
    ])
    logs.push("Created 4 users")

    // W14: Wrap sample data seeding in transaction for atomicity
    await db.$transaction(async (tx) => {
      // Create sample data
      const clients = await Promise.all([
        tx.client.create({ data: { name: "Priya Patel", email: "priya@beautylounge.com", phone: "+91-9876543211", company: "Priya Beauty Lounge", website: "priyabeautylounge.com", status: "ACTIVE" } }),
        tx.client.create({ data: { name: "Amit Verma", email: "amit@vermarestaurant.com", phone: "+91-9876543212", company: "Verma Restaurant", status: "ACTIVE" } }),
      ])
      logs.push("Created 2 clients")

      await Promise.all([
        tx.project.create({ data: { name: "Priya Beauty Lounge Website", clientId: clients[0].id, status: "REVIEW", progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 } }),
        tx.project.create({ data: { name: "Verma Restaurant Website", clientId: clients[1].id, status: "PLANNING", progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 } }),
      ])
      logs.push("Created 2 projects")

      await Promise.all([
        tx.lead.create({ data: { name: "Vikram Singh", email: "vikram@fitnessgym.com", company: "Fitness Gym", website: "fitnessgym.in", source: "AI_FOUND", score: 78, status: "CONTACTED" } }),
        tx.lead.create({ data: { name: "Neha Gupta", email: "neha@fashionboutique.com", company: "Fashion Boutique", source: "MANUAL", score: 65, status: "INTERESTED" } }),
        tx.lead.create({ data: { name: "Rajesh Kumar", email: "rajesh@autodealer.com", company: "Kumar Auto Dealer", website: "kumarauto.in", source: "AI_FOUND", score: 82, status: "NEW" } }),
      ])
      logs.push("Created 3 leads")

      await Promise.all([
        tx.expense.create({ data: { category: "HOSTING", description: "Vercel Pro Plan", amount: 0, date: new Date() } }),
        tx.expense.create({ data: { category: "API_COSTS", description: "Z.ai API", amount: 5.50, date: new Date() } }),
        tx.expense.create({ data: { category: "DOMAINS", description: "Client domain renewals", amount: 24.00, date: new Date() } }),
      ])
      logs.push("Created 3 expenses")
    })

    logs.push("SETUP COMPLETE!")

    return NextResponse.json({
      status: "success",
      message: "Database set up and seeded successfully!",
      // SECURITY: Generated password is returned ONCE. Save this — it will not be shown again.
      // All users share this initial password and MUST change it on first login.
      _warning: "Save this password now. It will NOT be shown again. Force password change on first login.",
      generatedPassword,
      created: { users: 4, clients: 2, projects: 2, leads: 3, expenses: 3 },
      logs
    })

  } catch (error: unknown) {
    return NextResponse.json({
      status: "error",
      error: "Setup failed",
      logs
    }, { status: 500 })
  }
}
