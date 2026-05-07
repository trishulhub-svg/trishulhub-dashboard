// ━━ Vercel Cron Endpoint — Triggers Autonomous Thinking Cycles ━━
// This endpoint is called by Vercel Cron every 2 minutes.
// It checks which agents are due for a thinking cycle and runs them.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureAutonomyTables } from "@/lib/ensure-autonomy-tables"
import { runAutonomyCycle, initAutonomyConfigs } from "@/lib/ai/autonomy-engine"

// Verify cron secret to prevent unauthorized calls
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // No secret = dev mode, allow all
  return authHeader === `Bearer ${cronSecret}`
}

async function handleRequest(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ensure tables exist (shared migration)
    await ensureAutonomyTables()
    // Initialize configs for agents that don't have one
    await initAutonomyConfigs()

    // Run autonomy cycle
    const result = await runAutonomyCycle()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (error: any) {
    console.error("[autonomy/cron] Fatal error:", error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function GET(request: Request) { return handleRequest(request) }
export async function POST(request: Request) { return handleRequest(request) }
