import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, getAppSetting } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log";
import { encryptCredentialToJson } from "@/lib/encryption";

// ── Zod Schemas ──
function normalizeOptionalUrl(v: unknown): string | null | undefined {
  if (v === "" || v === null || v === undefined) return null
  if (typeof v !== "string") return undefined
  const trimmed = v.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const optionalUrl = z.preprocess(
  normalizeOptionalUrl,
  z.union([z.string().url().max(500), z.null()]).optional()
)

const createCredentialSchema = z.object({
  userId: z.string().min(1),
  label: z.string().min(1).max(100),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  url: optionalUrl,
  notes: z.string().max(2000).optional().nullable(),
});

const updateCredentialSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(500).optional(),
  url: optionalUrl,
  notes: z.string().max(2000).optional().nullable(),
});

async function loadCredDbKey(): Promise<string> {
  try {
    return await getAppSetting("credentialEncryptionKey")
  } catch {
    return ""
  }
}

async function encryptAccessHubPassword(password: string): Promise<string> {
  const dbKey = await loadCredDbKey()
  // Prefer AppSetting credentialEncryptionKey (same as project credentials).
  // Falls back to CREDENTIAL_ENCRYPTION_KEY / ENCRYPTION_KEY env via getCredentialKey.
  return encryptCredentialToJson(password, dbKey || undefined)
}

// SUPER_ADMIN / ADMIN / PROJECT_MANAGER can manage Access Hub credentials for any user
async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "PROJECT_MANAGER") {
    return { error: NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

function maskPassword(): string {
  return "••••••••";
}

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

    const rl = rateLimit(`credentials-get:${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "PROJECT_MANAGER") {
      const { searchParams } = new URL(req.url);
      const targetUserId = searchParams.get("userId");

      if (targetUserId) {
        const credentials = await db.userCredential.findMany({
          where: { userId: targetUserId },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        const masked = credentials.map(({ password: _p, ...c }) => ({ ...c, password: maskPassword(), hasPassword: true }));
        return NextResponse.json(masked);
      }

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
      const masked = credentials.map(({ password: _p, ...c }) => ({ ...c, password: maskPassword(), hasPassword: true }));
      return NextResponse.json({ data: masked, total, page, limit });
    }

    const credentials = await db.userCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const masked = credentials.map(({ password: _p, ...c }) => ({ ...c, password: maskPassword(), hasPassword: true }));
    return NextResponse.json(masked);
  } catch (error: unknown) {
    console.error("[credentials] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// POST — ADMIN / SUPER_ADMIN / PROJECT_MANAGER can create for any team member
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
    const session = auth.session!;

    const rl = rateLimit(`credentials-create:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = createCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, label, username, password, url, notes } = parsed.data;

    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let encryptedPassword: string
    try {
      encryptedPassword = await encryptAccessHubPassword(password)
    } catch (encErr) {
      console.error("[credentials] encrypt error:", encErr instanceof Error ? encErr.message : encErr)
      return NextResponse.json(
        { error: "Encryption key not configured — set credentialEncryptionKey in Access Hub / App settings" },
        { status: 500 }
      )
    }

    const credential = await db.userCredential.create({
      data: {
        userId,
        label: sanitizeStr(label, 100),
        username: sanitizeStr(username, 200),
        password: encryptedPassword,
        url: url || null,
        notes: notes || null,
        createdBy: session.user.id,
      },
    });

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
    const msg = error instanceof Error ? error.message : ""
    if (msg.includes("encryption") || msg.includes("ENCRYPTION") || msg.includes("credential encryption")) {
      return NextResponse.json(
        { error: "Encryption key not configured — set credentialEncryptionKey in Access Hub / App settings" },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 });
  }
}

// PUT — ADMIN / SUPER_ADMIN / PROJECT_MANAGER can update any credential
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
    const session = auth.session!;

    const rl = rateLimit(`credentials-update:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updateCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, label, username, password, url, notes } = parsed.data;

    let encryptedPassword: string | undefined
    if (password !== undefined) {
      try {
        encryptedPassword = await encryptAccessHubPassword(password)
      } catch (encErr) {
        console.error("[credentials] encrypt error:", encErr instanceof Error ? encErr.message : encErr)
        return NextResponse.json(
          { error: "Encryption key not configured — set credentialEncryptionKey in Access Hub / App settings" },
          { status: 500 }
        )
      }
    }

    const credential = await db.$transaction(async (tx) => {
      const existing = await tx.userCredential.findUnique({ where: { id } });
      if (!existing) throw new Error("NOT_FOUND");
      return tx.userCredential.update({
        where: { id },
        data: {
          ...(label !== undefined && { label: sanitizeStr(label, 100) }),
          ...(username !== undefined && { username: sanitizeStr(username, 200) }),
          ...(encryptedPassword !== undefined && { password: encryptedPassword }),
          ...(url !== undefined && { url }),
          ...(notes !== undefined && { notes }),
        },
      });
    });

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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
  }
}

// DELETE — ADMIN / SUPER_ADMIN / PROJECT_MANAGER can delete any credential
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
    const session = auth.session!;

    const rl = rateLimit(`credentials-delete:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Credential ID is required" }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      const existing = await tx.userCredential.findUnique({ where: { id } });
      if (!existing) throw new Error("NOT_FOUND");
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
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
