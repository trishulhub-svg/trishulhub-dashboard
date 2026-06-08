import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, ensureTimetableTables } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// GET /api/timetable/settings — Get timetable settings for the logged-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureTimetableTables();

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

    await ensureTimetableTables();

    // W48: Rate limiting for write operations
    const rl = rateLimit(`timetable-settings-${session.user.id}`, 20, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { sleepHours, workSplitPercent, weekStartsOn } = body;

    // W52: Validate input bounds
    const VALID_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
    if (sleepHours !== undefined && (typeof sleepHours !== "number" || !Number.isInteger(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
      return NextResponse.json({ error: "sleepHours must be an integer between 0 and 24" }, { status: 400 });
    }
    if (workSplitPercent !== undefined && (typeof workSplitPercent !== "number" || workSplitPercent < 0 || workSplitPercent > 100)) {
      return NextResponse.json({ error: "workSplitPercent must be between 0 and 100" }, { status: 400 });
    }
    if (weekStartsOn !== undefined && !VALID_DAYS.includes(weekStartsOn as string)) {
      return NextResponse.json({ error: "weekStartsOn must be a valid day name (MONDAY-SUNDAY)" }, { status: 400 });
    }

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

    await ensureTimetableTables();

    // W48: Rate limiting for write operations
    const rl = rateLimit(`timetable-settings-${session.user.id}`, 20, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { sleepHours, workSplitPercent, weekStartsOn } = body;

    // W52: Validate input bounds
    const VALID_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
    if (sleepHours !== undefined && (typeof sleepHours !== "number" || !Number.isInteger(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
      return NextResponse.json({ error: "sleepHours must be an integer between 0 and 24" }, { status: 400 });
    }
    if (workSplitPercent !== undefined && (typeof workSplitPercent !== "number" || workSplitPercent < 0 || workSplitPercent > 100)) {
      return NextResponse.json({ error: "workSplitPercent must be between 0 and 100" }, { status: 400 });
    }
    if (weekStartsOn !== undefined && !VALID_DAYS.includes(weekStartsOn as string)) {
      return NextResponse.json({ error: "weekStartsOn must be a valid day name (MONDAY-SUNDAY)" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

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
