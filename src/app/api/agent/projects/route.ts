import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken, isAgentAdmin } from "@/lib/agent-auth";
import { getAssignedProjectIds } from "@/lib/rbac";

// ── GET /api/agent/projects ──
// Returns the authenticated user's assigned projects.
// - Admins see all projects
// - Devs/viewers see only projects they're a member of
//
// Each project includes: id, name, status, progress, client, yourRole, deadline
// Does NOT include infrastructure details (use /api/agent/projects/[projectId] for that)
export async function GET(request: NextRequest) {
  try {
    const payload = extractAgentToken(request.headers.get("authorization"));

    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Account no longer active" }, { status: 403 });
    }

    const adminMode = isAgentAdmin(payload);

    // Get assigned project IDs (null means "all projects" for admins)
    const assignedIds = adminMode ? null : await getAssignedProjectIds(user.id, user.role);

    // If non-admin with no assignments, return empty list
    if (!adminMode && assignedIds && assignedIds.length === 0) {
      return NextResponse.json({
        success: true,
        projects: [],
      });
    }

    // Fetch projects
    const projects = await db.project.findMany({
      where: assignedIds ? { id: { in: assignedIds } } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        progress: true,
        deadline: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: { id: true, name: true, company: true, email: true },
        },
        members: {
          where: { userId: user.id },
          select: { role: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Serialize
    const serializedProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || null,
      status: p.status,
      progress: p.progress,
      deadline: p.deadline?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      client: p.client ? {
        id: p.client.id,
        name: p.client.name,
        company: p.client.company || null,
        email: p.client.email,
      } : null,
      yourRole: p.members[0]?.role || (adminMode ? "ADMIN" : "MEMBER"),
    }));

    return NextResponse.json({
      success: true,
      projects: serializedProjects,
      total: serializedProjects.length,
    });
  } catch (error) {
    console.error("[agent/projects] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
