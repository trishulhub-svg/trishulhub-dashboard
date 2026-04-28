import { NextResponse } from "next/server"
import path from "path"
import fs from "fs"

// GET handler - visit in browser to set up everything
export async function GET() {
  return POST()
}

export async function POST() {
  const logs: string[] = []

  try {
    // Step 1: Ensure database directory exists
    logs.push("Step 1: Checking database directory...")
    const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
    let dbPath = dbUrl.replace('file:', '')

    if (!path.isAbsolute(dbPath)) {
      dbPath = path.resolve(process.cwd(), dbPath)
    }

    const dbDir = path.dirname(dbPath)

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
      logs.push(`Created directory: ${dbDir}`)
    } else {
      logs.push(`Directory exists: ${dbDir}`)
    }

    // Step 2: Create the database file if it doesn't exist
    if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
      fs.writeFileSync(dbPath, Buffer.alloc(0))
      logs.push(`Created database file: ${dbPath}`)
    } else {
      logs.push(`Database file exists: ${dbPath} (${fs.statSync(dbPath).size} bytes)`)
    }

    // Step 3: Update DATABASE_URL to absolute path
    process.env.DATABASE_URL = 'file:' + dbPath
    logs.push(`DATABASE_URL: ${process.env.DATABASE_URL}`)

    // Step 4: Create tables using Prisma's raw SQL
    logs.push("Step 4: Creating database tables...")

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL }
      }
    })

    try {
      // Create all tables using raw SQL (same as prisma db push but without child process)
      const createTables = [
        `CREATE TABLE IF NOT EXISTS User (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'DEVELOPER',
          avatar TEXT,
          isActive BOOLEAN NOT NULL DEFAULT 1,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS ApiKey (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          keyName TEXT NOT NULL,
          keyValue TEXT NOT NULL,
          monthlyBudget REAL NOT NULL DEFAULT 18.0,
          currentSpend REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          priority INTEGER NOT NULL DEFAULT 1,
          assignedAgents TEXT NOT NULL DEFAULT '[]',
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS Agent (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
          systemPrompt TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'IDLE',
          apiKeyId TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (apiKeyId) REFERENCES ApiKey(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Client (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          company TEXT,
          website TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          userId TEXT,
          notes TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Project (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          clientId TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PLANNING',
          progress INTEGER NOT NULL DEFAULT 0,
          deadline DATETIME,
          budget REAL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (clientId) REFERENCES Client(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Task (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          projectId TEXT NOT NULL,
          assignedTo TEXT,
          assigneeType TEXT NOT NULL DEFAULT 'HUMAN',
          status TEXT NOT NULL DEFAULT 'TODO',
          priority TEXT NOT NULL DEFAULT 'MEDIUM',
          deadline DATETIME,
          completedAt DATETIME,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projectId) REFERENCES Project(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Invoice (
          id TEXT PRIMARY KEY,
          invoiceNumber TEXT NOT NULL UNIQUE,
          clientId TEXT NOT NULL,
          projectId TEXT,
          items TEXT NOT NULL DEFAULT '[]',
          subtotal REAL NOT NULL DEFAULT 0,
          tax REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          dueDate DATETIME,
          paidAt DATETIME,
          sentById TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (clientId) REFERENCES Client(id),
          FOREIGN KEY (projectId) REFERENCES Project(id),
          FOREIGN KEY (sentById) REFERENCES User(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Lead (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          company TEXT,
          website TEXT,
          phone TEXT,
          source TEXT NOT NULL DEFAULT 'MANUAL',
          score INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'NEW',
          notes TEXT,
          clientId TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (clientId) REFERENCES Client(id)
        )`,
        `CREATE TABLE IF NOT EXISTS LeadEmail (
          id TEXT PRIMARY KEY,
          leadId TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          direction TEXT NOT NULL DEFAULT 'OUTBOUND',
          status TEXT NOT NULL DEFAULT 'DRAFT',
          sentAt DATETIME,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (leadId) REFERENCES Lead(id)
        )`,
        `CREATE TABLE IF NOT EXISTS AgentConversation (
          id TEXT PRIMARY KEY,
          agentId TEXT NOT NULL,
          userId TEXT NOT NULL,
          title TEXT,
          messages TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agentId) REFERENCES Agent(id),
          FOREIGN KEY (userId) REFERENCES User(id)
        )`,
        `CREATE TABLE IF NOT EXISTS ApiUsageLog (
          id TEXT PRIMARY KEY,
          apiKeyId TEXT NOT NULL,
          agentId TEXT,
          model TEXT NOT NULL,
          inputTokens INTEGER NOT NULL DEFAULT 0,
          outputTokens INTEGER NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (apiKeyId) REFERENCES ApiKey(id),
          FOREIGN KEY (agentId) REFERENCES Agent(id)
        )`,
        `CREATE TABLE IF NOT EXISTS SupportTicket (
          id TEXT PRIMARY KEY,
          clientId TEXT NOT NULL,
          subject TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          priority TEXT NOT NULL DEFAULT 'MEDIUM',
          assignedTo TEXT,
          resolution TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (clientId) REFERENCES Client(id)
        )`,
        `CREATE TABLE IF NOT EXISTS TicketMessage (
          id TEXT PRIMARY KEY,
          ticketId TEXT NOT NULL,
          senderId TEXT,
          senderType TEXT NOT NULL DEFAULT 'HUMAN',
          message TEXT NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ticketId) REFERENCES SupportTicket(id)
        )`,
        `CREATE TABLE IF NOT EXISTS LeaveRequest (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'CASUAL',
          startDate DATETIME NOT NULL,
          endDate DATETIME NOT NULL,
          reason TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          approvedBy TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Attendance (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          date DATETIME NOT NULL,
          checkIn DATETIME,
          checkOut DATETIME,
          status TEXT NOT NULL DEFAULT 'PRESENT',
          notes TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Notification (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'INFO',
          isRead BOOLEAN NOT NULL DEFAULT 0,
          link TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id)
        )`,
        `CREATE TABLE IF NOT EXISTS Expense (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          date DATETIME NOT NULL,
          receiptUrl TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ]

      for (const sql of createTables) {
        try {
          await prisma.$executeRawUnsafe(sql)
        } catch (tableErr: any) {
          // Table might already exist, that's fine
          if (!tableErr.message?.includes('already exists')) {
            logs.push(`Table warning: ${tableErr.message?.substring(0, 80)}`)
          }
        }
      }
      logs.push("All tables created/verified")
    } catch (schemaErr: any) {
      logs.push(`Schema creation: ${schemaErr.message?.substring(0, 150)}`)
    }

    // Step 5: Seed the database
    logs.push("Step 5: Seeding database...")
    const bcrypt = await import('bcryptjs')

    let existingUsers = 0
    try {
      existingUsers = await prisma.user.count()
    } catch {
      // If count fails, tables might not exist yet
      logs.push("Could not count users - tables may need prisma db push")
    }

    if (existingUsers > 0) {
      logs.push(`Database already has ${existingUsers} users - skipping seed`)
      await prisma.$disconnect()
      return NextResponse.json({
        status: "already_setup",
        message: "Database already set up and seeded!",
        users: existingUsers,
        login: {
          email: "taroon@trishulhub.in",
          password: "password123"
        },
        logs
      })
    }

    const hashedPassword = await bcrypt.hash("password123", 12)

    // Create admin user
    await prisma.user.create({
      data: { name: "Taroon", email: "taroon@trishulhub.in", password: hashedPassword, role: "SUPER_ADMIN", isActive: true },
    })
    logs.push("Created admin: taroon@trishulhub.in")

    // Create team members
    await prisma.user.create({ data: { name: "Pruthvi", email: "pruthvi@trishulhub.in", password: hashedPassword, role: "ADMIN", isActive: true } })
    await prisma.user.create({ data: { name: "Kiran", email: "kiran@trishulhub.in", password: hashedPassword, role: "DEVELOPER", isActive: true } })
    const clientUser = await prisma.user.create({ data: { name: "Rahul Sharma", email: "rahul@example.com", password: hashedPassword, role: "CLIENT", isActive: true } })
    logs.push("Created 4 more users")

    // Create AI agents
    await Promise.all([
      prisma.agent.create({ data: { name: "Dev Agent", type: "DEV", description: "Writes code, builds websites, fixes bugs", model: "openai/gpt-4o-mini", systemPrompt: "You are an expert web developer for TrishulHub.", status: "IDLE" } }),
      prisma.agent.create({ data: { name: "Client Hunter Agent", type: "CLIENT_HUNTER", description: "Finds new clients, drafts cold emails", model: "openai/gpt-4o-mini", systemPrompt: "You are a sales agent for TrishulHub.", status: "IDLE" } }),
      prisma.agent.create({ data: { name: "Finance Agent", type: "FINANCE", description: "Generates invoices, tracks payments", model: "openai/gpt-4o-mini", systemPrompt: "You are a financial assistant for TrishulHub.", status: "IDLE" } }),
      prisma.agent.create({ data: { name: "Project Manager Agent", type: "PROJECT_MANAGER", description: "Breaks down projects into tasks", model: "openai/gpt-4o-mini", systemPrompt: "You are a project manager for TrishulHub.", status: "IDLE" } }),
      prisma.agent.create({ data: { name: "HR Agent", type: "HR", description: "Tracks attendance, manages leave", model: "meta-llama/llama-3.3-70b-instruct:free", systemPrompt: "You are an HR coordinator for TrishulHub.", status: "IDLE" } }),
      prisma.agent.create({ data: { name: "Content Agent", type: "CONTENT", description: "Writes website copy, social media posts", model: "openai/gpt-4o-mini", systemPrompt: "You are a content writer for TrishulHub.", status: "IDLE" } }),
      prisma.agent.create({ data: { name: "Support Agent", type: "SUPPORT", description: "Handles client tickets, answers FAQs", model: "meta-llama/llama-3.3-70b-instruct:free", systemPrompt: "You are a customer support agent for TrishulHub.", status: "IDLE" } }),
    ])
    logs.push("Created 7 AI agents")

    // Create clients
    const clients = await Promise.all([
      prisma.client.create({ data: { name: "Rahul Sharma", email: "rahul@example.com", phone: "+91-9876543210", company: "Sharma Electronics", website: "sharmaelectronics.in", status: "ACTIVE", userId: clientUser.id } }),
      prisma.client.create({ data: { name: "Priya Patel", email: "priya@beautylounge.com", phone: "+91-9876543211", company: "Priya Beauty Lounge", website: "priyabeautylounge.com", status: "ACTIVE" } }),
      prisma.client.create({ data: { name: "Amit Verma", email: "amit@vermarestaurant.com", phone: "+91-9876543212", company: "Verma Restaurant", status: "ACTIVE" } }),
    ])
    logs.push("Created 3 clients")

    // Create projects
    await Promise.all([
      prisma.project.create({ data: { name: "Sharma Electronics Website", clientId: clients[0].id, status: "IN_PROGRESS", progress: 65, deadline: new Date(Date.now() + 7*24*60*60*1000), budget: 15000 } }),
      prisma.project.create({ data: { name: "Priya Beauty Lounge Website", clientId: clients[1].id, status: "REVIEW", progress: 90, deadline: new Date(Date.now() + 2*24*60*60*1000), budget: 12000 } }),
      prisma.project.create({ data: { name: "Verma Restaurant Website", clientId: clients[2].id, status: "PLANNING", progress: 10, deadline: new Date(Date.now() + 21*24*60*60*1000), budget: 18000 } }),
    ])
    logs.push("Created 3 projects")

    // Create leads
    await Promise.all([
      prisma.lead.create({ data: { name: "Vikram Singh", email: "vikram@fitnessgym.com", company: "Fitness Gym", source: "AI_FOUND", score: 78, status: "CONTACTED" } }),
      prisma.lead.create({ data: { name: "Neha Gupta", email: "neha@fashionboutique.com", company: "Fashion Boutique", source: "MANUAL", score: 65, status: "INTERESTED" } }),
      prisma.lead.create({ data: { name: "Rajesh Kumar", email: "rajesh@autodealer.com", company: "Kumar Auto Dealer", source: "AI_FOUND", score: 82, status: "NEW" } }),
    ])
    logs.push("Created 3 leads")

    // Create expenses
    await Promise.all([
      prisma.expense.create({ data: { category: "HOSTING", description: "Hostinger Cloud Plan", amount: 7.99, date: new Date() } }),
      prisma.expense.create({ data: { category: "API_COSTS", description: "OpenRouter API", amount: 5.50, date: new Date() } }),
      prisma.expense.create({ data: { category: "DOMAINS", description: "Client domain renewals", amount: 24.00, date: new Date() } }),
    ])
    logs.push("Created 3 expenses")

    await prisma.$disconnect()
    logs.push("SETUP COMPLETE!")

    return NextResponse.json({
      status: "success",
      message: "Database set up and seeded successfully!",
      login: { email: "taroon@trishulhub.in", password: "password123" },
      created: { users: 5, agents: 7, clients: 3, projects: 3, leads: 3, expenses: 3 },
      logs
    })

  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      error: error.message,
      logs
    }, { status: 500 })
  }
}
