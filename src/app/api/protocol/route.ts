import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

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
      // Upsert: update existing protocol with same version instead of erroring
      const updated = await db.protocolVersion.update({
        where: { id: existing.id },
        data: {
          title: title || "Trishul Protocol",
          content: content || "",
          stageDescriptions: typeof stageDescriptions === "string" ? stageDescriptions : JSON.stringify(stageDescriptions || []),
          agentSkills: typeof agentSkills === "string" ? agentSkills : JSON.stringify(agentSkills || []),
          isActive: true,
        },
      });
      return NextResponse.json(JSON.parse(JSON.stringify(updated)));
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
