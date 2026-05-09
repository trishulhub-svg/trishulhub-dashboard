import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/timetable/personal-tasks — Fetch personal tasks for the logged-in user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);

    const where: Record<string, unknown> = { userId };

    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");

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

    const tasks = await db.personalTimetableTask.findMany({
      where,
      orderBy: [{ startTime: "asc" }, { priority: "desc" }],
    });

    return NextResponse.json(tasks);
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

    const task = await db.personalTimetableTask.create({
      data: {
        userId,
        title: title as string,
        description: (description as string) || null,
        startTime: new Date(startTime as string),
        endTime: new Date(endTime as string),
        date: new Date(date as string),
        priority: (priority as string) || "MEDIUM",
        category: (category as string) || "PERSONAL",
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/personal-tasks] POST error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
