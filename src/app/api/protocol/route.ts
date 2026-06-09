import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";

// ── Helper: get active protocol (no auth required for reading) ──
async function getActiveProtocol() {
  try {
    await ensureProtocolTables();
    // Use raw query to access fileName, fileSize, mimeType, downloadEnabled columns safely
    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT id, version, title, content as data, stageDescriptions, agentSkills, isActive, createdBy, createdAt, updatedAt, "downloadEnabled"
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
      downloadEnabled: row.downloadEnabled !== false,
    };
  } catch {
    return null;
  }
}

// GET — fetch active protocol metadata (or binary PDF if ?download=true)
export async function GET(request: NextRequest) {
  try {
    const protocol = await getActiveProtocol();
    if (!protocol) {
      return NextResponse.json({ message: "No protocol uploaded" }, { status: 404 });
    }

    // Check authentication for full metadata
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    const isAuthenticated = !!token;

    // If download requested, return binary stream (requires auth)
    if (request.nextUrl.searchParams.get("download") === "true") {
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Check downloadEnabled — SUPER_ADMIN always bypasses
      if (!protocol.downloadEnabled && token.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Download disabled by administration" },
          { status: 403 }
        );
      }

      // Fetch the raw content (base64 data) from DB
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT content FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
      );
      const base64Data = rows[0]?.content || "";

      if (!base64Data) {
        return NextResponse.json({ error: "No PDF content found" }, { status: 404 });
      }

      // Convert base64 to binary buffer
      const buffer = Buffer.from(base64Data, "base64");

      // W7: Safe Content-Disposition header (prevent injection)
      const safeFileName = encodeURIComponent(protocol.fileName);
      const headers: Record<string, string> = {
        "Content-Type": protocol.mimeType || "application/pdf",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${safeFileName}`,
      };
      return new NextResponse(buffer, { headers });
    }

    // C8: Return limited info for unauthenticated, full info for authenticated
    if (!isAuthenticated) {
      return NextResponse.json({
        fileName: protocol.fileName,
        downloadEnabled: protocol.downloadEnabled,
        hasUpload: true,
      });
    }

    return NextResponse.json(protocol);
  } catch (error: unknown) {
    console.error("[protocol] GET error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — toggle downloadEnabled for active protocol (SUPER_ADMIN only)
export async function PATCH(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P10-013: Rate limit PATCH (20 per minute)
    const rlKey = `protocol-patch:${getTokenUserId(token)}`;
    const rl = rateLimit(rlKey, 20, 60 * 1000);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // W59: Wrap req.json() in try/catch
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { downloadEnabled } = body;

    if (typeof downloadEnabled !== "boolean") {
      return NextResponse.json({ error: "downloadEnabled must be a boolean" }, { status: 400 });
    }

    // Check an active protocol exists
    const existing: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
    );

    if (!existing.length) {
      return NextResponse.json({ error: "No active protocol found" }, { status: 404 });
    }

    await db.$executeRawUnsafe(
      `UPDATE "ProtocolVersion" SET "downloadEnabled" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      downloadEnabled ? 1 : 0,
      existing[0].id
    );

    return NextResponse.json({ success: true, downloadEnabled });
  } catch (error: unknown) {
    console.error("[protocol] PATCH error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — upload/replace protocol PDF (SUPER_ADMIN only)
export async function PUT(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P10-013: Rate limit PUT (20 per minute)
    const rlKey = `protocol-put:${getTokenUserId(token)}`;
    const rl = rateLimit(rlKey, 20, 60 * 1000);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // W59: Wrap req.json() in try/catch
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { fileName, fileSize, data } = body;
    let mimeType = body.mimeType;

    if (!data || !fileName) {
      return NextResponse.json({ error: "File data and name are required" }, { status: 400 });
    }

    // W6: Server-side validation — enforce PDF only
    if (mimeType && mimeType !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    // W6: Check base64 data size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (typeof data === "string" && data.length * 0.75 > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 50MB" }, { status: 400 });
    }

    // W6: Verify PDF magic bytes (%PDF-)
    let base64Data = data;
    if (typeof data === "string") {
      const decodedPrefix = Buffer.from(data.slice(0, 40), "base64").toString("utf8").slice(0, 5);
      if (decodedPrefix !== "%PDF-") {
        return NextResponse.json({ error: "Invalid PDF file. File must start with %PDF-" }, { status: 400 });
      }
      // Normalize mimeType
      mimeType = "application/pdf";
    }

    // Store metadata as JSON in the title field, PDF base64 in content
    const meta = JSON.stringify({
      fileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || "application/pdf",
      uploadedBy: token.name || token.email || "Admin",
    });

    // P10-009: Wrap check-then-insert in a transaction to prevent TOCTOU race
    const result = await db.$transaction(async (tx) => {
      // Deactivate any existing active protocol first
      await tx.$executeRawUnsafe(
        `UPDATE "ProtocolVersion" SET isActive = false WHERE isActive = true`
      );

      // Insert new active protocol
      const id = crypto.randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "ProtocolVersion" (id, version, title, content, isActive, createdBy)
         VALUES (?, '1.0', ?, ?, true, ?)`,
        id, meta, base64Data, getTokenUserId(token)
      );
      return "created";
    });

    return NextResponse.json({ success: true, action: result });
  } catch (error: unknown) {
    console.error("[protocol] PUT error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove active protocol (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P10-013: Rate limit DELETE (20 per minute)
    const rlKey = `protocol-delete:${getTokenUserId(token)}`;
    const rl = rateLimit(rlKey, 20, 60 * 1000);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    await db.$executeRawUnsafe(
      `DELETE FROM "ProtocolVersion" WHERE isActive = true`
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[protocol] DELETE error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create (kept for compatibility but PUT is preferred)
export async function POST(request: NextRequest) {
  return PUT(request);
}
