import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "attendance") {
      const records = await db.attendance.findMany({
        include: { user: true },
        orderBy: { date: "desc" },
        take: 30,
      });
      return NextResponse.json(records);
    }

    if (type === "leaves") {
      const leaves = await db.leaveRequest.findMany({
        include: { user: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(leaves);
    }

    // Default: return team members
    const users = await db.user.findMany({
      include: {
        _count: { select: { leaveRequests: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch team data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

    if (type === "leave") {
      const leave = await db.leaveRequest.create({
        data: { startDate: new Date(data.startDate), endDate: new Date(data.endDate), ...data },
      });
      return NextResponse.json(leave, { status: 201 });
    }

    if (type === "attendance") {
      const attendance = await db.attendance.create({
        data: { date: new Date(data.date), ...data },
      });
      return NextResponse.json(attendance, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, ...data } = body;

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (type === "leave") {
      const leave = await db.leaveRequest.update({ where: { id }, data });
      return NextResponse.json(leave);
    }

    if (type === "attendance") {
      const attendance = await db.attendance.update({ where: { id }, data });
      return NextResponse.json(attendance);
    }

    // Update user
    const user = await db.user.update({ where: { id }, data });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update record" }, { status: 500 });
  }
}
