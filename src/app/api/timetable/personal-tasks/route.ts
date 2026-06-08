import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, ensureTimetableTables } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// W7: Valid enum values for personal tasks (from schema comments)
// W56: TODO: Extract to shared constants file
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const VALID_CATEGORIES = ["PERSONAL", "HEALTH", "FINANCE", "STUDY", "SOCIAL", "OTHER", "WORK_LOCAL"];

// W57: TODO: Create createPersonalTaskSchema in validations.ts

// GET /api/timetable/personal-tasks — Fetch personal tasks for the logged-in user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureTimetableTables();

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);

    const where: Prisma.PersonalTimetableTaskWhereInput = { userId };

    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");

    // W50: Pagination support
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const limit = Math.max(Number(searchParams.get("limit")) || 100, 1);
    const skip = (page - 1) * limit;

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(d.getDate() + 1);
      where.date = { gte: d, lt: nextDay };
    } else if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      where.date = { gte: new Date(startDate) };
    } else if (endDate) {
      where.date = { lte: new Date(endDate) };
    }

    if (status) {
      where.status = status;
    }

    const [tasks, total] = await Promise.all([
      db.personalTimetableTask.findMany({
        where,
        orderBy: [{ startTime: "asc" }, { priority: "desc" }],
        take: limit,
        skip,
      }),
      db.personalTimetableTask.count({ where }),
    ]);

    return NextResponse.json({
      data: tasks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/personal-tasks] GET error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

// POST /api/timetable/personal-tasks — Create a new personal task
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureTimetableTables();

    // W32: Rate limiting for write operations
    const rl = rateLimit(`personal-task-create-${session.user.id}`, 20, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const userId = session.user.id;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { title, description, startTime, endTime, date, priority, category } = body;

    if (!title || !startTime || !endTime || !date) {
      return NextResponse.json(
        { error: "Title, startTime, endTime, and date are required" },
        { status: 400 }
      );
    }

    // C25: Validate title and description length bounds
    if (typeof title !== "string" || title.trim().length < 1 || title.length > 500) {
      return NextResponse.json({ error: "Title must be 1-500 characters" }, { status: 400 });
    }
    if (description !== undefined && typeof description === "string" && description.length > 5000) {
      return NextResponse.json({ error: "Description must be at most 5000 characters" }, { status: 400 });
    }

    // W8: Validate date fields
    const parsedStartTime = new Date(startTime as string);
    const parsedEndTime = new Date(endTime as string);
    const parsedDate = new Date(date as string);

    if (isNaN(parsedStartTime.getTime())) {
      return NextResponse.json({ error: "Invalid startTime" }, { status: 400 });
    }
    if (isNaN(parsedEndTime.getTime())) {
      return NextResponse.json({ error: "Invalid endTime" }, { status: 400 });
    }
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // W7: Validate priority
    const taskPriority = priority ? String(priority) : "MEDIUM";
    if (!VALID_PRIORITIES.includes(taskPriority)) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }

    // W7: Validate category
    const taskCategory = category ? String(category) : "PERSONAL";
    if (!VALID_CATEGORIES.includes(taskCategory)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const task = await db.personalTimetableTask.create({
      data: {
        userId,
        title: title as string,
        description: (description as string) || null,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        date: parsedDate,
        priority: taskPriority,
        category: taskCategory,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/personal-tasks] POST error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
