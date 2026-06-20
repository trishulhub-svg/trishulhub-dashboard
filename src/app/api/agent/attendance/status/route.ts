import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken } from "@/lib/agent-auth";
import { getUKDate } from "@/lib/uk-time";

// ── GET /api/agent/attendance/status ──
// Returns the user's current attendance status:
//   - active: boolean (does the user have an ACTIVE TimeEntry?)
//   - clockInAt: ISO string | null (when they clocked in, if active)
//   - todayHours: number (sum of totalHours for today's completed entries + live active duration)
//   - timeEntryId: string | null
//
// Requires: Bearer JWT (agent auth).
export async function GET(request: NextRequest) {
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

    // ── UK "today" boundaries ──
    const ukTodayMidnight = getUKDate(now);
    const ukTomorrowMidnight = new Date(ukTodayMidnight.getTime() + 24 * 60 * 60 * 1000);

    // ── Find the user's ACTIVE entry (most recent, if any) ──
    const activeEntry = await db.timeEntry.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { clockIn: "desc" },
      select: { id: true, clockIn: true },
    });

    // ── Sum totalHours for today's COMPLETED entries ──
    const todayCompletedAgg = await db.timeEntry.aggregate({
      where: {
        userId,
        status: "COMPLETED",
        date: { gte: ukTodayMidnight, lt: ukTomorrowMidnight },
      },
      _sum: { totalHours: true },
    });
    const completedHours = todayCompletedAgg._sum.totalHours || 0;

    // Live elapsed hours from the active entry (if any)
    const activeHours = activeEntry
      ? (now.getTime() - activeEntry.clockIn.getTime()) / (1000 * 60 * 60)
      : 0;

    const todayHours = Math.round((completedHours + activeHours) * 100) / 100;

    return NextResponse.json({
      success: true,
      active: !!activeEntry,
      clockInAt: activeEntry ? activeEntry.clockIn.toISOString() : null,
      todayHours,
      timeEntryId: activeEntry ? activeEntry.id : null,
    });
  } catch (error) {
    console.error("[agent/attendance/status] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
