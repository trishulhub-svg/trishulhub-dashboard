import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken } from "@/lib/agent-auth";

// ── POST /api/agent/attendance/end ──
// Auto clock-out for an agent session — typically called when the GLM session
// receives the /end command.
//
// Finds the user's most-recent ACTIVE TimeEntry and closes it with
// clockOutMethod = "END_COMMAND".
//
// Idempotent: if no ACTIVE entry exists, returns success with a message.
//
// Requires: Bearer JWT (agent auth).
export async function POST(request: NextRequest) {
  try {
    const payload = extractAgentToken(request.headers.get("authorization"));
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Account no longer active" }, { status: 403 });
    }

    const userId = payload.userId;
    const now = new Date();

    // Find the user's most-recent ACTIVE entry (the one we should close)
    const activeEntry = await db.timeEntry.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { clockIn: "desc" },
      select: { id: true, clockIn: true },
    });

    if (!activeEntry) {
      return NextResponse.json({
        success: true,
        message: "No active session to end",
        totalHours: 0,
      });
    }

    // Compute total hours (rounded to 2 decimal places)
    const diffMs = now.getTime() - activeEntry.clockIn.getTime();
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    await db.timeEntry.update({
      where: { id: activeEntry.id },
      data: {
        clockOut: now,
        clockOutMethod: "END_COMMAND",
        status: "COMPLETED",
        totalHours,
      },
    });

    return NextResponse.json({
      success: true,
      totalHours,
      timeEntryId: activeEntry.id,
    });
  } catch (error) {
    console.error("[agent/attendance/end] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
