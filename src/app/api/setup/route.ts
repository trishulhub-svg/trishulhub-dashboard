import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import crypto from "crypto"

/** SECURITY: Allowlist of table names from the Prisma schema.
 *  Any table name used in $queryRawUnsafe MUST be validated against this list
 *  to prevent SQL injection via string interpolation.
 */
const ALLOWED_TABLE_NAMES = new Set([
  "User",
  "ApiKey",
  "Agent",
  "AgentRoleConfig",
  "Chat",
  "ChatMessage",
  "UserAgentAccess",
  "ScheduledTask",
  "Approval",
  "CrossAgentMessage",
  "Client",
  "Project",
  "ProjectMember",
  "Task",
  "Invoice",
  "Lead",
  "LeadEmail",
  "AgentConversation",
  "ApiUsageLog",
  "SupportTicket",
  "TicketMessage",
  "LeaveRequest",
  "TimeEntry",
  "Attendance",
  "Notification",
  "Meeting",
  "MeetingAttendee",
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
  "TrainingDocument",
  "TrainingTest",
  "TrainingAssignment",
  "TestAttempt",
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
  } catch (error: any) {
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
      // Task approval columns (added in task approval system)
      { table: "Task", column: "approvedBy", type: "TEXT", sql: "ALTER TABLE Task ADD COLUMN approvedBy TEXT" },
      { table: "Task", column: "approvedAt", type: "DATETIME", sql: "ALTER TABLE Task ADD COLUMN approvedAt DATETIME" },
      { table: "Task", column: "assigneeType", type: "TEXT", sql: "ALTER TABLE Task ADD COLUMN assigneeType TEXT NOT NULL DEFAULT 'HUMAN'" },
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
      } catch (err: any) {
        logs.push(`Migration ${migration.column}: ${err.message || 'already exists'}`)
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
      // Task approval & protocol tables
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
      } catch (err: any) {
        logs.push(`Table ${table.name}: ${err.message || 'already exists'}`)
      }
    }

    // Update all agents using deprecated model names to glm-4.5-flash
    const deprecatedModels = ["glm-4-flash-250414", "glm-4-air-250414", "glm-4-long-250414", "glm-4-flash", "glm-4-air", "glm-4-long", "glm-4.7-flash"]
    let updated = 0
    for (const oldModel of deprecatedModels) {
      const result = await db.agent.updateMany({
        where: { model: oldModel },
        data: { model: "glm-4.5-flash" },
      })
      updated += result.count
      if (result.count > 0) logs.push(`Updated ${result.count} agents from ${oldModel} → glm-4.5-flash`)
    }

    // Also reset EXHAUSTED API keys to ACTIVE (Z.ai model errors were marking keys as exhausted)
    const resetKeys = await db.apiKey.updateMany({
      where: { status: "EXHAUSTED" },
      data: { status: "ACTIVE", currentSpend: 0 },
    })
    if (resetKeys.count > 0) logs.push(`Reset ${resetKeys.count} exhausted API keys to ACTIVE`)

    // Reset ERROR keys too
    const resetErrorKeys = await db.apiKey.updateMany({
      where: { status: "ERROR" },
      data: { status: "ACTIVE" },
    })
    if (resetErrorKeys.count > 0) logs.push(`Reset ${resetErrorKeys.count} error API keys to ACTIVE`)

    // Update all agent role configs to include agentic: true feature flag
    const agentFeatureUpdates: Record<string, Record<string, boolean>> = {
      DEV: { agentic: true, webSearch: false, autoTask: true, crossAgent: true, approvalRequired: true, codeReview: true, phasedDevelopment: true },
      CLIENT_HUNTER: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, leadScoring: true, emailDrafting: true },
      FINANCE: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, autoInvoice: false, autoQuotation: false },
      PROJECT_MANAGER: { agentic: true, webSearch: false, autoTask: true, crossAgent: true, approvalRequired: true, autoAssign: false, riskAlerts: true },
      HR: { agentic: true, webSearch: false, autoTask: false, crossAgent: true, approvalRequired: false, workloadTracking: true, leaveManagement: true },
      CONTENT: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, seoOptimization: true, multiPlatform: true },
      SUPPORT: { agentic: true, webSearch: false, autoTask: true, crossAgent: true, approvalRequired: false, autoEscalation: true, knowledgeBase: true },
    }

    let featuresUpdated = 0
    const allAgents = await db.agent.findMany({ include: { roleConfig: true } })
    for (const agent of allAgents) {
      const newFeatures = agentFeatureUpdates[agent.type]
      if (newFeatures && agent.roleConfig) {
        await db.agentRoleConfig.update({
          where: { id: agent.roleConfig.id },
          data: { features: JSON.stringify(newFeatures) },
        })
        featuresUpdated++
      }
    }
    if (featuresUpdated > 0) logs.push(`Updated ${featuresUpdated} agent role configs with agentic: true feature flag`)

    if (updated === 0 && resetKeys.count === 0 && resetErrorKeys.count === 0 && featuresUpdated === 0) {
      logs.push("No migration needed - everything is up to date")
    }

    return NextResponse.json({ status: "success", migrated: updated, featuresUpdated, logs })
  } catch (error: any) {
    console.error("[setup] PATCH error:", error.message); return NextResponse.json({ status: "error", error: "Migration failed", logs }, { status: 500 })
  }
}

