import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"

// POST /api/training/tests/generate - Generate test for a document
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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

    // Generate test with AI
    const difficultyInstructions: Record<string, string> = {
      LOW: "basic recall and understanding questions. Simple concepts directly from the text.",
      MEDIUM: "application questions. Test if the reader can apply concepts to scenarios.",
      HIGH: "analysis and critical thinking questions. Test deep understanding with complex scenarios.",
    }

    let questions: any[] = []
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default
      const zai = await ZAI.create()

      const completion = await zai.chat.completions.create({
        messages: [
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
        max_tokens: 4000,
        temperature: 0.5,
      })

      const content = completion.choices[0]?.message?.content || "[]"
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0])
      } else {
        questions = JSON.parse(content)
      }

      // Validate questions
      if (!Array.isArray(questions) || questions.length < 5) {
        return NextResponse.json({ error: "AI generated insufficient questions. Please try again." }, { status: 500 })
      }

      // Ensure exactly 10 questions
      questions = questions.slice(0, 10)
      // Pad if less than 10
      while (questions.length < 10) {
        questions.push(questions[questions.length - 1] || { question: "Filler question", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "Filler" })
      }
    } catch (aiError: any) {
      console.error("[training/tests/generate] AI error:", aiError.message)
      return NextResponse.json({ error: "Failed to generate test. Please try again." }, { status: 500 })
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
    console.error("[training/tests/generate] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
