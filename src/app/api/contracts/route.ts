import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { callAIWithFailover } from "@/lib/ai/openrouter"
import { after } from "next/server"
import { deepSanitize } from "@/lib/utils"
import { createContractSchema, updateContractSchema, validateRequest } from "@/lib/validations"

export const maxDuration = 300

// GET /api/contracts - List contracts for a client with pagination
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await ensureAllTables()

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get("clientId")
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })

    const { success: rateOk } = rateLimit(`contracts-get:${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    // Pagination params
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200)
    const offset = (page - 1) * limit

    const [contracts, total] = await Promise.all([
      db.contract.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      db.contract.count({ where: { clientId } }),
    ])

    return NextResponse.json(deepSanitize({
      data: contracts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }))
  } catch (error: unknown) {
    console.error("[contracts] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 })
  }
}

// POST /api/contracts - Create contract (with optional AI generation)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { success: rateOk } = rateLimit(`contracts-post:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  await ensureAllTables()

  // Issue #8: req.json() try/catch
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { clientId, useAI, templateText, ...contractData } = body as Record<string, unknown>

  if (!clientId || typeof clientId !== "string") return NextResponse.json({ error: "clientId is required" }, { status: 400 })

  // Issue #15: Zod validation on contractData (fields going to DB)
  const validation = validateRequest(createContractSchema, contractData)
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }
  const validatedData = validation.data

  // Sanitize all string fields on create
  const sanitizedData = deepSanitize(validatedData) as Record<string, unknown>

  // Fetch client data for auto-fill
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      projects: { take: 1, orderBy: { createdAt: "desc" } },
      projectMethod: { select: { name: true } },
    },
  })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  const latestProject = client.projects[0] || null

  // FIXED: Now using $transaction for atomicity (CTR-01)
  const contract = await db.$transaction(async (tx) => {
    // Generate contract number using max existing number to avoid collisions after deletes
    const lastContract = await tx.contract.findFirst({ orderBy: { createdAt: "desc" }, select: { contractNumber: true } })
    const lastNum = lastContract?.contractNumber ? parseInt(lastContract.contractNumber.replace("CTR-", ""), 10) : 0
    const contractNumber = `CTR-${String(lastNum + 1).padStart(4, "0")}`

    // Auto-fill client data
    const autoData = {
      clientName: client.name,
      clientEmail: client.email,
      clientCompany: client.company || null,
      clientPhone: client.phone || null,
      projectName: latestProject?.name || null,
      projectType: client.projectType || null,
      projectMethod: client.projectMethod?.name || null,
      projectStartDate: client.projectStartDate ? new Date(client.projectStartDate).toISOString().split("T")[0] : null,
      deliveryDate: client.deliveryDate ? new Date(client.deliveryDate).toISOString().split("T")[0] : null,
      generatedBy: session.user.id,
    }

    return tx.contract.create({
      data: {
        clientId,
        contractNumber,
        title: sanitizedData.title ? String(sanitizedData.title) : `Service Agreement - ${client.name}`,
        status: "DRAFT",
        ...autoData,
        ...(sanitizedData.scopeOfWork ? { scopeOfWork: String(sanitizedData.scopeOfWork) } : {}),
        ...(sanitizedData.paymentTerms ? { paymentTerms: String(sanitizedData.paymentTerms) } : {}),
        ...(sanitizedData.totalValue !== undefined ? {
          totalValue: (() => { const v = Number(sanitizedData.totalValue); if (isNaN(v) || !isFinite(v)) return 0; return v })()
        } : {}),
        ...(sanitizedData.currency ? { currency: String(sanitizedData.currency) } : {}),
        ...(sanitizedData.paymentSchedule ? { paymentSchedule: String(sanitizedData.paymentSchedule) } : {}),
        ...(sanitizedData.startDate ? { startDate: String(sanitizedData.startDate) } : {}),
        ...(sanitizedData.endDate ? { endDate: String(sanitizedData.endDate) } : {}),
        ...(sanitizedData.termsAndConditions ? { termsAndConditions: String(sanitizedData.termsAndConditions) } : {}),
        ...(templateText ? { templateText: String(templateText), templateFileName: sanitizedData.templateFileName ? String(sanitizedData.templateFileName) : "template" } : {}),
      },
    })
  })

  // If useAI, generate contract content in background
  if (useAI) {
    after(async () => {
      try {
        const apiKeys = await db.apiKey.findMany({
          where: { status: { in: ["ACTIVE"] } },
          orderBy: { priority: "asc" },
        })

        if (!apiKeys?.length) {
          console.warn("[contracts] AI content generation failed for contract:", contract.id, "— no active API keys")
          return
        }

        const projectDesc = latestProject?.description || `Web development project for ${client.name}`

        // Issue #9: AI prompt injection mitigation — sanitize user content before injecting into prompt
        const sanitizedTemplate = templateText
          ? String(templateText).replace(/[<{}]/g, ' ').slice(0, 10000)
          : null
        const sanitizedDesc = projectDesc
          ? String(projectDesc).replace(/[<>{}]/g, ' ').slice(0, 5000)
          : null

        const AI_MODEL = process.env.AI_CONTRACT_MODEL || "glm-4.7-flash"

        const result = await callAIWithFailover(
          [
            {
              role: "system",
              content: "You are a legal contract drafting expert. Generate professional, comprehensive service agreements. Use formal legal language. Output must be valid markdown.",
            },
            {
              role: "user",
              content: `Generate a professional service agreement contract with the following details:

**Client:** ${client.name} (${client.email})
${client.company ? `**Company:** ${client.company}` : ""}
${client.phone ? `**Phone:** ${client.phone}` : ""}

**Project:** ${latestProject?.name || "To be determined"}
**Project Type:** ${client.projectType || "IT Services"}
${client.projectMethod ? `**Technology:** ${client.projectMethod.name}` : ""}
${client.projectStartDate ? `**Start Date:** ${new Date(client.projectStartDate).toLocaleDateString()}` : ""}
${client.deliveryDate ? `**Delivery Date:** ${new Date(client.deliveryDate).toLocaleDateString()}` : ""}

**Project Description:** ${sanitizedDesc}

${sanitizedTemplate ? `**Reference Template (base the contract on this):**\n---\n${sanitizedTemplate}\n---\n\n` : ""}
Generate the following sections:
1. **Parties** - Identification of both parties (TrishulHub as service provider)
2. **Scope of Work** - Detailed description of services to be provided
3. **Payment Terms** - Payment structure, milestones, due dates, late fees
4. **Timeline & Deliverables** - Project phases and delivery schedule
5. **Intellectual Property** - IP ownership and licensing
6. **Confidentiality** - NDA provisions
7. **Warranties & Liabilities** - Service warranties and limitation of liability
8. **Termination** - Conditions for contract termination
9. **Dispute Resolution** - Governing law and dispute resolution mechanism
10. **Miscellaneous** - Force majeure, amendments, entire agreement
11. **Signatures** - Signature blocks for both parties

Use markdown formatting with ## for section headers. Make it professional and legally sound.
${sanitizedTemplate ? "IMPORTANT: Base the structure and clauses on the provided template, but customize all details for this specific client and project." : ""}`,
            },
          ],
          AI_MODEL,
          apiKeys,
          { maxTokens: 8000, temperature: 0.5 }
        )

        if (result.content) {
          await db.contract.update({
            where: { id: contract.id },
            data: {
              termsAndConditions: result.content,
              scopeOfWork: "See Terms & Conditions below",
            },
          })
          // Track API usage
          if (result.apiKeyId && result.cost > 0) {
            await db.apiKey.update({
              where: { id: result.apiKeyId },
              data: { currentSpend: { increment: result.cost } },
            })
            await db.apiUsageLog.create({
              data: {
                apiKeyId: result.apiKeyId,
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                cost: result.cost,
              },
            })
          }
        }
      } catch (err: unknown) {
        console.warn("[contracts] AI content generation failed for contract:", contract.id)
      }
    })
  }

  return NextResponse.json(deepSanitize(contract), { status: 201 })
}

