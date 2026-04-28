import { NextResponse } from "next/server"
import { execSync } from "child_process"
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

    // Step 2: Touch the database file if it doesn't exist
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, '')
      logs.push(`Created database file: ${dbPath}`)
    } else {
      logs.push(`Database file exists: ${dbPath} (${fs.statSync(dbPath).size} bytes)`)
    }

    // Step 3: Update DATABASE_URL to absolute path
    process.env.DATABASE_URL = 'file:' + dbPath
    logs.push(`DATABASE_URL set to: ${process.env.DATABASE_URL}`)

    // Step 4: Run prisma db push to create schema
    logs.push("Step 4: Creating database schema...")
    try {
      // First generate the Prisma client
      try {
        execSync('npx prisma generate', {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 60000
        })
        logs.push("Prisma client generated")
      } catch (genErr: any) {
        logs.push(`Prisma generate: ${genErr.message?.substring(0, 100) || 'ok'}`)
      }

      execSync('npx prisma db push --accept-data-loss', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000
      })
      logs.push("Database schema created/updated")
    } catch (pushErr: any) {
      const errMsg = pushErr.message?.substring(0, 200) || 'Unknown error'
      logs.push(`Schema creation warning: ${errMsg}`)

      // Try without --accept-data-loss
      try {
        execSync('npx prisma db push', {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 60000
        })
        logs.push("Database schema created (second attempt)")
      } catch (pushErr2: any) {
        logs.push(`Schema creation failed: ${pushErr2.message?.substring(0, 200) || 'Unknown'}`)
      }
    }

    // Step 5: Seed the database
    logs.push("Step 5: Seeding database...")
    const { db } = await import('@/lib/db')
    const bcrypt = await import('bcryptjs')

    const existingUsers = await db.user.count()
    if (existingUsers > 0) {
      logs.push(`Database already has ${existingUsers} users - skipping seed`)
      await db.$disconnect()
      return NextResponse.json({
        status: "already_setup",
        message: "Database already set up and seeded!",
        users: existingUsers,
        logs
      })
    }

    const hashedPassword = await bcrypt.hash("password123", 12)

    // Create admin user
    const admin = await db.user.create({
      data: { name: "Taroon", email: "taroon@trishulhub.in", password: hashedPassword, role: "SUPER_ADMIN", isActive: true },
    })
    logs.push("Created admin user: taroon@trishulhub.in")

    // Create team members
    await db.user.create({ data: { name: "Pruthvi", email: "pruthvi@trishulhub.in", password: hashedPassword, role: "ADMIN", isActive: true } })
    await db.user.create({ data: { name: "Kiran", email: "kiran@trishulhub.in", password: hashedPassword, role: "DEVELOPER", isActive: true } })
    const clientUser = await db.user.create({ data: { name: "Rahul Sharma", email: "rahul@example.com", password: hashedPassword, role: "CLIENT", isActive: true } })
    logs.push("Created 4 additional users")

    // Create AI agents
    await Promise.all([
      db.agent.create({ data: { name: "Dev Agent", type: "DEV", description: "Writes code, builds websites, fixes bugs", model: "openai/gpt-4o-mini", systemPrompt: "You are an expert web developer for TrishulHub.", status: "IDLE" } }),
      db.agent.create({ data: { name: "Client Hunter Agent", type: "CLIENT_HUNTER", description: "Finds new clients, drafts cold emails", model: "openai/gpt-4o-mini", systemPrompt: "You are a sales agent for TrishulHub.", status: "IDLE" } }),
      db.agent.create({ data: { name: "Finance Agent", type: "FINANCE", description: "Generates invoices, tracks payments", model: "openai/gpt-4o-mini", systemPrompt: "You are a financial assistant for TrishulHub.", status: "IDLE" } }),
      db.agent.create({ data: { name: "Project Manager Agent", type: "PROJECT_MANAGER", description: "Breaks down projects into tasks", model: "openai/gpt-4o-mini", systemPrompt: "You are a project manager for TrishulHub.", status: "IDLE" } }),
      db.agent.create({ data: { name: "HR Agent", type: "HR", description: "Tracks attendance, manages leave", model: "meta-llama/llama-3.3-70b-instruct:free", systemPrompt: "You are an HR coordinator for TrishulHub.", status: "IDLE" } }),
      db.agent.create({ data: { name: "Content Agent", type: "CONTENT", description: "Writes website copy, social media posts", model: "openai/gpt-4o-mini", systemPrompt: "You are a content writer for TrishulHub.", status: "IDLE" } }),
      db.agent.create({ data: { name: "Support Agent", type: "SUPPORT", description: "Handles client tickets, answers FAQs", model: "meta-llama/llama-3.3-70b-instruct:free", systemPrompt: "You are a customer support agent for TrishulHub.", status: "IDLE" } }),
    ])
    logs.push("Created 7 AI agents")

    // Create sample clients
    const clients = await Promise.all([
      db.client.create({ data: { name: "Rahul Sharma", email: "rahul@example.com", phone: "+91-9876543210", company: "Sharma Electronics", website: "sharmaelectronics.in", status: "ACTIVE", userId: clientUser.id } }),
      db.client.create({ data: { name: "Priya Patel", email: "priya@beautylounge.com", phone: "+91-9876543211", company: "Priya Beauty Lounge", website: "priyabeautylounge.com", status: "ACTIVE" } }),
      db.client.create({ data: { name: "Amit Verma", email: "amit@vermarestaurant.com", phone: "+91-9876543212", company: "Verma Restaurant", status: "ACTIVE" } }),
    ])
    logs.push("Created 3 clients")

    // Create sample projects
    await Promise.all([
      db.project.create({ data: { name: "Sharma Electronics Website", clientId: clients[0].id, status: "IN_PROGRESS", progress: 65, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), budget: 15000 } }),
      db.project.create({ data: { name: "Priya Beauty Lounge Website", clientId: clients[1].id, status: "REVIEW", progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 } }),
      db.project.create({ data: { name: "Verma Restaurant Website", clientId: clients[2].id, status: "PLANNING", progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 } }),
    ])
    logs.push("Created 3 projects")

    // Create sample leads
    await Promise.all([
      db.lead.create({ data: { name: "Vikram Singh", email: "vikram@fitnessgym.com", company: "Fitness Gym", source: "AI_FOUND", score: 78, status: "CONTACTED" } }),
      db.lead.create({ data: { name: "Neha Gupta", email: "neha@fashionboutique.com", company: "Fashion Boutique", source: "MANUAL", score: 65, status: "INTERESTED" } }),
      db.lead.create({ data: { name: "Rajesh Kumar", email: "rajesh@autodealer.com", company: "Kumar Auto Dealer", source: "AI_FOUND", score: 82, status: "NEW" } }),
    ])
    logs.push("Created 3 leads")

    // Create sample expenses
    await Promise.all([
      db.expense.create({ data: { category: "HOSTING", description: "Hostinger Cloud Plan", amount: 7.99, date: new Date() } }),
      db.expense.create({ data: { category: "API_COSTS", description: "OpenRouter API", amount: 5.50, date: new Date() } }),
      db.expense.create({ data: { category: "DOMAINS", description: "Client domain renewals", amount: 24.00, date: new Date() } }),
    ])
    logs.push("Created 3 expenses")

    await db.$disconnect()

    logs.push("SETUP COMPLETE!")

    return NextResponse.json({
      status: "success",
      message: "Database set up and seeded successfully!",
      login: {
        email: "taroon@trishulhub.in",
        password: "password123"
      },
      created: {
        users: 5,
        agents: 7,
        clients: 3,
        projects: 3,
        leads: 3,
        expenses: 3
      },
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
