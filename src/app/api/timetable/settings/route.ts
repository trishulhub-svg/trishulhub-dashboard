import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/timetable/settings — Get timetable settings for the logged-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await db.timetableSettings.findUnique({
      where: { userId: session.user.id },
    });

    // Return defaults if not set
    if (!settings) {
      return NextResponse.json({
        sleepHours: 8,
        workSplitPercent: 60,
        weekStartsOn: "MONDAY",
      });
    }

    return NextResponse.json(settings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/settings] GET error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

// POST /api/timetable/settings — Create timetable settings
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

    const { sleepHours, workSplitPercent, weekStartsOn } = body;

    const settings = await db.timetableSettings.create({
      data: {
        userId: session.user.id,
        sleepHours: typeof sleepHours === "number" ? sleepHours : 8,
        workSplitPercent: typeof workSplitPercent === "number" ? workSplitPercent : 60,
        weekStartsOn: (weekStartsOn as string) || "MONDAY",
      },
    });

    return NextResponse.json(settings, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/settings] POST error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

// PUT /api/timetable/settings — Update timetable settings
export async function PUT(req: NextRequest) {
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

    const { sleepHours, workSplitPercent, weekStartsOn } = body;
    const updateData: Record<string, unknown> = {};

    if (sleepHours !== undefined) updateData.sleepHours = sleepHours;
    if (workSplitPercent !== undefined) updateData.workSplitPercent = workSplitPercent;
    if (weekStartsOn !== undefined) updateData.weekStartsOn = weekStartsOn;

    const settings = await db.timetableSettings.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        sleepHours: typeof sleepHours === "number" ? sleepHours : 8,
        workSplitPercent: typeof workSplitPercent === "number" ? workSplitPercent : 60,
        weekStartsOn: (weekStartsOn as string) || "MONDAY",
      },
    });

    return NextResponse.json(settings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("[timetable/settings] PUT error:", message);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
