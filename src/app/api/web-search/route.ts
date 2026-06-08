import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"

// POST /api/web-search - Search the web using Z.ai SDK
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SECURITY: Only admin users can use web search (consumes API credits)
    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    // FIX: Rate limit web search to prevent API credit abuse
    const { success: rlOk } = rateLimit(`web-search:${session.user.id}`, 20, 60000)
    if (!rlOk) {
      return NextResponse.json({ error: "Too many requests. Max 20 searches per minute." }, { status: 429 })
    }

    // W59: Wrap req.json() in try/catch
    let body: { query?: string; numResults?: number }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const { query, numResults } = body
    if (!query) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 })
    }

    // FIX: Validate numResults to prevent excessive API credit consumption
    if (numResults !== undefined && (typeof numResults !== "number" || numResults < 1 || numResults > 20)) {
      return NextResponse.json({ error: "numResults must be between 1 and 20" }, { status: 400 })
    }

    // FIX: Validate query length to prevent excessively large inputs
    if (query.length > 500) {
      return NextResponse.json({ error: "Search query too long (max 500 characters)" }, { status: 400 })
    }

    // FIX: Sanitize query — strip control characters and trim whitespace
    const sanitizedQuery = query.replace(/[\x00-\x1F\x7F]/g, "").trim()
    if (!sanitizedQuery) {
      return NextResponse.json({ error: "Search query cannot be empty" }, { status: 400 })
    }

    // C8/I27: SDK reads ZAI_BASE_URL from process.env directly.
    // Only set the fallback if ZAI_BASE_URL isn't already defined.
    // This minimizes process.env mutation to the strict necessary case.
    // TODO (C8): Refactor SDK to accept baseUrl as config parameter instead of mutating process.env (serverless race condition risk)
    if (!process.env.ZAI_BASE_URL && process.env.ZAI_API_BASE_URL) {
      process.env.ZAI_BASE_URL = process.env.ZAI_API_BASE_URL
    }

    // Dynamic import to avoid build-time issues
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()

    const searchResult = await zai.functions.invoke("web_search", {
      query: sanitizedQuery,
      num: numResults || 10,
    })

    return NextResponse.json({
      query: sanitizedQuery,
      results: searchResult,
      count: Array.isArray(searchResult) ? searchResult.length : 0,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[web-search] Error:", msg)
    return NextResponse.json(
      { error: "Web search failed" },
      { status: 500 }
    )
  }
}
