import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, ensureTimetableTables } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// W7: Valid enum values for personal tasks (from schema comments)
// W56: TODO: Extract to shared constants file
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const VALID_CATEGORIES = ["PERSONAL", "HEALTH", "FINANCE", "STUDY", "SOCIAL", "OTHER", "WORK_LOCAL"];

// PATCH /api/timetable/personal-tasks/[id] — Update a personal task
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureTimetableTables();

    // W32: Rate limiting for write operations
    const rl = rateLimit(`personal-task-update-${session.user.id}`, 30, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const userId = session.user.id;
    const { id } = await params;

    const existing = await db.personalTimetableTask.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { title, description, startTime, endTime, priority, status, category } = body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;

    // W8: Validate date fields
    if (startTime !== undefined) {
      const parsed = new Date(startTime as string);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid startTime" }, { status: 400 });
      }
      updateData.startTime = parsed;
    }
    if (endTime !== undefined) {
      const parsed = new Date(endTime as string);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid endTime" }, { status: 400 });
      }
      updateData.endTime = parsed;
    }

    // W7: Validate priority
    if (priority !== undefined) {
      const p = String(priority);
      if (!VALID_PRIORITIES.includes(p)) {
        return NextResponse.json(
          { error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.priority = p;
    }

    // W7: Validate category
    if (category !== undefined) {
      const c = String(category);
      if (!VALID_CATEGORIES.includes(c)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.category = c;
    }

    // W7: Validate status
    if (status !== undefined) {
      const s = String(status);
      if (!VALID_STATUSES.includes(s)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = s;
      if (s === "COMPLETED") {
        updateData.completedAt = new Date();
      } else {
        updateData.completedAt = null;
      }
    }

    const task = await db.personalTimetableTask.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/personal-tasks] PATCH error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

// DELETE /api/timetable/personal-tasks/[id] — Delete a personal task
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureTimetableTables();

    // W32: Rate limiting for write operations
    const rl = rateLimit(`personal-task-update-${session.user.id}`, 30, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const userId = session.user.id;
    const { id } = await params;

    const existing = await db.personalTimetableTask.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.personalTimetableTask.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/personal-tasks] DELETE error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
