import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessFinance } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  loadFinanceReportData,
  renderFinancePdf,
  renderFinanceXlsx,
  renderFinanceDocx,
  saveFinanceReportToDrive,
  saveFinanceSheetToDrive,
  financeMonthKey,
  FINANCE_REPORT_MIME,
  type FinanceReportFormat,
} from "@/lib/finance-report"

const VALID_FORMATS: FinanceReportFormat[] = ["pdf", "docx", "sheets"]

/**
 * GET /api/finance/reports
 * List generated finance reports (stored under Finance Reports → YYYY-MM).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canAccessFinance(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rows = (await db.$queryRawUnsafe(
      `SELECT f.id, f.name, f."mimeType", f."webViewLink", f."sizeBytes", f."createdAt",
              n.name AS folderName
       FROM "FileItem" f
       INNER JOIN "FileNode" n ON n."id" = f."nodeId"
       INNER JOIN "FileNode" d ON d."id" = n."parentId"
       WHERE d."kind" = 'DEPARTMENT' AND d."name" = 'Finance Reports'
         AND f."deletedAt" IS NULL AND n."deletedAt" IS NULL
       ORDER BY f."createdAt" DESC
       LIMIT 100`
    )) as Array<{
      id: string
      name: string
      mimeType: string | null
      webViewLink: string | null
      sizeBytes: number
      createdAt: string
      folderName: string
    }>

    return NextResponse.json({
      reports: rows.map((r) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mimeType,
        url: r.webViewLink,
        size: r.sizeBytes,
        createdAt: r.createdAt,
        folder: r.folderName,
      })),
    })
  } catch (err) {
    console.error("[finance/reports] GET", err)
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 })
  }
}

/**
 * POST /api/finance/reports
 * Generate a finance report for a date range (+ optional employee) as PDF,
 * Google Sheets or a Google Docs-compatible DOCX
 * and auto-save it to Google Drive + the Files module (Finance Reports → YYYY-MM).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canAccessFinance(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`finance-report-${session.user.id}`, RATE_LIMITS.financeWrite.limit, RATE_LIMITS.financeWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const fromRaw = String(body.from || "")
    const toRaw = String(body.to || "")
    const formatRaw = String(body.format || "pdf") as FinanceReportFormat
    const userIdRaw = body.userId ? String(body.userId) : null

    if (!fromRaw || !toRaw) {
      return NextResponse.json({ error: "from and to dates are required" }, { status: 400 })
    }
    const from = new Date(fromRaw)
    const to = new Date(toRaw)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
    }
    if (from > to) {
      return NextResponse.json({ error: "From date must be before To date" }, { status: 400 })
    }
    if (!VALID_FORMATS.includes(formatRaw)) {
      return NextResponse.json(
        { error: "Invalid format. Choose PDF, Google Sheets or Google Docs" },
        { status: 400 }
      )
    }
    if (userIdRaw && !/^[a-zA-Z0-9_-]{1,100}$/.test(userIdRaw)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
    }

    const data = await loadFinanceReportData({
      from,
      to,
      userId: userIdRaw,
      format: formatRaw,
      generatedBy: session.user.name || session.user.email || "system",
    })

    const buffer =
      formatRaw === "pdf"
        ? await renderFinancePdf(data)
        : formatRaw === "xlsx"
          ? await renderFinanceXlsx(data)
          : formatRaw === "sheets"
            ? null
            : await renderFinanceDocx(data)

    const monthKey = financeMonthKey(from)
    const dateLabel = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(
      from.getDate()
    ).padStart(2, "0")}_to_${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(
      to.getDate()
    ).padStart(2, "0")}`
    const employeeTag = userIdRaw ? `_${data.filterUser?.replace(/\s+/g, "_") || "employee"}` : ""
    const fileName = `Finance_Report_${dateLabel}${employeeTag}${
      formatRaw === "sheets" ? "" : `.${formatRaw}`
    }`

    const saved =
      formatRaw === "sheets"
        ? await saveFinanceSheetToDrive({
            fileName,
            monthKey,
            generatedBy: session.user.id,
            data,
          })
        : await saveFinanceReportToDrive({
            fileName,
            mimeType: FINANCE_REPORT_MIME[formatRaw],
            buffer: buffer!,
            monthKey,
            generatedBy: session.user.id,
          })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "BUSINESS",
      page: "finance",
      action: "EXPORT",
      entityType: "FinanceReport",
      entityId: saved.fileItemId,
      description: `Generated ${formatRaw.toUpperCase()} finance report ${data.period.from} → ${data.period.to}${
        data.filterUser ? ` for ${data.filterUser}` : ""
      }`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      ok: true,
      report: {
        id: saved.fileItemId,
        name: fileName,
        url: saved.webViewLink,
        folderUrl: saved.folderUrl,
        reused: saved.reused,
      },
      summary: data.summary,
      counts: {
        invoices: data.invoices.length,
        payments: data.payments.length,
        expenses: data.expenses.length,
        subscriptions: data.subscriptions.length,
        earnings: data.earnings.length,
      },
    })
  } catch (err) {
    console.error("[finance/reports] POST", err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "Failed to generate finance report",
      },
      { status: 500 }
    )
  }
}
