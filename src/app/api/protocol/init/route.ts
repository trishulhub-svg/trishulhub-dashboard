import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { JwtToken } from "@/types/jwt";

/**
 * GET /api/protocol/init
 *
 * Single-batch endpoint that returns ALL data the protocol page needs
 * in one request. Replaces 5 separate API calls → 1 request.
 *
 * Returns: { protocol }
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ONE call to ensure tables — shared across all data fetches
    await ensureProtocolTables();

    // Fetch protocol PDF metadata
    const protocolResult = await (async () => {
      try {
        const rows: any[] = await db.$queryRawUnsafe(
          `SELECT id, version, title, content as data, stageDescriptions, agentSkills,
                  isActive, createdBy, createdAt, updatedAt, "downloadEnabled"
           FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
        );
        if (!rows.length) return null;
        const row = rows[0];
        let meta = { fileName: "trishul-protocol.pdf", fileSize: 0, mimeType: "application/pdf", uploadedBy: "" };
        try {
          if (row.title && row.title.startsWith("{")) meta = { ...meta, ...JSON.parse(row.title) };
        } catch { /* defaults */ }
        return {
          id: row.id,
          fileName: meta.fileName,
          fileSize: meta.fileSize || 0,
          mimeType: meta.mimeType || "application/pdf",
          uploadedBy: meta.uploadedBy || "",
          uploadedAt: row.updatedAt || row.createdAt,
          downloadEnabled: row.downloadEnabled !== false,
        };
      } catch { return null; }
    })();

    return NextResponse.json({
      protocol: protocolResult,
    });
  } catch (error: unknown) {
    console.error("[protocol/init] GET error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
