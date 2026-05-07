import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"
import { callAIWithFailover } from "@/lib/ai/openrouter"

// Vercel serverless function timeout (seconds) — AI generation needs more time
export const maxDuration = 60

// ━━ Auto-migration: Ensure training tables exist on Turso ━━
let migrationAttempted = false

async function ensureTrainingTables(): Promise<{ ok: boolean; error?: string }> {
  if (migrationAttempted) return { ok: true }
  migrationAttempted = true

  try {
    await db.$queryRawUnsafe(`SELECT 1 FROM TrainingDocument LIMIT 0`)
    return { ok: true }
  } catch {
    console.log("[training] TrainingDocument table missing — running auto-migration...")
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrainingDocument" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "topic" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "summary" TEXT,
          "imageUrl" TEXT,
          "imageUrls" TEXT NOT NULL DEFAULT '[]',
          "status" TEXT NOT NULL DEFAULT 'DRAFT',
          "generatedBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrainingTest" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "documentId" TEXT NOT NULL,
          "level" TEXT NOT NULL,
          "questions" TEXT NOT NULL,
          "timeLimit" INTEGER NOT NULL DEFAULT 20,
          "generatedBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("documentId") REFERENCES "TrainingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "TrainingTest_documentId_level_key" UNIQUE ("documentId", "level")
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrainingAssignment" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "documentId" TEXT NOT NULL,
          "testId" TEXT,
          "assignedTo" TEXT NOT NULL,
          "assignedBy" TEXT NOT NULL,
          "testLevel" TEXT NOT NULL DEFAULT 'LOW',
          "dueDate" DATETIME,
          "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("documentId") REFERENCES "TrainingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("testId") REFERENCES "TrainingTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TestAttempt" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "assignmentId" TEXT NOT NULL,
          "answers" TEXT NOT NULL,
          "score" INTEGER NOT NULL,
          "total" INTEGER NOT NULL DEFAULT 10,
          "timeTaken" INTEGER,
          "passed" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_assignedTo_idx" ON "TrainingAssignment"("assignedTo")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_status_idx" ON "TrainingAssignment"("status")`)
      console.log("[training] Auto-migration complete — all training tables created")
      return { ok: true }
    } catch (createErr: any) {
      console.error("[training] Auto-migration FAILED:", createErr.message)
      return { ok: false, error: createErr.message }
    }
  }
}

// GET /api/training/documents - List all training documents
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""

    const where: any = {}
    if (search) where.topic = { contains: search }
    if (status) where.status = status

    const documents = await db.trainingDocument.findMany({
      where,
      include: {
        generator: { select: { id: true, name: true } },
        _count: { select: { tests: true, assignments: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(documents)
  } catch (error: any) {
    console.error("[training/documents] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/training/documents - Create document (AI generates content)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 5, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json()
    const { topic } = body

    if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
      return NextResponse.json({ error: "Topic must be at least 3 characters" }, { status: 400 })
    }

    // Create DRAFT document first
    const document = await db.trainingDocument.create({
      data: {
        topic: topic.trim(),
        content: "",
        status: "DRAFT",
        generatedBy: userId,
      },
    })

    // Generate document content with AI (using the existing multi-provider AI system)
    let content = ""
    let summary = ""
    try {
      // Get available API keys from database
      const apiKeys = await db.apiKey.findMany({
        where: { status: { in: ["ACTIVE"] } },
        orderBy: { priority: "asc" },
      })

      if (!apiKeys || apiKeys.length === 0) {
        try { await db.trainingDocument.delete({ where: { id: document.id } }) } catch {}
        return NextResponse.json({
          error: "No AI API keys configured. Go to Dashboard > API Keys and add at least one API key (OpenRouter, Z.ai, Google AI, or NVIDIA).",
        }, { status: 500 })
      }

      const result = await callAIWithFailover(
        [
          {
            role: "system",
            content: `You are an expert corporate trainer. Create comprehensive, easy-to-understand training materials. Write in VERY SIMPLE English that anyone can understand. Use short sentences, simple words, and clear examples.`,
          },
          {
            role: "user",
            content: `Create a comprehensive training document about "${topic.trim()}".

Format it as markdown with these sections:
# ${topic.trim()} - Complete Training Guide

## 1. Introduction
Brief introduction to the topic (2-3 paragraphs in simple English)

## 2. Key Concepts
Main concepts explained simply with real-world analogies (at least 5 key points)

## 3. How It Works
Step-by-step explanation with examples (use numbered lists)

## 4. Types / Categories
Different types with explanations and when to use each

## 5. Best Practices
Top 10 best practices with explanations (numbered list)

## 6. Common Mistakes
Top 8 common mistakes beginners make and how to avoid them

## 7. Real-World Examples
3 practical examples with detailed walkthroughs

## 8. Quick Reference
Summary table or cheat sheet

## 9. Key Takeaways
5 bullet points of the most important things to remember

IMPORTANT RULES:
- Use simple English (8th grade reading level)
- Each section should be detailed (at least 3-5 paragraphs or 5+ list items)
- Use bold for key terms
- Use code blocks for any code examples
- Use tables for comparisons
- Make it engaging and practical`,
          },
        ],
        "glm-4.7-flash", // Use free model by default
        apiKeys,
        { maxTokens: 8000, temperature: 0.7 }
      )

      content = result.content

      // Update API key usage tracking
      if (result.apiKeyId && result.cost > 0) {
        await db.apiKey.update({
          where: { id: result.apiKeyId },
          data: { currentSpend: { increment: result.cost } },
        })
        await db.apiUsageLog.create({
          data: {
            apiKeyId: result.apiKeyId,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cost: result.cost,
          },
        })
      }
    } catch (aiError: any) {
      console.error("[training/documents] AI generation error:", aiError.message, aiError.stack)
      try { await db.trainingDocument.delete({ where: { id: document.id } }) } catch {}
      return NextResponse.json({
        error: `AI generation failed: ${aiError.message}. Make sure you have active API keys configured in Dashboard > API Keys.`,
      }, { status: 500 })
    }

    if (!content) {
      await db.trainingDocument.delete({ where: { id: document.id } })
      return NextResponse.json({ error: "AI generated empty content. Please try again." }, { status: 500 })
    }

    // Generate summary
    summary = content
      .replace(/^#+\s.*/gm, "")
      .replace(/\[CHART:.*?\]/g, "")
      .replace(/\[IMAGE:.*?\]/g, "")
      .replace(/[\*\#`>\-\|]/g, "")
      .split("\n")
      .filter((l) => l.trim().length > 20)
      .slice(0, 3)
      .join(" ")
      .trim()
      .slice(0, 300)

    // Save document with content
    const updated = await db.trainingDocument.update({
      where: { id: document.id },
      data: {
        content,
        summary,
        status: "READY",
      },
      include: {
        generator: { select: { id: true, name: true } },
        _count: { select: { tests: true, assignments: true } },
      },
    })

    return NextResponse.json(updated, { status: 201 })
  } catch (error: any) {
    console.error("[training/documents] POST error:", error.message, error.stack)
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 })
  }
}
