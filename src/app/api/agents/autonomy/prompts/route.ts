// ━━ Autonomous Prompts API ━━
// GET: List prompts for an agent
// POST: Create new prompt
// PATCH: Update prompt (activate, edit)
// DELETE: Delete prompt (not if isDefault)

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAutonomyTables } from "@/lib/ensure-autonomy-tables"
import { isAdmin } from "@/lib/rbac"
import { seedDefaultAutonomousPrompts } from "@/lib/ai/seed-autonomous-prompts"

// GET /api/agents/autonomy/prompts?agentId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 })
    }

    // Ensure autonomy tables exist before querying prompts
    await ensureAutonomyTables()

    // Ensure default prompts exist
    await seedDefaultAutonomousPrompts()

    const prompts = await db.agentAutonomousPrompt.findMany({
      where: { agentId },
      orderBy: [
        { isActive: "desc" }, // Active prompt first
        { isDefault: "desc" }, // Then defaults
        { createdAt: "desc" }, // Then newest first
      ],
      select: {
        id: true,
        agentId: true,
        title: true,
        content: true,
        isActive: true,
        isDefault: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(prompts)
  } catch (error: any) {
    console.error("[autonomy-prompts] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/agents/autonomy/prompts
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 })

    const { agentId, title, content, makeActive } = await req.json()

    if (!agentId || !title || !content) {
      return NextResponse.json({ error: "agentId, title, and content are required" }, { status: 400 })
    }

    if (content.length < 10) {
      return NextResponse.json({ error: "Prompt content must be at least 10 characters" }, { status: 400 })
    }

    // Verify agent exists and is not DEV
    const agent = await db.agent.findUnique({ where: { id: agentId } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    if (agent.type === "DEV") return NextResponse.json({ error: "DEV agent cannot have autonomous prompts" }, { status: 400 })

    // If makeActive, deactivate current active prompt
    if (makeActive) {
      await db.agentAutonomousPrompt.updateMany({
        where: { agentId, isActive: true },
        data: { isActive: false },
      })
    }

    const prompt = await db.agentAutonomousPrompt.create({
      data: {
        agentId,
        title: title.trim(),
        content: content.trim(),
        isActive: !!makeActive,
        isDefault: false, // User-created prompts are never defaults
        createdBy: session.user.id,
      },
    })

    return NextResponse.json({ success: true, prompt }, { status: 201 })
  } catch (error: any) {
    console.error("[autonomy-prompts] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/agents/autonomy/prompts
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 })

    const { id, action, title, content } = await req.json()

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const existing = await db.agentAutonomousPrompt.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Prompt not found" }, { status: 404 })

    switch (action) {
      case "activate": {
        // Deactivate all other prompts for this agent, activate this one
        await db.agentAutonomousPrompt.updateMany({
          where: { agentId: existing.agentId, isActive: true },
          data: { isActive: false },
        })
        await db.agentAutonomousPrompt.update({
          where: { id },
          data: { isActive: true },
        })
        return NextResponse.json({ success: true, message: "Prompt activated" })
      }

      case "deactivate": {
        await db.agentAutonomousPrompt.update({
          where: { id },
          data: { isActive: false },
        })
        return NextResponse.json({ success: true, message: "Prompt deactivated" })
      }

      case "edit": {
        if (existing.isDefault) {
          // Default prompts content cannot be edited — only title can be changed
          if (content && content !== existing.content) {
            return NextResponse.json({ error: "Default prompt content cannot be modified" }, { status: 403 })
          }
          // Allow title change for defaults
          if (title) {
            await db.agentAutonomousPrompt.update({
              where: { id },
              data: { title: title.trim() },
            })
          }
          return NextResponse.json({ success: true, message: "Default prompt title updated" })
        }

        // Non-default prompts: allow full edit
        const updateData: any = {}
        if (title) updateData.title = title.trim()
        if (content) {
          if (content.trim().length < 10) {
            return NextResponse.json({ error: "Prompt content must be at least 10 characters" }, { status: 400 })
          }
          updateData.content = content.trim()
        }

        await db.agentAutonomousPrompt.update({
          where: { id },
          data: updateData,
        })
        return NextResponse.json({ success: true, message: "Prompt updated" })
      }

      default:
        return NextResponse.json({ error: "Invalid action. Use: activate, deactivate, edit" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[autonomy-prompts] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/agents/autonomy/prompts?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const existing = await db.agentAutonomousPrompt.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Prompt not found" }, { status: 404 })

    // Default prompts CANNOT be deleted
    if (existing.isDefault) {
      return NextResponse.json({ error: "Default prompts cannot be deleted — they are permanent system prompts" }, { status: 403 })
    }

    await db.agentAutonomousPrompt.delete({ where: { id } })

    // If the deleted prompt was active, activate the default prompt for this agent
    if (existing.isActive) {
      const defaultPrompt = await db.agentAutonomousPrompt.findFirst({
        where: { agentId: existing.agentId, isDefault: true },
      })
      if (defaultPrompt) {
        await db.agentAutonomousPrompt.update({
          where: { id: defaultPrompt.id },
          data: { isActive: true },
        })
      }
    }

    return NextResponse.json({ success: true, message: "Prompt deleted" })
  } catch (error: any) {
    console.error("[autonomy-prompts] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
