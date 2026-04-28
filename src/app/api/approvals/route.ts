import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Get items waiting for approval (tasks with status REVIEW, leads with AI_FOUND source, etc.)
export async function GET() {
  try {
    // Get tasks in REVIEW status
    const reviewTasks = await db.task.findMany({
      where: { status: "REVIEW", assigneeType: "AI" },
      include: { project: true },
    });

    // Get conversations that might need approval
    const conversations = await db.agentConversation.findMany({
      where: { status: "ACTIVE" },
      include: { agent: true },
      take: 20,
      orderBy: { updatedAt: "desc" },
    });

    const approvals = [
      ...reviewTasks.map((t) => ({
        id: t.id,
        type: "TASK_REVIEW" as const,
        agentName: t.agent?.name || "Unknown Agent",
        title: t.title,
        description: t.description || "",
        output: t.description || "Task completed, awaiting review",
        createdAt: t.updatedAt,
        projectId: t.projectId,
        projectName: t.project.name,
      })),
    ];

    return NextResponse.json(approvals);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, reason } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }

    if (action === "approve") {
      const task = await db.task.update({
        where: { id },
        data: { status: "DONE", completedAt: new Date() },
      });
      return NextResponse.json({ success: true, task });
    }

    if (action === "reject") {
      const task = await db.task.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
      });
      return NextResponse.json({ success: true, task, reason });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process approval" }, { status: 500 });
  }
}
