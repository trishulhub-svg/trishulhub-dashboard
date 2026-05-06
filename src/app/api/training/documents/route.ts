import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

// Vercel serverless function timeout (seconds) — AI generation needs more time
export const maxDuration = 60

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
      const zai = createZAI(ZAI)

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
      console.error("[training/documents] AI generation error:", aiError.message, aiError.stack)
      // Clean up draft document on failure
      try { await db.trainingDocument.delete({ where: { id: document.id } }) } catch {}
      const msg = aiError.message || "Unknown error"
      const isConfigError = msg.includes("Configuration file") || msg.includes("config") || msg.includes("baseUrl") || msg.includes("apiKey")
      return NextResponse.json({
        error: isConfigError
          ? `AI SDK not configured. Set ZAI_BASE_URL and ZAI_API_KEY in Vercel env vars. Details: ${msg}`
          : `AI generation failed: ${msg}`,
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

    // Save document with content FIRST — return to client immediately
    // Images will be generated in the background (non-blocking)
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

    // Fire-and-forget: generate images in background using SDK (not blocking CLI)
    generateImagesAsync(document.id, topic.trim()).catch((err) => {
      console.error("[training/documents] Background image error:", err?.message)
    })

    return NextResponse.json(updated, { status: 201 })
  } catch (error: any) {
    console.error("[training/documents] POST error:", error.message, error.stack)
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 })
  }
}

/**
 * Create a ZAI SDK instance using env vars (Vercel-safe).
 * Falls back to ZAI.create() for local dev where .z-ai-config exists.
 */
function createZAI(ZAI: any) {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (baseUrl && apiKey) {
    return new ZAI({ baseUrl, apiKey })
  }
  // Fallback: let the SDK read from .z-ai-config (works in local dev)
  // @ts-ignore — static create method exists on the SDK class
  return ZAI.create()
}

async function generateImagesAsync(documentId: string, topic: string) {
  try {
    // Skip image generation on Vercel (read-only filesystem)
    if (process.env.NODE_ENV === "production") {
      console.log("[training/documents] Skipping image generation on production (read-only FS)")
      return
    }

    const ZAI = (await import("z-ai-web-dev-sdk")).default
    const zai = createZAI(ZAI)

    const imgDir = path.join(process.cwd(), "public", "training-images")
    await mkdir(imgDir, { recursive: true })

    const prompts = [
      `Professional training illustration about ${topic}, clean modern design, educational infographic style, no text overlay`,
      `Educational concept diagram about ${topic}, minimalist flat illustration, blue and white color scheme, no text`,
    ]

    const imageUrls: string[] = []

    for (let i = 0; i < prompts.length; i++) {
      try {
        const response = await zai.images.generations.create({
          prompt: prompts[i],
          size: "1024x1024",
        })

        const base64 = response.data?.[0]?.base64
        if (!base64) continue

        const safeTopic = topic.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
        const imgPath = path.join(imgDir, `${safeTopic}-${documentId}-${i}.png`)
        const buffer = Buffer.from(base64, "base64")
        await writeFile(imgPath, buffer)
        imageUrls.push(`/training-images/${safeTopic}-${documentId}-${i}.png`)
      } catch (imgErr: any) {
        console.error(`[training/documents] Image ${i} failed:`, imgErr.message)
      }
    }

    // Update document with image URLs once all images are ready
    if (imageUrls.length > 0) {
      await db.trainingDocument.update({
        where: { id: documentId },
        data: {
          imageUrl: imageUrls[0] || null,
          imageUrls: JSON.stringify(imageUrls),
        },
      })
      console.log(`[training/documents] Generated ${imageUrls.length} images for document ${documentId}`)
    }
  } catch (err: any) {
    console.error("[training/documents] Background image error:", err?.message)
  }
}
