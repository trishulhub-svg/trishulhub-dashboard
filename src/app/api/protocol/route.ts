import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

// ── Helper: get active protocol (no auth required for reading) ──
async function getActiveProtocol() {
  try {
    await ensureProtocolTables();
    // Use raw query to access fileName, fileSize, mimeType columns safely
    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT id, version, title, content as data, stageDescriptions, agentSkills, isActive, createdBy, createdAt, updatedAt
       FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
    );
    if (!rows.length) return null;
    const row = rows[0];

    // Parse stored metadata from title field (JSON: {fileName, fileSize, mimeType, uploadedBy})
    let meta = { fileName: "trishul-protocol.pdf", fileSize: 0, mimeType: "application/pdf", uploadedBy: "" };
    try {
      if (row.title && row.title.startsWith("{")) {
        meta = { ...meta, ...JSON.parse(row.title) };
      }
    } catch { /* use defaults */ }

    return {
      id: row.id,
      fileName: meta.fileName,
      fileSize: meta.fileSize || 0,
      mimeType: meta.mimeType || "application/pdf",
      uploadedBy: meta.uploadedBy || "",
      uploadedAt: row.updatedAt || row.createdAt,
    };
  } catch {
    return null;
  }
}

// GET — fetch active protocol metadata (or PDF data if ?download=true)
export async function GET(request: NextRequest) {
  try {
    const protocol = await getActiveProtocol();
    if (!protocol) {
      return NextResponse.json({ message: "No protocol uploaded" }, { status: 404 });
    }

    // If download requested, include the base64 data
    if (request.nextUrl.searchParams.get("download") === "true") {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Fetch the raw content (base64 data) from DB
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT content FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
      );
      return NextResponse.json({
        ...protocol,
        data: rows[0]?.content || "",
      });
    }

    // Otherwise just return metadata
    return NextResponse.json(protocol);
  } catch (error: any) {
    console.error("[protocol] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — upload/replace protocol PDF (SUPER_ADMIN only)
export async function PUT(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { fileName, fileSize, mimeType, data } = body;

    if (!data || !fileName) {
      return NextResponse.json({ error: "File data and name are required" }, { status: 400 });
    }

    // Store metadata as JSON in the title field, PDF base64 in content
    const meta = JSON.stringify({
      fileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || "application/pdf",
      uploadedBy: (token as any).name || (token as any).email || "Admin",
    });

    // Check if active protocol already exists → update, otherwise create
    const existing: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
    );

    if (existing.length > 0) {
      await db.$executeRawUnsafe(
        `UPDATE "ProtocolVersion" SET content = ?, title = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        data, meta, existing[0].id
      );
      return NextResponse.json({ success: true, action: "updated" });
    } else {
      const id = "proto_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      await db.$executeRawUnsafe(
        `INSERT INTO "ProtocolVersion" (id, version, title, content, isActive, createdBy)
         VALUES (?, '1.0', ?, ?, true, ?)`,
        id, meta, data, (token as any).sub || (token as any).id || "unknown"
      );
      return NextResponse.json({ success: true, action: "created" }, { status: 201 });
    }
  } catch (error: any) {
    console.error("[protocol] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove active protocol (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.$executeRawUnsafe(
      `DELETE FROM "ProtocolVersion" WHERE isActive = true`
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[protocol] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create (kept for compatibility but PUT is preferred)
export async function POST(request: NextRequest) {
  return PUT(request);
}
