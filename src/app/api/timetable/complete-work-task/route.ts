import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/timetable/complete-work-task — Mark a work task as completed
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { sourceType, taskId } = body;

    if (!sourceType || !taskId) {
      return NextResponse.json(
        { error: "sourceType and taskId are required" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    switch (sourceType) {
      case "AGENT_TASK": {
        const task = await db.scheduledTask.findUnique({ where: { id: taskId as string } });
        if (!task || task.userId !== userId) {
          return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 });
        }
        const updated = await db.scheduledTask.update({
          where: { id: taskId as string },
          data: { status: "COMPLETED", completedAt: new Date(), progress: 100 },
        });
        return NextResponse.json({ success: true, task: updated });
      }

      case "PROJECT_TASK": {
        const task = await db.task.findUnique({ where: { id: taskId as string } });
        if (!task || task.assignedTo !== userId) {
          return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 });
        }
        const updated = await db.task.update({
          where: { id: taskId as string },
          data: { status: "DONE", completedAt: new Date() },
        });
        return NextResponse.json({ success: true, task: updated });
      }

      case "TRAINING": {
        const assignment = await db.trainingAssignment.findUnique({ where: { id: taskId as string } });
        if (!assignment || assignment.assignedTo !== userId) {
          return NextResponse.json({ error: "Assignment not found or unauthorized" }, { status: 404 });
        }
        const updated = await db.trainingAssignment.update({
          where: { id: taskId as string },
          data: { status: "COMPLETED" },
        });
        return NextResponse.json({ success: true, task: updated });
      }

      default:
        return NextResponse.json(
          { error: `Unknown sourceType: ${sourceType}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/complete-work-task] POST error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
