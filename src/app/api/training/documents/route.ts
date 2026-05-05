import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"
import { execSync } from "child_process"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

// GET /api/training/documents - List all training documents
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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

    const userId = session.user.id
    const rl = rateLimit(userId, 5, 60000) // 5 per min - AI generation is expensive
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

    // Generate document content with AI
    let content = ""
    let summary = ""
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default
      const zai = await ZAI.create()

      const completion = await zai.chat.completions.create({
        messages: [
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

[CHART: Flow diagram showing the process]

## 4. Types / Categories
Different types with explanations and when to use each

[CHART: Comparison table of types]

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

[IMAGE: An illustration showing the main concept of ${topic.trim()}]

IMPORTANT RULES:
- Use simple English (8th grade reading level)
- Each section should be detailed (at least 3-5 paragraphs or 5+ list items)
- Include [CHART: description] placeholders where a chart would help understanding
- Include [IMAGE: description] placeholders where an illustration would help
- Use bold for key terms
- Use code blocks for any code examples
- Use tables for comparisons
- Make it engaging and practical`,
          },
        ],
        max_tokens: 8000,
        temperature: 0.7,
      })

      content = completion.choices[0]?.message?.content || ""
    } catch (aiError: any) {
      console.error("[training/documents] AI generation error:", aiError.message)
      return NextResponse.json({ error: "Failed to generate document content. Please try again." }, { status: 500 })
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

    // Generate images for the document
    const imageUrls: string[] = []
    try {
      const imgDir = path.join(process.cwd(), "public", "training-images")
      await mkdir(imgDir, { recursive: true })

      const imagePrompts = [
        `Professional training illustration about ${topic.trim()}, clean modern design, educational infographic style`,
        `Educational concept diagram about ${topic.trim()}, minimalist illustration, blue and white color scheme`,
      ]

      for (let i = 0; i < imagePrompts.length; i++) {
        try {
          const safeTopic = topic.trim().replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
          const imgPath = path.join(imgDir, `${safeTopic}-${document.id}-${i}.png`)
          execSync(`z-ai-generate -p "${imagePrompts[i]}" -o "${imgPath}" -s 1024x1024`, {
            timeout: 60000,
            stdio: "pipe",
          })
          imageUrls.push(`/training-images/${safeTopic}-${document.id}-${i}.png`)
        } catch (imgErr: any) {
          console.error(`[training/documents] Image ${i} generation failed:`, imgErr.message)
        }
      }
    } catch (imgError: any) {
      console.error("[training/documents] Image generation error:", imgError.message)
    }

    // Update document with content and status
    const updated = await db.trainingDocument.update({
      where: { id: document.id },
      data: {
        content,
        summary,
        imageUrl: imageUrls[0] || null,
        imageUrls: JSON.stringify(imageUrls),
        status: "READY",
      },
      include: {
        generator: { select: { id: true, name: true } },
        _count: { select: { tests: true, assignments: true } },
      },
    })

    return NextResponse.json(updated, { status: 201 })
  } catch (error: any) {
    console.error("[training/documents] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
