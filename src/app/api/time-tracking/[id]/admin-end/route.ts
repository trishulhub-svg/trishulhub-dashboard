import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// ── POST /api/time-tracking/[id]/admin-end ──
// Admin-only: force-end an ACTIVE TimeEntry on behalf of a user who forgot to
// clock out. Sets clockOutMethod = "ADMIN_OVERRIDE", status = "COMPLETED",
// recomputes totalHours. Audit-logged.
//
// Requires: NextAuth session with ADMIN or SUPER_ADMIN role (NOT agent JWT).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = session.user.role;
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const rl = rateLimit(
      `time-tracking-admin-end-${session.user.id}`,
      RATE_LIMITS.crmWrite.limit,
      RATE_LIMITS.crmWrite.windowMs
    );
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { id } = await params;

    const entry = await db.timeEntry.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        clockIn: true,
        clockOut: true,
        totalHours: true,
        source: true,
        agentSessionId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
    }

    if (entry.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Time entry is not active — nothing to end" },
        { status: 400 }
      );
    }

    const now = new Date();
    const diffMs = now.getTime() - entry.clockIn.getTime();
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    const updated = await db.timeEntry.update({
      where: { id },
      data: {
        clockOut: now,
        clockOutMethod: "ADMIN_OVERRIDE",
        status: "COMPLETED",
        totalHours,
      },
      select: { id: true, clockOut: true, totalHours: true },
    });

    // ── Audit log (fire-and-forget) ──
    await logAudit({
      userId: session.user.id,
      userName: session.user.name || session.user.email || "Unknown",
      userRole: session.user.role,
      userDepartment: session.user.department,
      department: "TEAM_WORK",
      page: "time-tracking",
      action: "STATUS_CHANGE",
      entityType: "TimeEntry",
      entityId: id,
      description: `Admin ended active session for ${entry.user?.name || entry.user?.email || "user"} (total: ${totalHours}h)`,
      oldValue: JSON.stringify({ status: "ACTIVE", clockOut: null }),
      newValue: JSON.stringify({ status: "COMPLETED", clockOut: now.toISOString(), totalHours }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      status: "SUCCESS",
      metadata: JSON.stringify({
        targetUserId: entry.userId,
        targetEntryId: id,
        source: entry.source,
        agentSessionId: entry.agentSessionId,
      }),
    }).catch(() => {
      // Audit-log failures must never break the API response.
    });

    return NextResponse.json({
      success: true,
      totalHours,
      timeEntryId: updated.id,
      clockOut: updated.clockOut?.toISOString() || null,
    });
  } catch (error) {
    console.error("[time-tracking/admin-end] POST error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
