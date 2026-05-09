import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/timetable/work-data — Fetch aggregated work data from multiple sources
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);

    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Build date range
    let start: Date;
    let end: Date;

    if (date) {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else if (startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date("2099-12-31");
    } else if (endDate) {
      start = new Date("2000-01-01");
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      // Default: today
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    }

    const results: Array<Record<string, unknown>> = [];

    // 1. Scheduled Tasks
    const scheduledTasks = await db.scheduledTask.findMany({
      where: {
        userId,
        dueDate: { gte: start, lt: end },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    for (const t of scheduledTasks) {
      results.push({
        id: t.id,
        sourceType: "AGENT_TASK",
        sourceLabel: "Agent Task",
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate.toISOString(),
        agentName: t.agent?.name || "Unknown Agent",
        agentType: t.agent?.type,
      });
    }

    // 2. Project Tasks
    const projectTasks = await db.task.findMany({
      where: {
        assignedTo: userId,
        deadline: { gte: start, lt: end },
        status: { notIn: ["DONE"] },
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { deadline: "asc" },
    });

    for (const t of projectTasks) {
      results.push({
        id: t.id,
        sourceType: "PROJECT_TASK",
        sourceLabel: "Project Task",
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.deadline?.toISOString(),
        projectName: t.project?.name,
      });
    }

    // 3. Training Assignments
    const trainingAssignments = await db.trainingAssignment.findMany({
      where: {
        assignedTo: userId,
        dueDate: { gte: start, lt: end },
        status: { notIn: ["COMPLETED", "PASSED", "FAILED"] },
      },
      include: {
        document: { select: { id: true, topic: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    for (const t of trainingAssignments) {
      results.push({
        id: t.id,
        sourceType: "TRAINING",
        sourceLabel: "Training",
        title: t.document?.topic || "Training Assignment",
        description: `Level: ${t.testLevel}`,
        priority: t.dueDate ? "MEDIUM" : "LOW",
        status: t.status,
        dueDate: t.dueDate?.toISOString(),
      });
    }

    // 4. Meetings (via MeetingAttendee)
    const meetingAttendees = await db.meetingAttendee.findMany({
      where: {
        userId,
        meeting: {
          date: { gte: start, lt: end },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      },
      include: {
        meeting: {
          include: {
            organizer: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    for (const ma of meetingAttendees) {
      const m = ma.meeting;
      results.push({
        id: m.id,
        sourceType: "MEETING",
        sourceLabel: "Meeting",
        title: m.title,
        description: m.description,
        priority: "MEDIUM",
        status: m.status,
        date: m.date.toISOString(),
        startTime: m.startTime,
        endTime: m.endTime,
        meetingType: m.meetingType,
        organizerName: m.organizer?.name,
        projectName: m.project?.name,
      });
    }

    // 5. Leaves
    const leaves = await db.leave.findMany({
      where: {
        userId,
        status: "APPROVED",
        startDate: { lte: end },
        endDate: { gte: start },
      },
      orderBy: { startDate: "asc" },
    });

    for (const l of leaves) {
      results.push({
        id: l.id,
        sourceType: "LEAVE",
        sourceLabel: "Leave",
        title: `${l.leaveType.replace(/_/g, " ")}`,
        description: l.reason,
        priority: "LOW",
        status: l.status,
        startDate: l.startDate.toISOString(),
        endDate: l.endDate.toISOString(),
      });
    }

    // 6. Approvals (where user is requester or approver)
    // BUG #5 FIX: Show ALL pending approvals, not just ones created on selected date
    const approvals = await db.approval.findMany({
      where: {
        AND: [
          {
            OR: [
              { requesterId: userId },
              { approvedById: userId },
            ],
          },
          {
            status: "PENDING",
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20, // Limit to prevent overwhelming the timetable
    });

    for (const a of approvals) {
      results.push({
        id: a.id,
        sourceType: "APPROVAL",
        sourceLabel: "Approval",
        title: a.title,
        description: a.description,
        priority: "HIGH",
        status: a.status,
        type: a.type,
        createdAt: a.createdAt.toISOString(),
        isApprover: a.approvedById === userId,
      });
    }

    // Sort by priority weight then by date
    const priorityWeight: Record<string, number> = {
      URGENT: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };

    results.sort((a, b) => {
      const pwA = priorityWeight[(a.priority as string) || "MEDIUM"] ?? 2;
      const pwB = priorityWeight[(b.priority as string) || "MEDIUM"] ?? 2;
      if (pwA !== pwB) return pwA - pwB;
      const dateA = (a.dueDate || a.date || a.startDate || a.createdAt || "") as string;
      const dateB = (b.dueDate || b.date || b.startDate || b.createdAt || "") as string;
      return dateA.localeCompare(dateB);
    });

    return NextResponse.json(results);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/work-data] GET error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
