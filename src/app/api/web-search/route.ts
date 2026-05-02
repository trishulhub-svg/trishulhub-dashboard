import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import fs from "fs"
import path from "path"

// POST /api/web-search - Search the web using Z.ai SDK
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { query, numResults } = await req.json()
    if (!query) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 })
    }

    // Ensure .z-ai-config exists for the SDK. If missing (e.g., Vercel deployment),
    // create it from environment variables so web search works everywhere.
    const configPath = path.join(process.cwd(), ".z-ai-config")
    try {
      fs.accessSync(configPath)
    } catch {
      // Config file doesn't exist — create it from env vars if available
      const baseUrl = process.env.ZAI_BASE_URL || process.env.ZAI_API_BASE_URL
      const apiKey = process.env.ZAI_API_KEY
      if (baseUrl && apiKey) {
        fs.writeFileSync(configPath, JSON.stringify({ baseUrl, apiKey }), "utf-8")
      }
    }

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
