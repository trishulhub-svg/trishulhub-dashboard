// TODO: Implement encryption at rest for credential passwords using AES-256-GCM with server-side key
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// ── Zod Schemas ──
const createCredentialSchema = z.object({
  userId: z.string().min(1),
  label: z.string().min(1).max(100),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  url: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateCredentialSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(500).optional(),
  url: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Auth Helper ──
async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

// ── Password Masking ──
function maskPassword(password: string | null | undefined): string {
  if (!password) return "****";
  return "****" + String(password).slice(-4);
}

// ── Input Sanitization ──
function sanitizeStr(value: string, maxLen: number): string {
  return value.slice(0, maxLen);
}

// GET — Users see their own credentials, ADMIN or above sees all
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting
    const rl = rateLimit(`credentials-get:${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
        const masked = JSON.parse(JSON.stringify(credentials)).map((cred: Record<string, unknown>) => ({
          ...cred,
          password: maskPassword(cred.password as string),
        }));
        return NextResponse.json(masked);
      }

      // Get all credentials grouped
      const credentials = await db.userCredential.findMany({
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
      });
      const masked = JSON.parse(JSON.stringify(credentials)).map((cred: Record<string, unknown>) => ({
        ...cred,
        password: maskPassword(cred.password as string),
      }));
      return NextResponse.json(masked);
    }

    // Regular users — only their own credentials
    const credentials = await db.userCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const masked = JSON.parse(JSON.stringify(credentials)).map((cred: Record<string, unknown>) => ({
      ...cred,
      password: maskPassword(cred.password as string),
    }));
    return NextResponse.json(masked);
  } catch (error) {
    console.error("Credentials GET error:", error);
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// POST — Only ADMIN or above can create credentials
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
    const session = auth.session!;

    // Rate limiting
    const rl = rateLimit(`credentials-create:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Parse JSON with error handling
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Zod validation
    const parsed = createCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, label, username, password, url, notes } = parsed.data;

    // Verify the target user exists
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Ownership check: ADMIN can only create for themselves
    if (session.user.role === "ADMIN" && userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden — Cannot create credentials for other users" }, { status: 403 });
    }

    const credential = await db.userCredential.create({
      data: {
        userId,
        label: sanitizeStr(label, 100),
        username: sanitizeStr(username, 200),
        password,
        url: url || null,
        notes: notes || null,
        createdBy: session.user.id,
      },
    });

    console.log("[credentials] CREATE by userId:", session.user.id, "credentialId:", credential.id);
    return NextResponse.json(JSON.parse(JSON.stringify(credential)), { status: 201 });
  } catch (error) {
    console.error("Credentials POST error:", error);
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 });
  }
}

// PUT — Only ADMIN or above can update credentials; ADMIN can only update their own
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
    const session = auth.session!;

    // Rate limiting
    const rl = rateLimit(`credentials-update:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Parse JSON with error handling
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Zod validation
    const parsed = updateCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, label, username, password, url, notes } = parsed.data;

    // Check credential exists before updating
    const existing = await db.userCredential.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    // Ownership check: ADMIN can only update their own credentials
    if (session.user.role === "ADMIN" && existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden — Cannot update other users' credentials" }, { status: 403 });
    }

    const credential = await db.userCredential.update({
      where: { id },
      data: {
        ...(label !== undefined && { label: sanitizeStr(label, 100) }),
        ...(username !== undefined && { username: sanitizeStr(username, 200) }),
        ...(password !== undefined && { password }),
        ...(url !== undefined && { url }),
        ...(notes !== undefined && { notes }),
      },
    });

    console.log("[credentials] UPDATE by userId:", session.user.id, "credentialId:", credential.id);
    return NextResponse.json(JSON.parse(JSON.stringify(credential)));
  } catch (error) {
    console.error("Credentials PUT error:", error);
    // Handle Prisma P2025 specifically (record not found)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
  }
}

// DELETE — Only ADMIN or above can delete credentials; ADMIN can only delete their own
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
    const session = auth.session!;

    // Rate limiting
    const rl = rateLimit(`credentials-delete:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Credential ID is required" }, { status: 400 });
    }

    // Check credential exists and verify ownership
    const existing = await db.userCredential.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    // Ownership check: ADMIN can only delete their own credentials
    if (session.user.role === "ADMIN" && existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden — Cannot delete other users' credentials" }, { status: 403 });
    }

    console.log("[credentials] DELETE by userId:", session.user.id, "credentialId:", id);

    await db.userCredential.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Credentials DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
