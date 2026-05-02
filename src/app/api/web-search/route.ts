import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/rbac"

// POST /api/web-search - Search the web using Z.ai SDK
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SECURITY: Only admin users can use web search (consumes API credits)
    const userRole = (session.user as any)?.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { query, numResults } = await req.json()
    if (!query) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 })
    }

    // SECURITY FIX: Use environment variables directly instead of writing config to disk.
    // Vercel's filesystem is read-only — writing .z-ai-config fails silently.
    // Also, writing API keys to plain JSON files on disk is a security risk.
    // Set env vars before importing the SDK so it picks them up.
    const baseUrl = process.env.ZAI_BASE_URL || process.env.ZAI_API_BASE_URL
    const apiKey = process.env.ZAI_API_KEY
    if (baseUrl) process.env.ZAI_BASE_URL = baseUrl
    if (apiKey) process.env.ZAI_API_KEY = apiKey

    // Dynamic import to avoid build-time issues
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()

    const searchResult = await zai.functions.invoke("web_search", {
      query,
      num: numResults || 10,
    })

    return NextResponse.json({
      query,
      results: searchResult,
      count: Array.isArray(searchResult) ? searchResult.length : 0,
    })
  } catch (error: any) {
    console.error("[web-search] Error:", error.message)
    return NextResponse.json(
      { error: "Web search failed" },
      { status: 500 }
    )
  }
}
