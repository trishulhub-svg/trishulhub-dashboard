import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken, isAgentAdmin } from "@/lib/agent-auth";

// ── Helpers ──

function isValidProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{10,50}$/.test(id);
}

/** Check if user is a member of the project or is admin */
async function canAccessProject(userId: string, role: string, projectId: string): Promise<boolean> {
  if (isAgentAdmin({ role, userId, email: "", name: "", tier: 1, iat: 0, exp: 0, jti: "" })) return true;
  const membership = await db.projectMember.findFirst({
    where: { userId, projectId },
    select: { id: true },
  });
  return !!membership;
}

// ── GET /api/agent/projects/[projectId] ──
// Returns full project detail including infrastructure (non-secret fields).
// Available to: assigned project members + ADMIN+
//
// Response includes:
// - Project metadata (name, status, progress, client, deadline)
// - Team members (id, name, role, projectRole)
// - Infrastructure (repo URL, branch, Turso URL, deploy URL — NO tokens)
// - hasGithubToken / hasTursoToken boolean flags (use /infra/tokens endpoint to reveal)
export async function GET(
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

    // Fetch project with relations
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        progress: true,
        startDate: true,
        deadline: true,
        budget: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: { id: true, name: true, company: true, email: true },
        },
        members: {
          select: {
            id: true,
            role: true,
            user: {
              select: { id: true, name: true, email: true, role: true, department: true },
            },
          },
        },
        infrastructure: {
          select: {
            githubRepoUrl: true,
            githubBranch: true,
            tursoUrl: true,
            vercelProjectId: true,
            deployUrl: true,
            githubTokenEnc: true,
            tursoTokenEnc: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Serialize — mask budget for non-admins, serialize dates
    const showBudget = isAgentAdmin({ role: user.role, userId: user.id, email: "", name: "", tier: 1, iat: 0, exp: 0, jti: "" });

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description || null,
        status: project.status,
        progress: project.progress,
        startDate: project.startDate?.toISOString() ?? null,
        deadline: project.deadline?.toISOString() ?? null,
        budget: showBudget ? project.budget : undefined,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        client: project.client ? {
          id: project.client.id,
          name: project.client.name,
          company: project.client.company || null,
          email: project.client.email,
        } : null,
        members: project.members.map((m) => ({
          id: m.id,
          projectRole: m.role,
          user: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.user.role,
            department: m.user.department || null,
          },
        })),
        infrastructure: project.infrastructure ? {
          githubRepoUrl: project.infrastructure.githubRepoUrl || "",
          githubBranch: project.infrastructure.githubBranch || "",
          tursoUrl: project.infrastructure.tursoUrl || "",
          vercelProjectId: project.infrastructure.vercelProjectId || "",
          deployUrl: project.infrastructure.deployUrl || "",
          hasGithubToken: !!project.infrastructure.githubTokenEnc,
          hasTursoToken: !!project.infrastructure.tursoTokenEnc,
          updatedAt: project.infrastructure.updatedAt.toISOString(),
        } : null,
      },
    });
  } catch (error) {
    console.error("[agent/projects/[projectId]] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
