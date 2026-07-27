import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isDueOnOrBefore, syncProjectProgressFromMilestones } from "@/lib/milestones";
import { nextUkDateKey, todayDateKey } from "@/lib/milestone-due";

type MilestoneAction = "complete" | "carry" | "leave";

function parseMilestoneAction(value: unknown): MilestoneAction {
  return value === "complete" || value === "carry" || value === "leave" ? value : "complete";
}

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
    let body: Record<string, unknown> = {};
    try {
      const json = await req.json().catch(() => ({}));
      if (json && typeof json === "object") body = json as Record<string, unknown>;
    } catch {
      /* empty body is fine */
    }
    const milestoneAction = parseMilestoneAction(body.milestoneAction);

    const entry = await db.timeEntry.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        clockIn: true,
        clockOut: true,
        totalHours: true,
        projectId: true,
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
    const today = todayDateKey(now);
    const nextDueDate = new Date(`${nextUkDateKey(today)}T00:00:00.000Z`);
    let milestoneIds: string[] = [];
    let carriedForwardCount = 0;
    let completedMilestoneCount = 0;

    const updated = await db.$transaction(async (tx) => {
      if (entry.projectId && milestoneAction !== "leave") {
        const openMilestones = await tx.projectMilestone.findMany({
          where: {
            projectId: entry.projectId,
            done: false,
            dueDate: { not: null },
            assignees: { some: { userId: entry.userId } },
          },
          select: { id: true, dueDate: true, carriedForward: true },
        });
        const dueOpen = openMilestones.filter(
          (m) => m.dueDate && isDueOnOrBefore(m.dueDate, today)
        );
        milestoneIds = dueOpen.map((m) => m.id);

        if (milestoneIds.length > 0 && milestoneAction === "complete") {
          await tx.projectMilestone.updateMany({
            where: { id: { in: milestoneIds }, done: false },
            data: {
              done: true,
              completedAt: now,
              completedBy: session.user.id,
            },
          });
          completedMilestoneCount = milestoneIds.length;
        } else if (milestoneAction === "carry") {
          // Carry once only — already-carried milestones stay open until completed
          const carryIds = dueOpen.filter((m) => !m.carriedForward).map((m) => m.id);
          milestoneIds = carryIds;
          if (carryIds.length > 0) {
            await tx.projectMilestone.updateMany({
              where: { id: { in: carryIds }, done: false, carriedForward: false },
              data: {
                dueDate: nextDueDate,
                carriedForward: true,
              },
            });
            carriedForwardCount = carryIds.length;
          }
        }
      }

      return tx.timeEntry.update({
        where: { id },
        data: {
          clockOut: now,
          clockOutMethod: "ADMIN_OVERRIDE",
          status: "COMPLETED",
          totalHours,
        },
        select: { id: true, clockOut: true, totalHours: true },
      });
    });

    if (entry.projectId && completedMilestoneCount > 0) {
      await syncProjectProgressFromMilestones(entry.projectId).catch((err) =>
        console.warn(
          "[time-tracking/admin-end] progress sync failed:",
          err instanceof Error ? err.message : err
        )
      );
    }

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
        milestoneAction,
        milestoneIds,
        completedMilestoneCount,
        carriedForwardCount,
      }),
    }).catch(() => {
      // Audit-log failures must never break the API response.
    });

    return NextResponse.json({
      success: true,
      totalHours,
      timeEntryId: updated.id,
      clockOut: updated.clockOut?.toISOString() || null,
      milestoneAction,
      completedMilestoneCount,
      carriedForwardCount,
    });
  } catch (error) {
    console.error("[time-tracking/admin-end] POST error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
