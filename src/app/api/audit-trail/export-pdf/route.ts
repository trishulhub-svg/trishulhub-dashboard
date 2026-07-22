import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { canExportAuditTrail, getAccessibleDepartments } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { AUDIT_DEPARTMENTS, type AuditDepartment } from "@/lib/audit-log"

// GET /api/audit-trail/export-pdf — Export as PDF
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!canExportAuditTrail(userRole)) {
      return NextResponse.json({ error: "Forbidden — PDF export requires SUPER_ADMIN or ADMIN" }, { status: 403 })
    }

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`audit-trail-pdf:${userId}`, RATE_LIMITS.financeWrite.limit, RATE_LIMITS.financeWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const department = searchParams.get("department") || ""
    const page = searchParams.get("page") || ""
    const action = searchParams.get("action") || ""
    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""

    const accessibleDepts = getAccessibleDepartments(userRole, session.user.department || undefined)

    const where: Prisma.AuditLogWhereInput = {
      department: department ? department : { in: accessibleDepts },
    }
    if (page) where.page = page
    if (action) where.action = action
    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.createdAt = dateFilter
    }

    // Fetch logs (max 5000 for PDF)
    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    })

    const total = await db.auditLog.count({ where })

    // Build PDF using pdfkit
    const PDFDocument = (await import("pdfkit")).default
    const chunks: Buffer[] = []

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      info: {
        Title: `Audit Trail Report - ${department || "All Departments"}`,
        Author: "TrishulHub CRM",
        Subject: "Audit Trail Export",
        CreationDate: new Date(),
      },
    })

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))

    const pageWidth = doc.page.width - 80

    // ── Header ──
    doc.fontSize(20).font("Helvetica-Bold")
    doc.text("Audit Trail Report", { align: "center" })
    doc.moveDown(0.3)

    doc.fontSize(10).font("Helvetica")
    const deptLabel = department ? (AUDIT_DEPARTMENTS[department as AuditDepartment]?.label || department) : "All Departments"
    const dateLabel = startDate && endDate
      ? `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
      : new Date().toLocaleDateString()

    doc.text(`Department: ${deptLabel}  |  Period: ${dateLabel}  |  Total: ${total.toLocaleString()} entries`, { align: "center" })
    doc.text(`Generated: ${new Date().toLocaleString()}  |  Exported by: ${session.user.name || session.user.email}`, { align: "center" })
    doc.moveDown(0.5)

    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke()
    doc.moveDown(0.5)

    // ── Department Summary ──
    const deptCounts: Record<string, number> = {}
    logs.forEach(log => {
      deptCounts[log.department] = (deptCounts[log.department] || 0) + 1
    })

    doc.fontSize(12).font("Helvetica-Bold").text("Summary")
    doc.moveDown(0.3)

    doc.fontSize(9).font("Helvetica")
    Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).forEach(([dept, count]) => {
      const label = AUDIT_DEPARTMENTS[dept as AuditDepartment]?.label || dept
      doc.text(`${label}: ${count.toLocaleString()} entries`, { indent: 10 })
    })
    doc.moveDown(0.3)

    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke()
    doc.moveDown(0.5)

    // ── Table ──
    const columns = [
      { header: "Date", width: 80 },
      { header: "User", width: 70 },
      { header: "Action", width: 55 },
      { header: "Department", width: 65 },
      { header: "Page", width: 55 },
      { header: "Description", width: 165 },
      { header: "Status", width: 50 },
    ]

    const tableX = 40
    let tableY = doc.y
    const rowHeight = 16
    const headerHeight = 20

    if (tableY + headerHeight + rowHeight * 3 > doc.page.height - 50) {
      doc.addPage()
      tableY = doc.y
    }

    function drawTableHeader(tY: number): number {
      let xPos = tableX
      doc.rect(tableX, tY, pageWidth, headerHeight).fill("#1e293b")
      columns.forEach(col => {
        doc.fontSize(7).font("Helvetica-Bold").fillColor("#ffffff")
        doc.text(col.header, xPos + 3, tY + 5, { width: col.width - 6, height: headerHeight })
        xPos += col.width
      })
      doc.fillColor("#000000")
      return tY + headerHeight
    }

    tableY = drawTableHeader(tableY)

    logs.forEach((log, i) => {
      if (tableY + rowHeight > doc.page.height - 50) {
        doc.addPage()
        tableY = 50
        tableY = drawTableHeader(tableY)
      }

      if (i % 2 === 0) {
        doc.rect(tableX, tableY, pageWidth, rowHeight).fill("#f8fafc")
      }

      let xPos = tableX
      const dateStr = log.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      const timeStr = log.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

      const rowCells = [
        `${dateStr} ${timeStr}`,
        log.userName.length > 15 ? log.userName.slice(0, 14) + ".." : log.userName,
        log.action,
        (AUDIT_DEPARTMENTS[log.department as AuditDepartment]?.label || log.department).slice(0, 10),
        log.page.slice(0, 10),
        log.description.length > 50 ? log.description.slice(0, 49) + ".." : log.description,
        log.status,
      ]

      doc.fontSize(7).font("Helvetica")
      rowCells.forEach((cell, ci) => {
        doc.fillColor("#334155")
        doc.text(cell, xPos + 3, tableY + 4, { width: columns[ci].width - 6, height: rowHeight - 2 })
        xPos += columns[ci].width
      })

      tableY += rowHeight
    })

    // ── Footer ──
    if (tableY + 40 > doc.page.height - 40) {
      doc.addPage()
    }
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke()
    doc.moveDown(0.5)
    doc.fontSize(8).font("Helvetica").fillColor("#94a3b8")
    doc.text(`Report contains ${logs.length.toLocaleString()} of ${total.toLocaleString()} total entries.`, { align: "center" })
    doc.text("Confidential — TrishulHub CRM Audit System", { align: "center" })

    doc.end()

    return new Promise<NextResponse>((resolve) => {
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks)
        resolve(new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="audit-trail-${deptLabel.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf"`,
            "Content-Length": String(pdfBuffer.length),
          },
        }))
      })
    })
  } catch (error: unknown) {
    console.error("[audit-trail-pdf] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to generate PDF report" }, { status: 500 })
  }
}