export async function POST() {
  const logs: string[] = []

  try {
    // Step 1: Check if already seeded
    logs.push("Step 1: Checking database...")
    let existingUsers = 0
    try {
      existingUsers = await db.user.count()
    } catch {
      logs.push("Could not count users - running prisma db push first")
    }

    // SECURITY: Allow seeding WITHOUT auth only when database is empty (first-time setup).
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
      logs.push("No users found - allowing first-time setup without authentication")
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
    const taroon = await db.user.create({
      data: { name: "Taroon", email: "taroon@trishulhub.in", password: hashedPassword, role: "SUPER_ADMIN", department: "MANAGEMENT", isActive: true },
    })
    const pruthvi = await db.user.create({
      data: { name: "Pruthvi", email: "pruthvi@trishulhub.in", password: hashedPassword, role: "ADMIN", department: "SALES", isActive: true },
    })
    const kiran = await db.user.create({
      data: { name: "Kiran", email: "kiran@trishulhub.in", password: hashedPassword, role: "DEVELOPER", department: "DEV", isActive: true },
    })
    const akshat = await db.user.create({
      data: { name: "Akshat", email: "akshat@trishulhub.in", password: hashedPassword, role: "DEVELOPER", department: "DEV", isActive: true },
    })
    const clientUser = await db.user.create({
      data: { name: "Rahul Sharma", email: "rahul@example.com", password: hashedPassword, role: "CLIENT", isActive: true },
    })
    logs.push("Created 5 users")

    // Create AI agents
    const createdAgents: any[] = []
    const agentDefs = [
      { name: "Dev Agent", type: "DEV", description: "Writes code, builds features, fixes bugs, reviews code, deploys projects in phases", model: "glm-4.5-flash", systemPrompt: "You are Dev Agent for TrishulHub.", status: "IDLE" },
      { name: "Client Hunter Agent", type: "CLIENT_HUNTER", description: "Finds clients via web search, generates leads, drafts outreach emails, scores prospects", model: "glm-4.5-flash", systemPrompt: "You are Client Hunter Agent for TrishulHub.", status: "IDLE" },
      { name: "Finance Agent", type: "FINANCE", description: "Estimates project costs, generates invoices & quotations, tracks payments, financial reports", model: "glm-4.5-flash", systemPrompt: "You are Finance Agent for TrishulHub.", status: "IDLE" },
      { name: "Project Manager Agent", type: "PROJECT_MANAGER", description: "Breaks down projects into phases & tasks, assigns work, tracks deadlines, manages approvals", model: "glm-4.5-flash", systemPrompt: "You are Project Manager Agent for TrishulHub.", status: "IDLE" },
      { name: "HR Agent", type: "HR", description: "Manages leave, tracks attendance, monitors workload, suggests best-fit employees for tasks", model: "glm-4.5-flash", systemPrompt: "You are HR Agent for TrishulHub.", status: "IDLE" },
      { name: "Content Agent", type: "CONTENT", description: "Writes website copy, social media posts, blog articles, SEO-optimized content", model: "glm-4.5-flash", systemPrompt: "You are Content Agent for TrishulHub.", status: "IDLE" },
      { name: "Support Agent", type: "SUPPORT", description: "Handles client tickets, answers FAQs, provides technical support, escalates issues", model: "glm-4.5-flash", systemPrompt: "You are Support Agent for TrishulHub.", status: "IDLE" },
    ]
    for (const a of agentDefs) {
      const agent = await db.agent.create({ data: a })
      createdAgents.push(agent)
    }
    logs.push("Created 7 AI agents")

    // Create agent role configs (using default configs from types.ts)
    const roleConfigs = [
      { agentType: "DEV", rolePrompt: "You are Dev Agent, an expert full-stack developer for TrishulHub. You write production-quality code in HTML, CSS, JavaScript, TypeScript, React, Next.js, PHP, and Python. You follow phased development: plan → implement → review → deploy. Each phase requires human approval before proceeding.", features: { webSearch: false, autoTask: true, crossAgent: true, approvalRequired: true, codeReview: true, phasedDevelopment: true } },
      { agentType: "CLIENT_HUNTER", rolePrompt: "You are Client Hunter Agent, an expert sales and business development agent for TrishulHub. Find potential clients who need web development services. Search the web for businesses, analyze their online presence, score leads, draft personalized cold emails. When you find a promising lead, prepare an outreach email for human approval. Work closely with Finance Agent (quotation) and Project Manager (project planning).", features: { webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, leadScoring: true, emailDrafting: true } },
      { agentType: "FINANCE", rolePrompt: "You are Finance Agent, an expert financial assistant for TrishulHub. Estimate project costs, generate professional invoices and quotations, track payments. When Client Hunter finds a lead, automatically prepare cost estimation. All financial outputs require human approval.", features: { webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true } },
      { agentType: "PROJECT_MANAGER", rolePrompt: "You are Project Manager Agent for TrishulHub. Deeply analyze project requirements, break them into phases and tasks, assign work, track deadlines. Each project phase requires human approval. Work closely with Finance Agent on budgets and Dev Agent on implementation.", features: { webSearch: false, autoTask: true, crossAgent: true, approvalRequired: true, riskAlerts: true } },
      { agentType: "HR", rolePrompt: "You are HR Agent for TrishulHub. Manage leave requests, track attendance, monitor workload, suggest best-fit employees for tasks. Analyze team capacity and ensure fair workload distribution.", features: { webSearch: false, autoTask: false, crossAgent: true, workloadTracking: true, leaveManagement: true } },
      { agentType: "CONTENT", rolePrompt: "You are Content Agent for TrishulHub. Write website copy, social media posts, blog articles, email campaigns, and SEO-optimized content. All content pieces require human approval before publishing.", features: { webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, seoOptimization: true } },
      { agentType: "SUPPORT", rolePrompt: "You are Support Agent for TrishulHub. Handle client tickets, answer FAQs, provide technical troubleshooting, escalate complex issues. When an issue requires development work, escalate to Dev Agent.", features: { webSearch: false, autoTask: true, crossAgent: true, autoEscalation: true, knowledgeBase: true } },
    ]

    for (const config of roleConfigs) {
      const agent = createdAgents.find(a => a.type === config.agentType)
      if (agent) {
        await db.agentRoleConfig.create({
          data: {
            agentId: agent.id,
            rolePrompt: config.rolePrompt,
            quickActions: JSON.stringify([]),
            specialCommands: JSON.stringify([]),
            features: JSON.stringify(config.features),
            suggestedPrompts: JSON.stringify([]),
            autoWorkflows: JSON.stringify([]),
          }
        })
      }
    }
    logs.push("Created 7 agent role configs")

    // Create user-agent access
    const accessMappings = [
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === "CLIENT_HUNTER")?.id, canChat: true, canView: true, canApprove: true },
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === "FINANCE")?.id, canChat: true, canView: true, canApprove: true },
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === "CONTENT")?.id, canChat: true, canView: true, canApprove: false },
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === "PROJECT_MANAGER")?.id, canChat: true, canView: true, canApprove: false },
      { userId: kiran.id, agentId: createdAgents.find(a => a.type === "DEV")?.id, canChat: true, canView: true, canApprove: false },
      { userId: kiran.id, agentId: createdAgents.find(a => a.type === "PROJECT_MANAGER")?.id, canChat: true, canView: true, canApprove: false },
      { userId: akshat.id, agentId: createdAgents.find(a => a.type === "DEV")?.id, canChat: true, canView: true, canApprove: false },
      { userId: akshat.id, agentId: createdAgents.find(a => a.type === "PROJECT_MANAGER")?.id, canChat: true, canView: true, canApprove: false },
      { userId: akshat.id, agentId: createdAgents.find(a => a.type === "SUPPORT")?.id, canChat: true, canView: true, canApprove: false },
    ].filter(m => m.agentId)

    for (const mapping of accessMappings) {
      await db.userAgentAccess.create({ data: mapping as any })
    }
    logs.push("Created user-agent access mappings")

    // Create sample data
    const clients = await Promise.all([
      db.client.create({ data: { name: "Rahul Sharma", email: "rahul@example.com", phone: "+91-9876543210", company: "Sharma Electronics", website: "sharmaelectronics.in", status: "ACTIVE", userId: clientUser.id } }),
      db.client.create({ data: { name: "Priya Patel", email: "priya@beautylounge.com", phone: "+91-9876543211", company: "Priya Beauty Lounge", website: "priyabeautylounge.com", status: "ACTIVE" } }),
      db.client.create({ data: { name: "Amit Verma", email: "amit@vermarestaurant.com", phone: "+91-9876543212", company: "Verma Restaurant", status: "ACTIVE" } }),
    ])
    logs.push("Created 3 clients")

    await Promise.all([
      db.project.create({ data: { name: "Sharma Electronics Website", clientId: clients[0].id, status: "IN_PROGRESS", progress: 65, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), budget: 15000 } }),
      db.project.create({ data: { name: "Priya Beauty Lounge Website", clientId: clients[1].id, status: "REVIEW", progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 } }),
      db.project.create({ data: { name: "Verma Restaurant Website", clientId: clients[2].id, status: "PLANNING", progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 } }),
    ])
    logs.push("Created 3 projects")

    await Promise.all([
      db.lead.create({ data: { name: "Vikram Singh", email: "vikram@fitnessgym.com", company: "Fitness Gym", website: "fitnessgym.in", source: "AI_FOUND", score: 78, status: "CONTACTED" } }),
      db.lead.create({ data: { name: "Neha Gupta", email: "neha@fashionboutique.com", company: "Fashion Boutique", source: "MANUAL", score: 65, status: "INTERESTED" } }),
      db.lead.create({ data: { name: "Rajesh Kumar", email: "rajesh@autodealer.com", company: "Kumar Auto Dealer", website: "kumarauto.in", source: "AI_FOUND", score: 82, status: "NEW" } }),
    ])
    logs.push("Created 3 leads")

    await Promise.all([
      db.expense.create({ data: { category: "HOSTING", description: "Vercel Pro Plan", amount: 0, date: new Date() } }),
      db.expense.create({ data: { category: "API_COSTS", description: "Z.ai API", amount: 5.50, date: new Date() } }),
      db.expense.create({ data: { category: "DOMAINS", description: "Client domain renewals", amount: 24.00, date: new Date() } }),
    ])
    logs.push("Created 3 expenses")

    logs.push("SETUP COMPLETE!")

    return NextResponse.json({
      status: "success",
      message: "Database set up and seeded successfully!",
      // SECURITY: Generated password is returned ONCE. Save this — it will not be shown again.
      // All users share this initial password and MUST change it on first login.
      _warning: "Save this password now. It will NOT be shown again. Force password change on first login.",
      generatedPassword,
      created: { users: 5, agents: 7, clients: 3, projects: 3, leads: 3, expenses: 3 },
      logs
    })

  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      error: "Setup failed",
      logs
    }, { status: 500 })
  }
}
