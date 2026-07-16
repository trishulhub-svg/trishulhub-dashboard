import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken } from "@/lib/agent-auth";
import { decryptCredential } from "@/lib/encryption";
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log";
import { rateLimit } from "@/lib/rate-limit";

// ── Helpers ──

function isValidProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{10,50}$/.test(id);
}

async function canAccessProject(userId: string, role: string, projectId: string): Promise<boolean> {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  const membership = await db.projectMember.findFirst({
    where: { userId, projectId },
    select: { id: true },
  });
  return !!membership
}

// ── POST /api/agent/projects/[projectId]/infra/tokens ──
// Reveal encrypted tokens for a project.
// Available to: assigned project members + ADMIN+
// Rate limited: 5 requests per minute per user (enforced via in-memory map)
// Audit logged
//
// Body: { kind: "github" | "turso" }
// Returns: { success: true, kind, token: "<plaintext>" }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const payload = extractAgentToken(request.headers.get("authorization"));

    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    // Verify user still active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Account no longer active" }, { status: 403 });
    }

    // Access check
    const hasAccess = await canAccessProject(user.id, user.role, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: not a project member" }, { status: 403 });
    }

    // Rate limit — match browser reveal (5/min per user)
    const rl = rateLimit(`agent-infra-reveal-${user.id}`, 5, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limited — too many token reveals. Try again in a minute." }, { status: 429 });
    }

    // Parse body
    const body = await request.json();
    const kind = body?.kind;

    if (kind !== "github" && kind !== "turso") {
      return NextResponse.json({ error: "Invalid kind. Must be 'github' or 'turso'." }, { status: 400 });
    }

    // Fetch infrastructure
    const infra = await db.projectInfrastructure.findUnique({
      where: { projectId },
    });

    if (!infra) {
      return NextResponse.json({ error: "No infrastructure configured for this project" }, { status: 404 });
    }

    // Decrypt the requested token
    let plaintext: string;

    if (kind === "github") {
      if (!infra.githubTokenEnc || !infra.githubTokenIv || !infra.githubTokenTag) {
        return NextResponse.json({ error: "No GitHub token set for this project" }, { status: 404 });
      }
      plaintext = decryptCredential(
        infra.githubTokenEnc,
        infra.githubTokenIv,
        infra.githubTokenTag
      );
    } else {
      if (!infra.tursoTokenEnc || !infra.tursoTokenIv || !infra.tursoTokenTag) {
        return NextResponse.json({ error: "No Turso token set for this project" }, { status: 404 });
      }
      plaintext = decryptCredential(
        infra.tursoTokenEnc,
        infra.tursoTokenIv,
        infra.tursoTokenTag
      );
    }

    // Audit log the reveal (via agent API)
    void logAudit({
      userId: user.id,
      userName: payload.name || "unknown",
      userRole: user.role || "",
      department: "SYSTEM",
      page: "agent-api",
      action: "READ",
      entityType: "ProjectInfrastructure",
      entityId: infra.id,
      description: `Agent API: Revealed ${kind} token for project ${projectId}`,
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
    });

    return NextResponse.json({
      success: true,
      kind,
      token: plaintext,
    });
  } catch (error) {
    console.error("[agent/projects/[projectId]/infra/tokens] POST error:", error);
    return NextResponse.json({ error: "Failed to reveal token" }, { status: 500 });
  }
}
