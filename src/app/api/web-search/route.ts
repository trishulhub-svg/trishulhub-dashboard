import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import ZAI from "z-ai-web-dev-sdk"

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
      { error: `Web search failed: ${error.message}` },
      { status: 500 }
    )
  }
}
