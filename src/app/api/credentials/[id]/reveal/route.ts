import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log";
import { decryptFromJson } from "@/lib/encryption";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Rate limit: 20 per minute per user
    const rl = rateLimit(`cred-reveal-${session.user.id}`, 20, 60000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const credential = await db.userCredential.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    // Only admin/super_admin/project_manager or the credential owner can reveal.
    // PROJECT_MANAGER has admin-like credential access per requirements.
    const userId = session.user.id;
    const userRole = session.user.role;
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && userRole !== "PROJECT_MANAGER" && credential.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    void logAudit({
      userId,
      userName: session.user.name || "unknown",
      userRole,
      department: "SYSTEM",
      page: "credentials",
      action: "READ",
      entityType: "credential",
      entityId: id,
      description: buildDescription("READ", "credential", "password revealed"),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    });

    // decryptFromJson handles AES JSON envelopes and legacy plaintext values
    const password = decryptFromJson(credential.password || "");
    if (!password) {
      return NextResponse.json({ error: "Failed to decrypt password" }, { status: 500 });
    }
    return NextResponse.json({ password });
  } catch (error: unknown) {
    console.error("[credentials] reveal error:", error);
    return NextResponse.json({ error: "Failed to reveal password" }, { status: 500 });
  }
}