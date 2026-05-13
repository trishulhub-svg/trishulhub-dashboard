import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";

let tablesEnsured = false;

// Self-healing: create protocol tables if they don't exist in Turso.
// These tables were added to schema.prisma but never pushed to remote DB.
async function ensureProtocolTables() {
  if (tablesEnsured) return;
  tablesEnsured = true;
  try {
    await db.protocolVersion.count({ take: 1 });
  } catch {
    console.log("[protocol] ProtocolVersion table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProtocolVersion" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "version" TEXT NOT NULL,
          "title" TEXT NOT NULL DEFAULT 'Trishul Protocol',
          "content" TEXT NOT NULL DEFAULT '',
          "stageDescriptions" TEXT NOT NULL DEFAULT '[]',
          "agentSkills" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProtocolVersion_version_key" UNIQUE ("version")
        )
      `);
      console.log("[protocol] ProtocolVersion table created.");
    } catch (err: any) {
      console.error("[protocol] Failed to create ProtocolVersion:", err?.message);
    }
  }
  try {
    await (db as any).protocolInvite.count({ take: 1 });
  } catch {
    console.log("[protocol] ProtocolInvite table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProtocolInvite" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "inviteCode" TEXT NOT NULL,
          "targetEmail" TEXT NOT NULL,
          "targetName" TEXT,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "expiresAt" DATETIME NOT NULL,
          "usedAt" DATETIME,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "createdBy" TEXT NOT NULL,
          "protocolVersionId" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[protocol] ProtocolInvite table created.");
    } catch (err: any) {
      console.error("[protocol] Failed to create ProtocolInvite:", err?.message);
    }
  }
  try {
    await (db as any).protocolAccessLog.count({ take: 1 });
  } catch {
    console.log("[protocol] ProtocolAccessLog table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProtocolAccessLog" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "ipAddress" TEXT,
          "userAgent" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[protocol] ProtocolAccessLog table created.");
    } catch (err: any) {
      console.error("[protocol] Failed to create ProtocolAccessLog:", err?.message);
    }
  }
  try {
    await (db as any).userProtocolAccess.count({ take: 1 });
  } catch {
    console.log("[protocol] UserProtocolAccess table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserProtocolAccess" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "userName" TEXT,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "verifiedVia" TEXT NOT NULL DEFAULT 'invite',
          "inviteId" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UserProtocolAccess_userId_key" UNIQUE ("userId")
        )
      `);
      console.log("[protocol] UserProtocolAccess table created.");
    } catch (err: any) {
      console.error("[protocol] Failed to create UserProtocolAccess:", err?.message);
    }
  }
}

// GET — list protocol versions (SUPER_ADMIN only)
export async function GET(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    const where = activeOnly ? { isActive: true } : {};
    const versions = await db.protocolVersion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { invites: true, accessLogs: true } },
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(versions)));
  } catch (error: any) {
    console.error("[protocol] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create new protocol version (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { version, title, content, stageDescriptions, agentSkills } = body;

    if (!version || typeof version !== "string") {
      return NextResponse.json({ error: "Version is required" }, { status: 400 });
    }

    const existing = await db.protocolVersion.findUnique({ where: { version } });
    if (existing) {
      return NextResponse.json({ error: "Version already exists" }, { status: 409 });
    }

    const protocol = await db.protocolVersion.create({
      data: {
        version,
        title: title || "Trishul Protocol",
        content: content || "",
        stageDescriptions: typeof stageDescriptions === "string" ? stageDescriptions : JSON.stringify(stageDescriptions || []),
        agentSkills: typeof agentSkills === "string" ? agentSkills : JSON.stringify(agentSkills || []),
        isActive: true,
        createdBy: token.id as string,
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(protocol)), { status: 201 });
  } catch (error: any) {
    console.error("[protocol] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — update existing protocol version (SUPER_ADMIN only)
export async function PUT(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, version, title, content, stageDescriptions, agentSkills, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: "Protocol ID is required" }, { status: 400 });
    }

    const existing = await db.protocolVersion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Protocol not found" }, { status: 404 });
    }

    // If version is being changed, check uniqueness
    if (version && version !== existing.version) {
      const dup = await db.protocolVersion.findUnique({ where: { version } });
      if (dup) {
        return NextResponse.json({ error: "Version already exists" }, { status: 409 });
      }
    }

    const data: Record<string, unknown> = {};
    if (version !== undefined) data.version = version;
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    if (stageDescriptions !== undefined) {
      data.stageDescriptions = typeof stageDescriptions === "string" ? stageDescriptions : JSON.stringify(stageDescriptions);
    }
    if (agentSkills !== undefined) {
      data.agentSkills = typeof agentSkills === "string" ? agentSkills : JSON.stringify(agentSkills);
    }
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await db.protocolVersion.update({
      where: { id },
      data,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error: any) {
    console.error("[protocol] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
