import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"
import { callAIWithFailover } from "@/lib/ai/openrouter"

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

// Vercel serverless function timeout (seconds) — AI generation needs more time
export const maxDuration = 60

// POST /api/training/tests/generate - Generate test for a document
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
    const { documentId, level } = body

    if (!documentId) return NextResponse.json({ error: "Document ID is required" }, { status: 400 })
    if (!level || !["LOW", "MEDIUM", "HIGH"].includes(level)) {
      return NextResponse.json({ error: "Level must be LOW, MEDIUM, or HIGH" }, { status: 400 })
    }

    // Check document exists
    const document = await db.trainingDocument.findUnique({ where: { id: documentId } })
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })
    if (!document.content) return NextResponse.json({ error: "Document has no content" }, { status: 400 })

    // Check if test already exists for this document + level
    const existingTest = await db.trainingTest.findUnique({
      where: { documentId_level: { documentId, level } },
    })
    if (existingTest) return NextResponse.json({ error: "Test already exists for this level" }, { status: 409 })

    const difficultyInstructions: Record<string, string> = {
      LOW: "basic recall and understanding questions. Simple concepts directly from the text.",
      MEDIUM: "application questions. Test if the reader can apply concepts to scenarios.",
      HIGH: "analysis and critical thinking questions. Test deep understanding with complex scenarios.",
    }

    let questions: any[] = []
    try {
      // Get available API keys from database
      const apiKeys = await db.apiKey.findMany({
        where: { status: { in: ["ACTIVE"] } },
        orderBy: { priority: "asc" },
      })

      if (!apiKeys || apiKeys.length === 0) {
        return NextResponse.json({
          error: "No AI API keys configured. Go to Dashboard > API Keys and add at least one API key.",
        }, { status: 500 })
      }

      const result = await callAIWithFailover(
        [
          {
            role: "system",
            content: "You are an expert assessment creator. Create questions based ONLY on the provided training material.",
          },
          {
            role: "user",
            content: `Based on this training document about "${document.topic}", create exactly 10 multiple-choice questions at ${level} difficulty level.

${difficultyInstructions[level]}

IMPORTANT RULES:
- ALL questions must be based ONLY on the document content below
- Each question must have exactly 4 options (A, B, C, D)
- Only ONE option is correct (use correctAnswer as the index: 0 for A, 1 for B, 2 for C, 3 for D)
- Include a brief explanation for why the correct answer is right
- Questions should test understanding, not just memorization
- Return ONLY valid JSON, no markdown wrapping

Training Document:
${document.content}

Return format:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Explanation of why A is correct"
  }
]`,
          },
        ],
        "glm-4.7-flash",
        apiKeys,
        { maxTokens: 4000, temperature: 0.5 }
      )

      const aiContent = result.content
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0])
      } else {
        questions = JSON.parse(aiContent)
      }

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
      console.error("[training/tests/generate] AI error:", aiError.message, aiError.stack)
      return NextResponse.json({
        error: `AI generation failed: ${aiError.message}. Make sure you have active API keys configured in Dashboard > API Keys.`,
      }, { status: 500 })
    }

    // Validate questions structure
    if (!Array.isArray(questions) || questions.length < 5) {
      return NextResponse.json({ error: "AI generated insufficient questions. Please try again." }, { status: 500 })
    }

    // Validate and sanitize each question
    questions = questions.slice(0, 10).map((q: any, idx: number) => {
      let correctAnswer = typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer <= 3
        ? q.correctAnswer
        : ["A", "a", "B", "b", "C", "c", "D", "d"].indexOf(q.correctAnswer)
      if (correctAnswer === -1 || typeof correctAnswer !== "number" || isNaN(correctAnswer)) {
        correctAnswer = 0
      }
      return {
        question: String(q.question || `Question ${idx + 1}`),
        options: Array.isArray(q.options) && q.options.length === 4
          ? q.options.map(String)
          : ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer,
        explanation: String(q.explanation || "Refer to the training material."),
      }
    })

    while (questions.length < 10) {
      const lastQ = questions[questions.length - 1]
      questions.push({
        question: `Additional question ${questions.length + 1} about ${document.topic}`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: 0,
        explanation: "Refer to the training material.",
      })
    }

    // Create test in database
    const test = await db.trainingTest.create({
      data: {
        documentId,
        level,
        questions: JSON.stringify(questions),
        timeLimit: 20,
        generatedBy: userId,
      },
      include: {
        generator: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(test, { status: 201 })
  } catch (error: any) {
    console.error("[training/tests/generate] POST error:", error.message, error.stack)
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 })
  }
}
