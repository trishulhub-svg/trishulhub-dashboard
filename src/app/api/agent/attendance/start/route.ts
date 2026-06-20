import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken } from "@/lib/agent-auth";
import { getUKDate, getUKEndOfDay } from "@/lib/uk-time";

// ── POST /api/agent/attendance/start ──
// Auto clock-in for an agent session (called right after OTP verification).
//
// Idempotent: if the user already has an ACTIVE TimeEntry for today (UK date),
// returns that entry without creating a duplicate.
//
// Side effect: any ACTIVE entries from previous UK days are auto-closed with
// clockOutMethod = "AUTO_MISSED" and clockOut = end of that UK day.
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

    // ── Compute UK "today" boundaries ──
    // getUKDate() returns a server-local Date at midnight on the UK-current-day.
    // We use it as the lower bound; the upper bound is +24h.
    const ukTodayMidnight = getUKDate(now);
    const ukTomorrowMidnight = new Date(ukTodayMidnight.getTime() + 24 * 60 * 60 * 1000);

    // ── Close missed clock-outs from previous UK days ──
    // Find any ACTIVE entries whose date is before today's UK midnight.
    // Each gets clocked out at the end of its own UK day (23:59:59.999).
    let missedEntriesClosed = 0;
    const missedEntries = await db.timeEntry.findMany({
      where: {
        userId,
        status: "ACTIVE",
        date: { lt: ukTodayMidnight },
      },
      select: { id: true, date: true, clockIn: true },
    });

    if (missedEntries.length > 0) {
      // Update each entry individually because each one's clockOut depends on
      // its own date (its own UK day boundary).
      for (const entry of missedEntries) {
        const entryUkMidnight = getUKDate(entry.date);
        const endOfEntryUkDay = getUKEndOfDay(entryUkMidnight);
        // Guard: never set clockOut earlier than clockIn
        const safeClockOut = endOfEntryUkDay.getTime() > entry.clockIn.getTime()
          ? endOfEntryUkDay
          : new Date(entry.clockIn.getTime() + 1000); // +1s minimum
        const totalHours =
          Math.round(((safeClockOut.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60)) * 100) / 100;

        await db.timeEntry.update({
          where: { id: entry.id },
          data: {
            clockOut: safeClockOut,
            clockOutMethod: "AUTO_MISSED",
            status: "COMPLETED",
            totalHours,
          },
        });
        missedEntriesClosed++;
      }
    }

    // ── Idempotency: check for an existing ACTIVE entry for today (UK date) ──
    const existingToday = await db.timeEntry.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        date: { gte: ukTodayMidnight, lt: ukTomorrowMidnight },
      },
      select: { id: true, clockIn: true, status: true, source: true, agentSessionId: true },
    });

    if (existingToday) {
      return NextResponse.json({
        success: true,
        timeEntry: {
          id: existingToday.id,
          clockIn: existingToday.clockIn.toISOString(),
          status: existingToday.status,
          source: existingToday.source,
          agentSessionId: existingToday.agentSessionId,
        },
        alreadyClockedIn: true,
        missedEntriesClosed,
      });
    }

    // ── Create a new TimeEntry for today ──
    // date is set to UK midnight so all entries on the same UK day group together.
    const entry = await db.timeEntry.create({
      data: {
        userId,
        status: "ACTIVE",
        clockIn: now,
        date: ukTodayMidnight,
        source: "AGENT_OTP",
        agentSessionId: payload.jti,
        clockInMethod: "OTP",
      },
      select: { id: true, clockIn: true, status: true, source: true, agentSessionId: true },
    });

    return NextResponse.json({
      success: true,
      timeEntry: {
        id: entry.id,
        clockIn: entry.clockIn.toISOString(),
        status: entry.status,
        source: entry.source,
        agentSessionId: entry.agentSessionId,
      },
      alreadyClockedIn: false,
      missedEntriesClosed,
    });
  } catch (error) {
    console.error("[agent/attendance/start] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
