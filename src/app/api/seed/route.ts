import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { randomBytes } from "crypto"

// GET handler - allows seeding by visiting URL in browser
export async function GET() {
  // Fix #3: Require SUPER_ADMIN
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return POST()
}

export async function POST() {
  try {
    // Fix #3: Require SUPER_ADMIN for seeding
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can seed database" }, { status: 403 })
    }

    // Check if already seeded
    const existingUsers = await db.user.count()
    if (existingUsers > 0) {
      return NextResponse.json({ message: "Database already seeded", skipped: true })
    }

    // SECURITY: Generate a cryptographically random password instead of hardcoded value.
    // This route requires SUPER_ADMIN auth and only runs on an empty database.
    const generatedPassword = randomBytes(16).toString("hex")
    const hashedPassword = await bcrypt.hash(generatedPassword, 12)

    // Create users
    const taroon = await db.user.create({
      data: { name: "Taroon", email: "taroon@trishulhub.in", password: hashedPassword, role: "SUPER_ADMIN" },
    })
    const pruthvi = await db.user.create({
      data: { name: "Pruthvi", email: "pruthvi@trishulhub.in", password: hashedPassword, role: "ADMIN" },
    })
    const kiran = await db.user.create({
      data: { name: "Kiran", email: "kiran@trishulhub.in", password: hashedPassword, role: "DEVELOPER" },
    })
    const akshat = await db.user.create({
      data: { name: "Akshat", email: "akshat@trishulhub.in", password: hashedPassword, role: "DEVELOPER" },
    })

    // No placeholder API key - user adds their real key from the API Keys page

    // Create sample clients
    const clients = await Promise.all([
      db.client.create({
        data: { name: "Priya Patel", email: "priya@beautylounge.com", phone: "+91-9876543211", company: "Priya Beauty Lounge", website: "priyabeautylounge.com", status: "ACTIVE" },
      }),
      db.client.create({
        data: { name: "Amit Verma", email: "amit@vermarestaurant.com", phone: "+91-9876543212", company: "Verma Restaurant", status: "ACTIVE" },
      }),
    ])

    // Create sample projects
    await Promise.all([
      db.project.create({
        data: { name: "Priya Beauty Lounge Website", clientId: clients[0].id, status: "REVIEW", progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 },
      }),
      db.project.create({
        data: { name: "Verma Restaurant Website", clientId: clients[1].id, status: "PLANNING", progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 },
      }),
    ])

    // Create sample leads
    await Promise.all([
      db.lead.create({ data: { name: "Vikram Singh", email: "vikram@fitnessgym.com", company: "Fitness Gym", website: "fitnessgym.in", source: "AI_FOUND", score: 78, status: "CONTACTED" } }),
      db.lead.create({ data: { name: "Neha Gupta", email: "neha@fashionboutique.com", company: "Fashion Boutique", source: "MANUAL", score: 65, status: "INTERESTED" } }),
      db.lead.create({ data: { name: "Rajesh Kumar", email: "rajesh@autodealer.com", company: "Kumar Auto Dealer", website: "kumarauto.in", source: "AI_FOUND", score: 82, status: "NEW" } }),
      db.lead.create({ data: { name: "Sunita Devi", email: "sunita@yogastudio.com", company: "Peace Yoga Studio", source: "REFERRAL", score: 55, status: "PROPOSAL" } }),
      db.lead.create({ data: { name: "Deepak Jain", email: "deepak@jewelers.com", company: "Jain Jewelers", website: "jainjewelers.com", source: "SOCIAL_MEDIA", score: 70, status: "NEGOTIATING" } }),
    ])

    // Create sample invoices
    await db.invoice.create({
      data: {
        invoiceNumber: "INV-2026-001",
        clientId: clients[0].id,
        items: JSON.stringify([{ description: "Website Development - Priya Beauty Lounge", quantity: 1, rate: 12000 }]),
        subtotal: 12000,
        tax: 2160,
        total: 14160,
        status: "SENT",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    })
    await db.invoice.create({
      data: {
        invoiceNumber: "INV-2026-002",
        clientId: clients[1].id,
        items: JSON.stringify([{ description: "Website Development - Verma Restaurant", quantity: 1, rate: 18000 }]),
        subtotal: 18000,
        tax: 3240,
        total: 21240,
        status: "PAID",
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    })

    // Create sample expenses
    await Promise.all([
      db.expense.create({ data: { category: "HOSTING", description: "Hostinger Cloud Plan", amount: 7.99, date: new Date() } }),
      db.expense.create({ data: { category: "API_COSTS", description: "OpenRouter API", amount: 5.50, date: new Date() } }),
      db.expense.create({ data: { category: "DOMAINS", description: "Client domain renewals", amount: 24.00, date: new Date() } }),
    ])

    return NextResponse.json({
      message: "Database seeded successfully!",
      _warning: "Save this password now. It will NOT be shown again.",
      generatedPassword,
      users: 4,
      clients: 2,
      projects: 2,
      leads: 5,
      invoices: 2,
    })
  } catch (error: unknown) {
    console.error("[seed] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
