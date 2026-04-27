import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

export async function POST() {
  try {
    // Check if already seeded
    const existingUsers = await db.user.count()
    if (existingUsers > 0) {
      return NextResponse.json({ message: "Database already seeded", skipped: true })
    }

    const hashedPassword = await bcrypt.hash("password123", 12)

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

    // Create client user
    const clientUser = await db.user.create({
      data: { name: "Rahul Sharma", email: "rahul@example.com", password: hashedPassword, role: "CLIENT" },
    })

    // No placeholder API key - user adds their real key from the API Keys page
    const agents = await Promise.all([
      db.agent.create({
        data: {
          name: "Dev Agent",
          type: "DEV",
          description: "Writes code, builds websites, fixes bugs, deploys projects",
          model: "openai/gpt-4o-mini",
          systemPrompt: "You are an expert web developer for TrishulHub. You write clean, responsive HTML, CSS, JavaScript, and PHP code. When given a project requirement, you generate complete, working code. When given a screenshot with feedback, you analyze the image and fix the issues. Always include comments in your code. Format code in markdown code blocks.",
          status: "IDLE",
        },
      }),
      db.agent.create({
        data: {
          name: "Client Hunter Agent",
          type: "CLIENT_HUNTER",
          description: "Finds new clients, drafts cold emails, manages lead outreach",
          model: "openai/gpt-4o-mini",
          systemPrompt: "You are an expert sales agent for TrishulHub, a web development company. Your job is to find businesses that need websites and reach out to them. When given a type of business or location, you suggest lead criteria and search strategies. When given a lead, you write personalized cold emails that reference specific details about their business. Keep emails short (under 150 words), professional, and focused on the value TrishulHub provides. Always end with a clear call to action.",
          status: "IDLE",
        },
      }),
      db.agent.create({
        data: {
          name: "Finance Agent",
          type: "FINANCE",
          description: "Generates invoices, tracks payments, creates financial reports",
          model: "openai/gpt-4o-mini",
          systemPrompt: "You are a financial assistant for TrishulHub. You generate professional invoices, track payments, create financial reports, and send payment reminders. Always calculate amounts accurately and format financial data clearly. When creating invoices, include all necessary details: client name, project, line items, subtotal, tax, total, and due date.",
          status: "IDLE",
        },
      }),
      db.agent.create({
        data: {
          name: "Project Manager Agent",
          type: "PROJECT_MANAGER",
          description: "Breaks down projects into tasks, tracks deadlines, generates reports",
          model: "openai/gpt-4o-mini",
          systemPrompt: "You are a project manager for TrishulHub. You break down projects into tasks, set realistic deadlines, track progress, and ensure nothing is missed. When given a project description, you create a detailed task breakdown with estimated hours, dependencies, and assigned team members. Always be organized and thorough.",
          status: "IDLE",
        },
      }),
      db.agent.create({
        data: {
          name: "HR Agent",
          type: "HR",
          description: "Tracks attendance, manages leave, monitors workload",
          model: "meta-llama/llama-3.3-70b-instruct:free",
          systemPrompt: "You are an HR coordinator for TrishulHub. You track attendance, manage leave requests, monitor workload, and help with team coordination. You are organized and proactive about alerting management to potential issues like team overload or deadline risks. Keep responses concise and actionable.",
          status: "IDLE",
        },
      }),
      db.agent.create({
        data: {
          name: "Content Agent",
          type: "CONTENT",
          description: "Writes website copy, social media posts, blog articles, email templates",
          model: "openai/gpt-4o-mini",
          systemPrompt: "You are a content writer for TrishulHub. You write website copy, social media posts, blog articles, email templates, and case studies. Your writing is professional, engaging, and optimized for SEO. You adapt your tone based on the platform and audience. For Instagram, keep it casual with emojis. For LinkedIn, keep it professional. For websites, focus on clarity and conversion.",
          status: "IDLE",
        },
      }),
      db.agent.create({
        data: {
          name: "Support Agent",
          type: "SUPPORT",
          description: "Handles client tickets, answers FAQs, provides technical support",
          model: "meta-llama/llama-3.3-70b-instruct:free",
          systemPrompt: "You are a customer support agent for TrishulHub. You help clients with questions about their websites, hosting, domains, and general issues. You are friendly, patient, and thorough. If you cannot resolve an issue, you suggest escalating it to a human team member. Common answers: hosting is on Hostinger, domains are managed by TrishulHub, site access is via the client portal.",
          status: "IDLE",
        },
      }),
    ])

    // Create sample clients
    const clients = await Promise.all([
      db.client.create({
        data: { name: "Rahul Sharma", email: "rahul@example.com", phone: "+91-9876543210", company: "Sharma Electronics", website: "sharmaelectronics.in", status: "ACTIVE", userId: clientUser.id },
      }),
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
        data: { name: "Sharma Electronics Website", clientId: clients[0].id, status: "IN_PROGRESS", progress: 65, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), budget: 15000 },
      }),
      db.project.create({
        data: { name: "Priya Beauty Lounge Website", clientId: clients[1].id, status: "REVIEW", progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 },
      }),
      db.project.create({
        data: { name: "Verma Restaurant Website", clientId: clients[2].id, status: "PLANNING", progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 },
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
        items: JSON.stringify([{ description: "Website Development - Sharma Electronics", quantity: 1, rate: 15000 }]),
        subtotal: 15000,
        tax: 2700,
        total: 17700,
        status: "SENT",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    })
    await db.invoice.create({
      data: {
        invoiceNumber: "INV-2026-002",
        clientId: clients[1].id,
        items: JSON.stringify([{ description: "Website Development - Priya Beauty Lounge", quantity: 1, rate: 12000 }]),
        subtotal: 12000,
        tax: 2160,
        total: 14160,
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
      users: 5,
      agents: 7,
      clients: 3,
      projects: 3,
      leads: 5,
      invoices: 2,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
