import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/rbac";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// POST /api/timetable/complete-work-task — Mark a work task as completed
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // W31: Rate limiting
    const rl = rateLimit(`complete-task-${session.user.id}`, 30, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
    const userRole = session.user.role;

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
        if (!task) {
          return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Idempotent: if already DONE, return success
        if (task.status === "DONE") {
          return NextResponse.json({ success: true, task });
        }

        // C12: Approval workflow — check current status
        if (task.status === "AWAITING_APPROVAL") {
          // Approval case: only admin/superadmin can approve (not necessarily the assignee)
          if (!isAdmin(userRole)) {
            return NextResponse.json({ error: "Forbidden: Only admin or superadmin can approve tasks" }, { status: 403 });
          }
          // Self-approval prevention: ADMIN cannot approve tasks assigned to themselves
          if (userRole === "ADMIN" && task.assignedTo === userId) {
            return NextResponse.json({ error: "Forbidden: You cannot approve your own task" }, { status: 403 });
          }
          const updated = await db.task.update({
            where: { id: taskId as string },
            data: {
              status: "DONE",
              completedAt: new Date(),
              approvedBy: userId,
              approvedAt: new Date(),
            },
          });
          return NextResponse.json({ success: true, task: updated });
        }

        // Submit for completion: must be the assignee
        if (task.assignedTo !== userId) {
          return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 });
        }

        // SUPER_ADMIN can directly mark as DONE; others go to AWAITING_APPROVAL
        const updateData: Record<string, any> = {};
        if (userRole === "SUPER_ADMIN") {
          updateData.status = "DONE";
          updateData.completedAt = new Date();
          updateData.approvedBy = userId;
          updateData.approvedAt = new Date();
        } else {
          updateData.status = "AWAITING_APPROVAL";
        }

        const updated = await db.task.update({
          where: { id: taskId as string },
          data: updateData,
        });

        // Notify admins about the approval request
        if (updateData.status === "AWAITING_APPROVAL") {
          try {
            const admins = await db.user.findMany({
              where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
              select: { id: true, name: true },
            });
            if (admins.length > 0) {
              await db.notification.createMany({
                data: admins.map(admin => ({
                  userId: admin.id,
                  title: `Task approval needed: ${task.title}`,
                  message: `Task "${task.title}" submitted for review`,
                  type: "TASK",
                  link: `/dashboard/todos`,
                  isRead: false,
                })),
              });
            }
          } catch (err) {
            console.error("[complete-work-task] Failed to send notification:", err);
          }
        }

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

      // BUG #2 FIX: Handle MEETING completion
      case "MEETING": {
        const meeting = await db.meeting.findUnique({ where: { id: taskId as string } });
        if (!meeting) {
          return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }
        // Only organizer can mark meeting as completed
        if (meeting.organizerId !== userId) {
          return NextResponse.json({ error: "Only the organizer can mark a meeting as completed" }, { status: 403 });
        }
        const updated = await db.meeting.update({
          where: { id: taskId as string },
          data: { status: "COMPLETED" },
        });
        return NextResponse.json({ success: true, task: updated });
      }

      // BUG #2 FIX: Handle LEAVE — mark as CANCELLED (user cancels their own leave)
      case "LEAVE": {
        const leave = await db.leave.findUnique({ where: { id: taskId as string } });
        if (!leave || leave.userId !== userId) {
          return NextResponse.json({ error: "Leave not found or unauthorized" }, { status: 404 });
        }
        const updated = await db.leave.update({
          where: { id: taskId as string },
          data: { status: "CANCELLED" },
        });
        return NextResponse.json({ success: true, task: updated });
      }

      // BUG #2 FIX: Handle APPROVAL — mark as APPROVED if user is the approver
      case "APPROVAL": {
        const approval = await db.approval.findUnique({ where: { id: taskId as string } });
        if (!approval) {
          return NextResponse.json({ error: "Approval not found" }, { status: 404 });
        }
        if (approval.approvedById !== userId) {
          return NextResponse.json({ error: "Only the assigned approver can complete this" }, { status: 403 });
        }
        const updated = await db.approval.update({
          where: { id: taskId as string },
          data: { status: "APPROVED", approvedById: userId, updatedAt: new Date() },
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
