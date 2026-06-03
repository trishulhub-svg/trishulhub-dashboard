import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// TODO (M-5): Extract this sanitizeInput function to a shared utility (e.g., @/lib/sanitize)
// so it can be reused across API routes instead of being duplicated here and in /api/projects/route.ts.
// NOTE (M-3): This regex-based sanitization is a basic defense. For production, consider
// using a proper library like DOMPurify or sanitize-html to handle edge cases (e.g., unclosed tags,
// attribute-based XSS, HTML entity encoding).
function sanitizeInput(str: string, maxLength: number): string {
  const stripped = str.replace(/<[^>]*>/g, "").trim();
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped;
}

// ━━ GET /api/projects/[projectId]/websites ━━
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // P-H5 FIX: Add rate limiting
    const rl = rateLimit(`projects-websites-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId } = await params;
    const userRole = session.user.role || "DEVELOPER";
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const websites = await db.projectWebsite.findMany({
      where: { projectId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(websites)));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load websites";
    console.error("[project-websites] GET error:", msg);
    return NextResponse.json({ error: "Failed to load websites" }, { status: 500 });
  }
}

// ━━ POST /api/projects/[projectId]/websites — Add a website ━━
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // P-H5 FIX: Add rate limiting
    const rl = rateLimit(`projects-websites-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId } = await params;
    const userRole = session.user.role || "DEVELOPER";
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P-H6 FIX: Gracefully validate JSON body
    let body: { url?: unknown; label?: unknown; isPrimary?: boolean | string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const isPrimaryBool = Boolean(body.isPrimary);
    const { url, label } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Basic URL validation
    const trimmedUrl = url.trim();
    if (!/^https?:\/\/.+\..+/.test(trimmedUrl)) {
      return NextResponse.json(
        { error: "URL must start with http:// or https:// and contain a valid domain" },
        { status: 400 }
      );
    }

    // Verify project exists
    const projectExists = await db.project.findUnique({ where: { id: projectId } });
    if (!projectExists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // If setting as primary, unset other primaries
    if (isPrimaryBool) {
      await db.projectWebsite.updateMany({
        where: { projectId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const website = await db.projectWebsite.create({
      data: {
        url: sanitizeInput(trimmedUrl, 2000),
        label: label ? sanitizeInput(String(label), 100) : null,
        isPrimary: isPrimaryBool,
        projectId,
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(website)), { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to add website";
    console.error("[project-websites] POST error:", msg);
    return NextResponse.json({ error: "Failed to add website" }, { status: 500 });
  }
}

// ━━ PATCH /api/projects/[projectId]/websites — Update a website ━━
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // P-H5 FIX: Add rate limiting
    const rl = rateLimit(`projects-websites-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId } = await params;
    const userRole = session.user.role || "DEVELOPER";
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { id?: unknown; url?: unknown; label?: unknown; isPrimary?: boolean | string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const isPrimaryBool = Boolean(body.isPrimary);
    const { id, url, label } = body;

    if (!id) {
      return NextResponse.json({ error: "Website ID is required" }, { status: 400 });
    }

    // If setting as primary, unset other primaries
    if (isPrimaryBool) {
      await db.projectWebsite.updateMany({
        where: { projectId, isPrimary: true, id: { not: id as string } },
        data: { isPrimary: false },
      });
    }

    const updateData: Prisma.ProjectWebsiteUncheckedUpdateInput = {};
    if (url !== undefined) {
      const trimmedUrl = String(url).trim();
      if (!/^https?:\/\/.+\..+/.test(trimmedUrl)) {
        return NextResponse.json(
          { error: "URL must start with http:// or https:// and contain a valid domain" },
          { status: 400 }
        );
      }
      updateData.url = sanitizeInput(trimmedUrl, 2000);
    }
    if (label !== undefined) {
      updateData.label = label ? sanitizeInput(String(label), 100) : null;
    }
    if (typeof body.isPrimary !== "undefined") {
      updateData.isPrimary = isPrimaryBool;
    }

    const website = await db.projectWebsite.update({
      where: { id: id as string, projectId },
      data: updateData,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(website)));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update website";
    console.error("[project-websites] PATCH error:", msg);
    return NextResponse.json({ error: "Failed to update website" }, { status: 500 });
  }
}

// ━━ DELETE /api/projects/[projectId]/websites ━━
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // P-H5 FIX: Add rate limiting
    const rl = rateLimit(`projects-websites-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId } = await params;
    const userRole = session.user.role || "DEVELOPER";
    const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Website ID is required" }, { status: 400 });
    }

    await db.projectWebsite.delete({
      where: { id, projectId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete website";
    console.error("[project-websites] DELETE error:", msg);
    return NextResponse.json({ error: "Failed to delete website" }, { status: 500 });
  }
}