// PATCH /api/contracts - Update contract
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { success: rateOk } = rateLimit(`contracts-patch:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    // Issue #7: req.json() try/catch
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { id, ...data } = body as Record<string, unknown>
    if (!id) return NextResponse.json({ error: "Contract ID is required" }, { status: 400 })

    // Issue #16: Zod validation on PATCH
    const validation = validateRequest(updateContractSchema, { id, ...data })
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const VALID_STATUSES = ["DRAFT", "SENT", "SIGNED", "EXPIRED", "CANCELLED"]

    const existing = await db.contract.findUnique({ where: { id: String(id) } })
    if (!existing) return NextResponse.json({ error: "Contract not found" }, { status: 404 })

    // Validate status if provided
    if (data.status !== undefined && !VALID_STATUSES.includes(String(data.status))) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 })
    }

    // Sanitize text fields
    const sanitized: Record<string, any> = {}
    const textFields = ["title", "scopeOfWork", "paymentTerms", "paymentSchedule", "termsAndConditions", "amendments", "specialClauses", "clientName", "clientEmail", "clientCompany", "clientPhone", "clientAddress", "projectName", "projectDescription", "projectType", "projectMethod", "projectStartDate", "deliveryDate", "startDate", "endDate", "currency", "templateText", "templateFileName"]
    for (const key of textFields) {
      if (data[key] !== undefined) sanitized[key] = typeof data[key] === "string" ? deepSanitize(data[key]) : data[key]
    }
    if (data.totalValue !== undefined) {
      const val = Number(data.totalValue)
      sanitized.totalValue = (isNaN(val) || !isFinite(val)) ? 0 : val
    }

    try {
      const contract = await db.contract.update({
        where: { id: String(id) },
        data: sanitized,
      })
      // Issue #14: deepSanitize on PATCH response
      return NextResponse.json(deepSanitize(contract))
    } catch (error: unknown) {
      console.error("[contracts] PATCH DB error:", error instanceof Error ? error.message : error)
      // Issue #11: P2025 error handling
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Contract not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Failed to update contract" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[contracts] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 })
  }
}

// TODO: Migrate to DELETE /api/contracts/[id] for proper REST (Issue #12)
// DELETE /api/contracts - Delete contract
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { success: rateOk } = rateLimit(`contracts-delete:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    // Issue #7 (also for DELETE): req.json() try/catch
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { id } = body as Record<string, unknown>
    if (!id) return NextResponse.json({ error: "Contract ID is required" }, { status: 400 })

    // Issue #13: Contract DELETE missing existence check
    const existing = await db.contract.findUnique({ where: { id: String(id) } })
    if (!existing) return NextResponse.json({ error: "Contract not found" }, { status: 404 })

    try {
      await db.contract.delete({ where: { id: String(id) } })
      return NextResponse.json({ success: true })
    } catch (error: unknown) {
      console.error("[contracts] DELETE DB error:", error instanceof Error ? error.message : error)
      // Issue #11: P2025 error handling
      const prismaError = error as { code?: string }
      if (prismaError?.code === "P2025") {
        return NextResponse.json({ error: "Contract not found" }, { status: 404 })
      }
      return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[contracts] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 })
  }
}
