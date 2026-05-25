import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET — Users see their own credentials, SUPER_ADMIN sees all
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      // Admins can see all credentials with user info
      const { searchParams } = new URL(req.url);
      const targetUserId = searchParams.get("userId");

      if (targetUserId) {
        // Get credentials for a specific user
        const credentials = await db.userCredential.findMany({
          where: { userId: targetUserId },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(JSON.parse(JSON.stringify(credentials)));
      }

      // Get all credentials grouped
      const credentials = await db.userCredential.findMany({
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(JSON.parse(JSON.stringify(credentials)));
    }

    // Regular users — only their own credentials (no password field initially masked)
    const credentials = await db.userCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(JSON.parse(JSON.stringify(credentials)));
  } catch (error) {
    console.error("Credentials GET error:", error);
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// POST — Only SUPER_ADMIN can create credentials
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, label, username, password, url, notes } = body;

    if (!userId || !label || !username || !password) {
      return NextResponse.json(
        { error: "userId, label, username, and password are required" },
        { status: 400 }
      );
    }

    // Verify the target user exists
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const credential = await db.userCredential.create({
      data: {
        userId,
        label,
        username,
        password,
        url: url || null,
        notes: notes || null,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(credential)), { status: 201 });
  } catch (error) {
    console.error("Credentials POST error:", error);
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 });
  }
}

// PUT — Only SUPER_ADMIN can update credentials
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { id, label, username, password, url, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Credential ID is required" }, { status: 400 });
    }

    const credential = await db.userCredential.update({
      where: { id },
      data: {
        ...(label && { label }),
        ...(username && { username }),
        ...(password && { password }),
        ...(url !== undefined && { url }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(credential)));
  } catch (error) {
    console.error("Credentials PUT error:", error);
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
  }
}

// DELETE — Only SUPER_ADMIN can delete credentials
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Credential ID is required" }, { status: 400 });
    }

    await db.userCredential.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Credentials DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
