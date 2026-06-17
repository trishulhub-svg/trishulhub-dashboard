// TODO: Implement AES-256-GCM encryption at rest for passwords (similar to task-git-config token encryption)
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log";

// ── Zod Schemas ──
const createCredentialSchema = z.object({
  userId: z.string().min(1),
  label: z.string().min(1).max(100),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  url: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().max(500).optional().nullable()
  ),
  notes: z.string().max(2000).optional().nullable(),
});

const updateCredentialSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(500).optional(),
  url: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().max(500).optional().nullable()
  ),
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

// TODO: Use DOMPurify for proper XSS sanitization
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
          take: 100,
        });
        const masked = credentials.map((c) => ({ ...c, password: maskPassword(c.password) }));
        return NextResponse.json(masked);
      }

      // Get all credentials grouped (paginated)
      const page = parseInt(searchParams.get("page") || "1", 10);
      const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
      const skip = (page - 1) * limit;

      const [credentials, total] = await Promise.all([
        db.userCredential.findMany({
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip,
        }),
        db.userCredential.count(),
      ]);
      const masked = credentials.map((c) => ({ ...c, password: maskPassword(c.password) }));
      return NextResponse.json({ data: masked, total, page, limit });
    }

    // Regular users — only their own credentials
    const credentials = await db.userCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const masked = credentials.map((c) => ({ ...c, password: maskPassword(c.password) }));
    return NextResponse.json(masked);
  } catch (error: unknown) {
    console.error("[credentials] GET error:", error);
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

    if (process.env.NODE_ENV !== "production") {
      console.log("[credentials] CREATE by userId:", session.user.id, "credentialId:", credential.id);
    }
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "SYSTEM", page: "credentials", action: "CREATE",
      entityType: "credential", entityId: credential.id,
      description: buildDescription("CREATE", "credential", credential.label),
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    const { password: _pwd, ...safe } = credential;
    return NextResponse.json(safe, { status: 201 });
  } catch (error: unknown) {
    console.error("[credentials] POST error:", error);
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

    // Atomic read-then-write
    const credential = await db.$transaction(async (tx) => {
      const existing = await tx.userCredential.findUnique({ where: { id } });
      if (!existing) throw new Error("NOT_FOUND");
      if (session.user.role !== "SUPER_ADMIN" && existing.userId !== session.user.id) throw new Error("FORBIDDEN");
      return tx.userCredential.update({
        where: { id },
        data: {
          ...(label !== undefined && { label: sanitizeStr(label, 100) }),
          ...(username !== undefined && { username: sanitizeStr(username, 200) }),
          ...(password !== undefined && { password }),
          ...(url !== undefined && { url }),
          ...(notes !== undefined && { notes }),
        },
      });
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[credentials] UPDATE by userId:", session.user.id, "credentialId:", credential.id);
    }
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "SYSTEM", page: "credentials", action: "UPDATE",
      entityType: "credential", entityId: credential.id,
      description: buildDescription("UPDATE", "credential", credential.label),
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    const { password: _pwd, ...safe } = credential;
    return NextResponse.json(safe);
  } catch (error: unknown) {
    console.error("[credentials] PUT error:", error);
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden — Cannot update other users' credentials" }, { status: 403 });
    }
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

    // Atomic read-then-delete
    await db.$transaction(async (tx) => {
      const existing = await tx.userCredential.findUnique({ where: { id } });
      if (!existing) throw new Error("NOT_FOUND");
      if (session.user.role !== "SUPER_ADMIN" && existing.userId !== session.user.id) throw new Error("FORBIDDEN");
      if (process.env.NODE_ENV !== "production") {
        console.log("[credentials] DELETE by userId:", session.user.id, "credentialId:", id);
      }
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "SYSTEM", page: "credentials", action: "DELETE",
        entityType: "credential", entityId: id,
        description: buildDescription("DELETE", "credential", id),
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
      await tx.userCredential.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[credentials] DELETE error:", error);
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden — Cannot delete other users' credentials" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
