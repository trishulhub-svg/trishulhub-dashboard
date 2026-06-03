import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { callAIWithFailover } from "@/lib/ai/openrouter"
import { after } from "next/server"
import { deepSanitize } from "@/lib/utils"

export const maxDuration = 300

// GET /api/contracts - List contracts for a client
export async function GET(req: NextRequest) {
  try {
    await ensureAllTables()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get("clientId")
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })

    const { success: rateOk } = rateLimit(`contracts-get:${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const contracts = await db.contract.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(contracts)
  } catch (error: any) {
    console.error("[contracts] GET error:", error.message)
    return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 })
  }
}

// POST /api/contracts - Create contract (with optional AI generation)
export async function POST(req: NextRequest) {
  try {
    await ensureAllTables()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { success: rateOk } = rateLimit(`contracts-post:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json()
    const { clientId, useAI, templateText, ...contractData } = body

    if (!clientId || typeof clientId !== "string") return NextResponse.json({ error: "clientId is required" }, { status: 400 })

    // Sanitize all string fields on create
    const sanitizedData = deepSanitize(contractData) as Record<string, unknown>

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

    // Generate contract number using max existing number to avoid collisions after deletes
    const lastContract = await db.contract.findFirst({ orderBy: { createdAt: "desc" }, select: { contractNumber: true } })
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

    const contract = await db.contract.create({
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

    // If useAI, generate contract content in background
    if (useAI) {
      after(async () => {
        try {
          const apiKeys = await db.apiKey.findMany({
            where: { status: { in: ["ACTIVE"] } },
            orderBy: { priority: "asc" },
          })

          if (!apiKeys?.length) {
            console.error("[contracts] No active API keys for AI generation")
            return
          }

          const projectDesc = latestProject?.description || `Web development project for ${client.name}`

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

**Project Description:** ${projectDesc}

${templateText ? `**Reference Template (base the contract on this):**\n---\n${templateText.slice(0, 10000)}\n---\n\n` : ""}
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
${templateText ? "IMPORTANT: Base the structure and clauses on the provided template, but customize all details for this specific client and project." : ""}`,
              },
            ],
            "glm-4.7-flash",
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
        } catch (err: any) {
          console.error("[contracts] AI generation error:", err.message)
        }
      })
    }

    return NextResponse.json(contract, { status: 201 })
  } catch (error: any) {
    console.error("[contracts] POST error:", error.message)
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 })
  }
}

// PATCH /api/contracts - Update contract
export async function PATCH(req: NextRequest) {
  try {
    await ensureAllTables()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { success: rateOk } = rateLimit(`contracts-patch:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: "Contract ID is required" }, { status: 400 })

    const VALID_STATUSES = ["DRAFT", "SENT", "SIGNED", "EXPIRED", "CANCELLED"]

    const existing = await db.contract.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Contract not found" }, { status: 404 })

    // Validate status if provided
    if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 })
    }

    // Sanitize text fields
    const sanitized: Prisma.ContractUpdateInput = {}
    const textFields = ["title", "scopeOfWork", "paymentTerms", "paymentSchedule", "termsAndConditions", "amendments", "specialClauses", "clientName", "clientEmail", "clientCompany", "clientPhone", "clientAddress", "projectName", "projectDescription", "projectType", "projectMethod", "projectStartDate", "deliveryDate", "startDate", "endDate", "currency", "templateText", "templateFileName"]
    for (const key of textFields) {
      if (data[key] !== undefined) sanitized[key] = typeof data[key] === "string" ? deepSanitize(data[key]) : data[key]
    }
    if (data.totalValue !== undefined) {
      const val = Number(data.totalValue)
      sanitized.totalValue = (isNaN(val) || !isFinite(val)) ? 0 : val
    }

    const contract = await db.contract.update({
      where: { id },
      data: sanitized,
    })
    return NextResponse.json(contract)
  } catch (error: any) {
    console.error("[contracts] PATCH error:", error.message)
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 })
  }
}

// DELETE /api/contracts - Delete contract
export async function DELETE(req: NextRequest) {
  try {
    await ensureAllTables()
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { success: rateOk } = rateLimit(`contracts-delete:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: "Contract ID is required" }, { status: 400 })

    await db.contract.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[contracts] DELETE error:", error.message)
    return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 })
  }
}
