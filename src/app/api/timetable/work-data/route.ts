import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// W51: Cap date ranges to 90 days max span
const MAX_DATE_SPAN_MS = 90 * 24 * 60 * 60 * 1000;

// GET /api/timetable/work-data — Fetch aggregated work data from multiple sources
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // W49: Rate limiting for GET
    const rl = rateLimit(`work-data-${userId}`, 30, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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
      // W51: Cap date range to 90 days
      if (end.getTime() - start.getTime() > MAX_DATE_SPAN_MS) {
        end = new Date(start.getTime() + MAX_DATE_SPAN_MS);
      }
    } else if (startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getTime() + MAX_DATE_SPAN_MS);
    } else if (endDate) {
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      start = new Date(end.getTime() - MAX_DATE_SPAN_MS);
      start.setHours(0, 0, 0, 0);
    } else {
      // Default: today
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    }

    // I17: Run all 5 DB queries in parallel using Promise.all
    const [projectTasks, trainingAssignments, meetingAttendees, leaves, approvals] = await Promise.all([
      // 1. Project Tasks
      db.task.findMany({
        where: {
          assignedTo: userId,
          deadline: { gte: start, lt: end },
          status: { notIn: ["DONE"] },
        },
        include: {
          project: { select: { id: true, name: true } },
        },
        orderBy: { deadline: "asc" },
        take: 100, // W51: Cap results
      }),

      // 2. Training Assignments
      db.trainingAssignment.findMany({
        where: {
          assignedTo: userId,
          status: { notIn: ["COMPLETED", "PASSED", "FAILED"] },
          createdAt: { lte: end },
          OR: [
            { dueDate: { gte: start } },
            { dueDate: null },
          ],
        },
        include: {
          document: { select: { id: true, topic: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 100, // W51: Cap results
      }),

      // 3. Meetings (via MeetingAttendee)
      db.meetingAttendee.findMany({
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
        take: 100, // W51: Cap results
      }),

      // 4. Leaves
      db.leave.findMany({
        where: {
          userId,
          status: "APPROVED",
          startDate: { lte: end },
          endDate: { gte: start },
        },
        orderBy: { startDate: "asc" },
        take: 100, // W51: Cap results
      }),

      // 5. Approvals (where user is requester or approver)
      db.approval.findMany({
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
        take: 20,
      }),
    ]);

    const results: Array<Record<string, unknown>> = [];

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
        startDate: t.createdAt.toISOString(),
      });
    }

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
