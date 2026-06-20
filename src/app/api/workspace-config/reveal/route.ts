import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db, getAppSetting } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";
import { decryptCredentialFromJson } from "@/lib/encryption";
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log";

/**
 * POST /api/workspace-config/reveal
 *
 * Returns the plaintext workspace configToken. This is the ONLY endpoint that
 * returns the plaintext to non-SUPER_ADMIN users — and only to ADMIN+.
 *
 * Access: ADMIN+ (SUPER_ADMIN or ADMIN)
 * Rate limit: 5 per minute per user
 * Audit: every reveal is logged
 *
 * Body: (none)
 * Returns: { success: true, token: "<plaintext>" }
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    }) as unknown as JwtToken | null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ADMIN+ only — DEVELOPER/VIEWER/CLIENT cannot reveal the workspace token
    if (token.role !== "SUPER_ADMIN" && token.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
    }

    // Strict rate limit on token reveals (5/min)
    const rl = rateLimit(`ws-config-reveal:${getTokenUserId(token)}`, 5, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many reveal requests. Try again in a minute." },
        { status: 429 }
      );
    }

    await ensureProtocolTables();

    const rows: Array<{ id: string; configToken: string; configTokenLabel: string }> =
      await db.$queryRawUnsafe(
        `SELECT id, "configToken", "configTokenLabel" FROM "WorkspaceConfig" LIMIT 1`
      );

    if (!rows.length) {
      return NextResponse.json({ error: "No workspace config token set" }, { status: 404 });
    }

    const row = rows[0];
    const stored = row.configToken || "";
    if (!stored) {
      return NextResponse.json({ error: "No workspace config token set" }, { status: 404 });
    }

    const dbKey = await getAppSetting("credentialEncryptionKey").catch(() => "");

    let plaintext: string;
    try {
      plaintext = decryptCredentialFromJson(stored, dbKey || undefined);
    } catch (err) {
      console.error(
        "[ws-config/reveal] decrypt error:",
        err instanceof Error ? err.message : String(err)
      );
      return NextResponse.json(
        { error: "Failed to decrypt token. Check credential encryption key configuration." },
        { status: 500 }
      );
    }

    // Audit log the reveal (fire-and-forget)
    void logAudit({
      userId: getTokenUserId(token),
      userName: token.name || "unknown",
      userRole: token.role || "",
      department: "SYSTEM",
      page: "workspace",
      action: "READ",
      entityType: "WorkspaceConfig",
      entityId: row.id,
      description: `Revealed workspace config token${row.configTokenLabel ? ` (${row.configTokenLabel})` : ""}`,
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
    });

    return NextResponse.json({ success: true, token: plaintext });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ws-config/reveal] POST error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
