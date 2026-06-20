import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken, isAgentAdmin, isAgentSuperAdmin } from "@/lib/agent-auth";
import { getGreeting, getUKDate, getUKDateString, getUKDayName, getUKTimeHHMM } from "@/lib/uk-time";

// ── GET /api/agent/me ──
// Returns the authenticated user's identity, role, tier.
// This is the "who am I" endpoint — called right after OTP verification.
// Includes UK timezone context (greeting, day name, date, time) and current
// attendance status so the GLM session can greet the user properly:
//   "Good morning Akshat, today is Saturday. I'm ready to assist you."
export async function GET(request: NextRequest) {
  try {
    const payload = extractAgentToken(request.headers.get("authorization"));

    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        department: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Account no longer active" }, { status: 403 });
    }

    // ── UK timezone context ──
    const now = new Date();
    const greeting = getGreeting(now);
    const ukDayName = getUKDayName(now);
    const ukDate = getUKDateString(now);
    const ukTime = getUKTimeHHMM(now);

    // ── Attendance status ──
    // Mirrors the logic in /api/agent/attendance/status but inlined here to
    // avoid a round-trip. Returns: active, clockInAt, todayHours, timeEntryId.
    const ukTodayMidnight = getUKDate(now);
    const ukTomorrowMidnight = new Date(ukTodayMidnight.getTime() + 24 * 60 * 60 * 1000);

    const activeEntry = await db.timeEntry.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { clockIn: "desc" },
      select: { id: true, clockIn: true },
    });

    const todayCompletedAgg = await db.timeEntry.aggregate({
      where: {
        userId: user.id,
        status: "COMPLETED",
        date: { gte: ukTodayMidnight, lt: ukTomorrowMidnight },
      },
      _sum: { totalHours: true },
    });
    const completedHours = todayCompletedAgg._sum.totalHours || 0;
    const activeHours = activeEntry
      ? (now.getTime() - activeEntry.clockIn.getTime()) / (1000 * 60 * 60)
      : 0;
    const todayHours = Math.round((completedHours + activeHours) * 100) / 100;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tier: payload.tier,
        department: user.department || null,
        isAdmin: isAgentAdmin(payload),
        isSuperAdmin: isAgentSuperAdmin(payload),
      },
      // UK timezone context — lets the GLM session greet the user properly.
      greeting,
      ukDayName,
      ukDate,
      ukTime,
      // Current attendance status.
      attendance: {
        active: !!activeEntry,
        clockInAt: activeEntry ? activeEntry.clockIn.toISOString() : null,
        todayHours,
        timeEntryId: activeEntry ? activeEntry.id : null,
      },
      tokenExpiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (error) {
    console.error("[agent/me] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
