/**
 * Finance report engine.
 *
 * Gathers invoices / payments / expenses / subscriptions / earnings for a date
 * range (+ optional employee filter) and renders the report as PDF, XLSX or
 * DOCX. Reports are auto-saved to Google Drive under the Trishulhub Files tree
 * (Finance Reports → YYYY-MM) so they appear in the Files module automatically,
 * with no duplicate folders (folder is reused per month).
 */

import { db } from "@/lib/db"
import type { sheets_v4 } from "googleapis"
import { formatMoney } from "@/lib/money"
import { formatDisplayDate } from "@/lib/format"
import {
  ensureDriveFolder,
  ensureRootAndReview,
  uploadDriveFile,
  getDriveFileLink,
  importGoogleWorkspaceFile,
  getSheetsClient,
} from "@/lib/file-drive"

export type FinanceReportFormat = "pdf" | "xlsx" | "docx" | "sheets"

export type FinanceReportOptions = {
  from: Date
  to: Date
  userId?: string | null
  format: FinanceReportFormat
  generatedBy: string
}

export type FinanceReportRow = Record<string, unknown>

export type FinanceReportData = {
  period: { from: string; to: string }
  generatedAt: string
  generatedBy: string
  filterUser: string | null
  summary: {
    totalInvoiced: number
    totalPaid: number
    totalOutstanding: number
    totalExpenses: number
    totalSubscriptionsMonthly: number
    netProfit: number
  }
  invoices: FinanceReportRow[]
  payments: FinanceReportRow[]
  expenses: FinanceReportRow[]
  subscriptions: FinanceReportRow[]
  earnings: FinanceReportRow[]
  clients: { name: string; invoiced: number; paid: number }[]
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Load all finance data for a period (+ optional employee). */
export async function loadFinanceReportData(
  opts: FinanceReportOptions
): Promise<FinanceReportData> {
  const { from, to } = opts
  const endOfDay = new Date(to)
  endOfDay.setHours(23, 59, 59, 999)

  const [invoices, payments, expenses, subscriptions, earnings, salaryExpenses] =
    await Promise.all([
      db.invoice.findMany({
        where: { createdAt: { gte: from, lte: endOfDay } },
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.payment.findMany({
        where: { paidAt: { gte: from, lte: endOfDay } },
        include: { invoice: { select: { invoiceNumber: true, clientId: true } } },
        orderBy: { paidAt: "asc" },
      }),
      db.expense.findMany({
        where: {
          date: { gte: from, lte: endOfDay },
          ...(opts.userId ? { employeeId: opts.userId } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
        },
        orderBy: { date: "asc" },
      }),
      db.subscription.findMany({
        where: {
          OR: [
            { startDate: { lte: endOfDay }, endDate: { gte: from } },
            { startDate: { lte: endOfDay }, endDate: null },
          ],
        },
        orderBy: { startDate: "asc" },
      }),
      db.expense.findMany({
        where: {
          category: "SALARY",
          date: { gte: from, lte: endOfDay },
          ...(opts.userId ? { employeeId: opts.userId } : {}),
        },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      db.expense.findMany({
        where: {
          category: "SALARY",
          date: { gte: from, lte: endOfDay },
          ...(opts.userId ? { employeeId: opts.userId } : {}),
        },
        select: { amount: true, currency: true },
      }),
    ])

  let filterUser: string | null = null
  if (opts.userId) {
    const u = await db.user.findUnique({
      where: { id: opts.userId },
      select: { name: true },
    })
    filterUser = u?.name || opts.userId
  }

  const totalInvoiced = round2(
    invoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  )
  const totalPaid = round2(
    payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  )
  const totalOutstanding = round2(
    invoices
      .filter((i) => i.status !== "PAID")
      .reduce((s, i) => s + (Number(i.total) || 0), 0)
  )
  const totalExpenses = round2(
    expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  )
  const totalSubscriptionsMonthly = round2(
    subscriptions
      .filter((s) => s.status === "ACTIVE")
      .reduce((sum, s) => {
        const amt = Number(s.amount) || 0
        return sum + (s.frequency === "YEARLY" ? amt / 12 : s.frequency === "ONE_TIME" ? 0 : amt)
      }, 0)
  )
  const netProfit = round2(totalPaid - totalExpenses)

  const clientMap = new Map<string, { name: string; invoiced: number; paid: number }>()
  for (const inv of invoices) {
    const cid = inv.clientId
    const name = inv.client?.name || "Unknown"
    const entry = clientMap.get(cid) || { name, invoiced: 0, paid: 0 }
    entry.invoiced += Number(inv.total) || 0
    clientMap.set(cid, entry)
  }
  for (const p of payments) {
    const cid = p.invoice?.clientId
    if (!cid) continue
    const entry = clientMap.get(cid)
    if (entry) entry.paid += Number(p.amount) || 0
  }

  return {
    period: {
      from: formatDisplayDate(from),
      to: formatDisplayDate(to),
    },
    generatedAt: formatDisplayDate(new Date()),
    generatedBy: opts.generatedBy,
    filterUser,
    summary: {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalExpenses,
      totalSubscriptionsMonthly,
      netProfit,
    },
    invoices: invoices.map((i) => {
      let itemCount = 0
      try {
        const items = JSON.parse(i.items || "[]")
        itemCount = Array.isArray(items) ? items.length : 0
      } catch {
        /* not JSON — treat as no line items */
      }
      return {
        number: i.invoiceNumber,
        client: i.client?.name || "Unknown",
        date: formatDisplayDate(i.createdAt),
        status: i.status,
        currency: i.currency || "GBP",
        subtotal: Number(i.subtotal) || 0,
        tax: Number(i.tax) || 0,
        gst: Number(i.gst) || 0,
        total: Number(i.total) || 0,
        dueDate: i.dueDate ? formatDisplayDate(i.dueDate) : null,
        paidAt: i.paidAt ? formatDisplayDate(i.paidAt) : null,
        paymentMethod: i.paymentMethod || null,
        paymentStatus: i.paymentStatus || null,
        itemCount,
        project: i.project?.name || null,
        notes: i.notes || null,
      }
    }),
    payments: payments.map((p) => ({
      invoice: p.invoice?.invoiceNumber || "—",
      date: formatDisplayDate(p.paidAt),
      amount: Number(p.amount) || 0,
      method: p.method || "—",
      note: p.note || null,
    })),
    expenses: expenses.map((e) => ({
      date: formatDisplayDate(e.date),
      category: e.category,
      description: e.description,
      project: e.project?.name || null,
      employee: e.employee?.name || null,
      paymentRef: e.paymentRef || null,
      receiptUrl: e.receiptUrl || null,
      amount: Number(e.amount) || 0,
      currency: e.currency || "GBP",
    })),
    subscriptions: subscriptions.map((s) => ({
      service: s.service,
      category: s.category || null,
      amount: Number(s.amount) || 0,
      currency: s.currency || "GBP",
      frequency: s.frequency,
      status: s.status,
      startDate: formatDisplayDate(s.startDate),
      endDate: s.endDate ? formatDisplayDate(s.endDate) : null,
      notes: s.notes || null,
    })),
    earnings: earnings.map((e) => ({
      employee: e.employee?.name || "—",
      date: formatDisplayDate(e.date),
      amount: Number(e.amount) || 0,
      currency: e.currency || "GBP",
    })),
    clients: [...clientMap.values()]
      .map((c) => ({ ...c, invoiced: round2(c.invoiced), paid: round2(c.paid) }))
      .sort((a, b) => b.invoiced - a.invoiced),
  }
}

// ── PDF (pdfkit) ──
export async function renderFinancePdf(data: FinanceReportData): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default
  const chunks: Buffer[] = []
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 40, right: 40 },
    info: {
      Title: `Finance Report ${data.period.from} → ${data.period.to}`,
      Author: "TrishulHub",
      Subject: "Finance Report",
    },
  })
  doc.on("data", (c: Buffer) => chunks.push(c))

  const pageW = doc.page.width - 80
  doc.fontSize(18).font("Helvetica-Bold")
  doc.text("Finance Report", { align: "center" })
  doc.moveDown(0.2)
  doc.fontSize(9).font("Helvetica")
  doc.text(
    `Period: ${data.period.from} → ${data.period.to}` +
      (data.filterUser ? `   |   Employee: ${data.filterUser}` : "") +
      `   |   Generated: ${data.generatedAt} by ${data.generatedBy}`,
    { align: "center" }
  )
  doc.moveDown(0.4)
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke()
  doc.moveDown(0.5)

  const s = data.summary
  doc.fontSize(10).font("Helvetica-Bold")
  doc.text("Summary")
  doc.moveDown(0.2)
  doc.fontSize(9).font("Helvetica")
  const summaryRows: Array<[string, string]> = [
    ["Total invoiced", formatMoney(s.totalInvoiced)],
    ["Total paid", formatMoney(s.totalPaid)],
    ["Outstanding", formatMoney(s.totalOutstanding)],
    ["Total expenses", formatMoney(s.totalExpenses)],
    ["Subscriptions / month", formatMoney(s.totalSubscriptionsMonthly)],
    ["Net profit (paid − expenses)", formatMoney(s.netProfit)],
  ]
  for (const [label, value] of summaryRows) {
    doc.text(`${label}:  ${value}`, { width: pageW })
    doc.moveDown(0.1)
  }

  const drawTable = (
    title: string,
    headers: string[],
    rows: string[][],
    widths: number[]
  ) => {
    doc.moveDown(0.6)
    doc.fontSize(11).font("Helvetica-Bold")
    doc.text(title)
    doc.moveDown(0.2)
    doc.fontSize(7.5).font("Helvetica-Bold")
    let x = 40
    headers.forEach((h, i) => {
      doc.text(h, x, doc.y, { width: widths[i], align: i === 0 ? "left" : "right" })
      x += widths[i]
    })
    doc.moveDown(0.2)
    doc.font("Helvetica")
    for (const row of rows.slice(0, 60)) {
      let rx = 40
      row.forEach((cell, i) => {
        doc.text(String(cell).slice(0, 60), rx, doc.y, {
          width: widths[i],
          align: i === 0 ? "left" : "right",
        })
        rx += widths[i]
      })
      doc.moveDown(0.25)
    }
    if (rows.length > 60) {
      doc.moveDown(0.2)
      doc.text(`… and ${rows.length - 60} more rows`, { align: "center" })
    }
  }

  drawTable(
    "Invoices",
    ["Invoice", "Client", "Date", "Status", "Total"],
    data.invoices.map((r) => [
      String(r.number),
      String(r.client),
      String(r.date),
      String(r.status),
      formatMoney(Number(r.total) || 0),
    ]),
    [90, 130, 70, 60, 80]
  )
  drawTable(
    "Payments",
    ["Invoice", "Date", "Method", "Amount"],
    data.payments.map((r) => [
      String(r.invoice),
      String(r.date),
      String(r.method),
      formatMoney(Number(r.amount) || 0),
    ]),
    [110, 80, 130, 80]
  )
  drawTable(
    "Expenses",
    ["Date", "Category", "Description", "Project", "Amount"],
    data.expenses.map((r) => [
      String(r.date),
      String(r.category),
      String(r.description),
      String(r.project || r.employee || "—"),
      formatMoney(Number(r.amount) || 0),
    ]),
    [70, 80, 110, 100, 80]
  )
  drawTable(
    "Subscriptions",
    ["Service", "Amount", "Frequency", "Status"],
    data.subscriptions.map((r) => [
      String(r.service),
      formatMoney(Number(r.amount) || 0),
      String(r.frequency),
      String(r.status),
    ]),
    [160, 80, 80, 70]
  )
  if (data.earnings.length) {
    drawTable(
      "Employee earnings",
      ["Employee", "Date", "Amount"],
      data.earnings.map((r) => [
        String(r.employee),
        String(r.date),
        formatMoney(Number(r.amount) || 0),
      ]),
      [160, 100, 80]
    )
  }

  doc.end()
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

// ── XLSX (SheetJS) ──
export async function renderFinanceXlsx(data: FinanceReportData): Promise<Buffer> {
  const XLSX = (await import("xlsx")).default
  const s = data.summary
  const wb = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["TrishulHub — Finance Report"],
    [`Period: ${data.period.from} → ${data.period.to}`],
    [data.filterUser ? `Employee: ${data.filterUser}` : "All employees"],
    [`Generated: ${data.generatedAt} by ${data.generatedBy}`],
    [],
    ["Metric", "Value"],
    ["Total invoiced", s.totalInvoiced],
    ["Total paid", s.totalPaid],
    ["Outstanding", s.totalOutstanding],
    ["Total expenses", s.totalExpenses],
    ["Subscriptions / month", s.totalSubscriptionsMonthly],
    ["Net profit (paid − expenses)", s.netProfit],
  ])
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

  const invSheet = XLSX.utils.json_to_sheet(data.invoices)
  XLSX.utils.book_append_sheet(wb, invSheet, "Invoices")

  const paySheet = XLSX.utils.json_to_sheet(data.payments)
  XLSX.utils.book_append_sheet(wb, paySheet, "Payments")

  const expSheet = XLSX.utils.json_to_sheet(data.expenses)
  XLSX.utils.book_append_sheet(wb, expSheet, "Expenses")

  const subSheet = XLSX.utils.json_to_sheet(data.subscriptions)
  XLSX.utils.book_append_sheet(wb, subSheet, "Subscriptions")

  if (data.earnings.length) {
    const earnSheet = XLSX.utils.json_to_sheet(data.earnings)
    XLSX.utils.book_append_sheet(wb, earnSheet, "Earnings")
  }

  if (data.clients.length) {
    const clientSheet = XLSX.utils.json_to_sheet(data.clients)
    XLSX.utils.book_append_sheet(wb, clientSheet, "Clients")
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer
  return Buffer.from(buf)
}

// ── DOCX (docx) ──
export async function renderFinanceDocx(data: FinanceReportData): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } =
    await import("docx")
  const s = data.summary

  const header = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, bold: true, size: 26 })],
    })

  const table = (headers: string[], rows: (string | number)[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map(
            (h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
              })
          ),
        }),
        ...rows.map(
          (r) =>
            new TableRow({
              children: r.map(
                (c) =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: String(c) })] })],
                  })
              ),
            })
        ),
      ],
    })

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "TrishulHub — Finance Report", bold: true, size: 40 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Period: ${data.period.from} → ${data.period.to}${
                  data.filterUser ? `  ·  Employee: ${data.filterUser}` : ""
                }`,
                size: 22,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Generated: ${data.generatedAt} by ${data.generatedBy}`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          header("Summary"),
          table(
            ["Metric", "Value"],
            [
              ["Total invoiced", formatMoney(s.totalInvoiced)],
              ["Total paid", formatMoney(s.totalPaid)],
              ["Outstanding", formatMoney(s.totalOutstanding)],
              ["Total expenses", formatMoney(s.totalExpenses)],
              ["Subscriptions / month", formatMoney(s.totalSubscriptionsMonthly)],
              ["Net profit (paid − expenses)", formatMoney(s.netProfit)],
            ]
          ),
          new Paragraph({ text: "" }),
          header("Invoices"),
          table(
            ["Invoice", "Client", "Date", "Status", "Total"],
            data.invoices.map((r) => [
              String(r.number),
              String(r.client),
              String(r.date),
              String(r.status),
              formatMoney(Number(r.total) || 0),
            ])
          ),
          new Paragraph({ text: "" }),
          header("Payments"),
          table(
            ["Invoice", "Date", "Method", "Amount"],
            data.payments.map((r) => [
              String(r.invoice),
              String(r.date),
              String(r.method),
              formatMoney(Number(r.amount) || 0),
            ])
          ),
          new Paragraph({ text: "" }),
          header("Expenses"),
          table(
            ["Date", "Category", "Description", "Project", "Amount"],
            data.expenses.map((r) => [
              String(r.date),
              String(r.category),
              String(r.description),
              String(r.project || r.employee || "—"),
              formatMoney(Number(r.amount) || 0),
            ])
          ),
          new Paragraph({ text: "" }),
          header("Subscriptions"),
          table(
            ["Service", "Amount", "Frequency", "Status"],
            data.subscriptions.map((r) => [
              String(r.service),
              formatMoney(Number(r.amount) || 0),
              String(r.frequency),
              String(r.status),
            ])
          ),
          ...(data.earnings.length
            ? [
                new Paragraph({ text: "" }),
                header("Employee earnings"),
                table(
                  ["Employee", "Date", "Amount"],
                  data.earnings.map((r) => [
                    String(r.employee),
                    String(r.date),
                    formatMoney(Number(r.amount) || 0),
                  ])
                ),
              ]
            : []),
        ],
      },
    ],
  })

  const buf = await Packer.toBuffer(doc)
  return Buffer.from(buf)
}

// ── Drive / Files auto-save ──
const FINANCE_DEPT_NAME = "Finance Reports"

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Ensure the Finance Reports department + monthly folder exist in the Files tree
 * AND on Google Drive. Reuses existing nodes so folders never duplicate.
 */
export async function ensureFinanceReportFolder(
  monthKey: string
): Promise<{ departmentNodeId: string; monthNodeId: string; monthDriveId: string }> {
  const now = new Date()
  const { rootFolderId } = await ensureRootAndReview()

  // Department (root-level, under Trishulhub Files root)
  let dept = (
    await db.$queryRawUnsafe(
      `SELECT "id","driveFolderId" FROM "FileNode"
       WHERE "kind" = 'DEPARTMENT' AND "name" = ? AND "deletedAt" IS NULL LIMIT 1`,
      FINANCE_DEPT_NAME
    )
  ) as Array<{ id: string; driveFolderId: string | null }>

  let departmentNodeId: string
  let departmentDriveId: string
  if (dept[0]) {
    departmentNodeId = dept[0].id
    departmentDriveId = dept[0].driveFolderId || ""
    if (!departmentDriveId) {
      departmentDriveId = await ensureDriveFolder(FINANCE_DEPT_NAME, rootFolderId)
      await db.$executeRawUnsafe(
        `UPDATE "FileNode" SET "driveFolderId" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        departmentDriveId,
        departmentNodeId
      )
    }
  } else {
    departmentDriveId = await ensureDriveFolder(FINANCE_DEPT_NAME, rootFolderId)
    departmentNodeId = newId("fn")
    await db.$executeRawUnsafe(
      `INSERT INTO "FileNode" ("id","kind","name","parentId","driveFolderId","isPrivate","sortOrder","createdById","createdAt","updatedAt")
       VALUES (?,?,?,?,?,0,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      departmentNodeId,
      "DEPARTMENT",
      FINANCE_DEPT_NAME,
      null,
      departmentDriveId,
      "system"
    )
  }

  // Keep Drive access repaired for existing and newly created Finance Reports
  // departments, so both SUPER_ADMIN and ADMIN users can open generated files.
    try {
      const { shareNewDepartmentWithAdmins } = await import("@/lib/file-drive-acl")
      await shareNewDepartmentWithAdmins(departmentNodeId)
    } catch (e) {
      console.warn("[finance-report] admin Drive share failed", e)
    }

  // Monthly category folder under Finance Reports
  let month = (
    await db.$queryRawUnsafe(
      `SELECT "id","driveFolderId" FROM "FileNode"
       WHERE "kind" = 'CATEGORY' AND "name" = ? AND "parentId" = ? AND "deletedAt" IS NULL LIMIT 1`,
      monthKey,
      departmentNodeId
    )
  ) as Array<{ id: string; driveFolderId: string | null }>

  let monthNodeId: string
  let monthDriveId: string
  if (month[0]) {
    monthNodeId = month[0].id
    monthDriveId = month[0].driveFolderId || ""
    if (!monthDriveId) {
      monthDriveId = await ensureDriveFolder(monthKey, departmentDriveId)
      await db.$executeRawUnsafe(
        `UPDATE "FileNode" SET "driveFolderId" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        monthDriveId,
        monthNodeId
      )
    }
  } else {
    monthDriveId = await ensureDriveFolder(monthKey, departmentDriveId)
    monthNodeId = newId("fn")
    await db.$executeRawUnsafe(
      `INSERT INTO "FileNode" ("id","kind","name","parentId","driveFolderId","isPrivate","sortOrder","createdById","createdAt","updatedAt")
       VALUES (?,?,?,?,?,0,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      monthNodeId,
      "CATEGORY",
      monthKey,
      departmentNodeId,
      monthDriveId,
      "system"
    )
  }

  void now
  return { departmentNodeId, monthNodeId, monthDriveId }
}

/**
 * Upload the generated report to Drive + Files tree. Returns the FileItem row
 * and Drive links. Checks for an existing file with the same name in the month
 * folder and returns it instead of duplicating.
 */
export async function saveFinanceReportToDrive(opts: {
  fileName: string
  mimeType: string
  buffer: Buffer
  monthKey: string
  generatedBy: string
}): Promise<{
  fileItemId: string
  webViewLink: string | null
  folderUrl: string
  reused: boolean
}> {
  const { monthNodeId, monthDriveId } = await ensureFinanceReportFolder(opts.monthKey)

  // No duplicates: if a file with this exact name exists in the month folder, return it.
  const existing = (await db.$queryRawUnsafe(
    `SELECT "id","driveFileId","webViewLink" FROM "FileItem"
     WHERE "nodeId" = ? AND "name" = ? AND "deletedAt" IS NULL LIMIT 1`,
    monthNodeId,
    opts.fileName
  )) as Array<{ id: string; driveFileId: string | null; webViewLink: string | null }>
  if (existing[0]) {
    const driveLink =
      existing[0].webViewLink || getDriveFileLink(existing[0].driveFileId || existing[0].id)
    return {
      fileItemId: existing[0].id,
      webViewLink: driveLink,
      folderUrl: `https://drive.google.com/drive/folders/${monthDriveId}`,
      reused: true,
    }
  }

  const uploaded = await uploadDriveFile({
    name: opts.fileName,
    mimeType: opts.mimeType,
    parentId: monthDriveId,
    body: opts.buffer,
  })

  const fileItemId = newId("fi")
  await db.$executeRawUnsafe(
    `INSERT INTO "FileItem" ("id","nodeId","name","mimeType","sizeBytes","driveFileId","webViewLink","createdById","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    fileItemId,
    monthNodeId,
    opts.fileName,
    opts.mimeType,
    opts.buffer.length,
    uploaded.id,
    uploaded.webViewLink || null,
    opts.generatedBy
  )

  return {
    fileItemId,
    webViewLink: uploaded.webViewLink || getDriveFileLink(uploaded.id),
    folderUrl: `https://drive.google.com/drive/folders/${monthDriveId}`,
    reused: false,
  }
}

// ── Native Google Sheets ──

export const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet"

type FinanceSheetTab = {
  title: string
  headers: string[]
  rows: unknown[][]
}

/** Build the tab layout for a native Google Sheet with full transaction detail. */
export function buildFinanceSheetTabs(data: FinanceReportData): FinanceSheetTab[] {
  const s = data.summary
  const tabs: FinanceSheetTab[] = [
    {
      title: "Summary",
      headers: ["Metric", "Value"],
      rows: [
        ["Total invoiced", s.totalInvoiced],
        ["Total paid", s.totalPaid],
        ["Outstanding", s.totalOutstanding],
        ["Total expenses", s.totalExpenses],
        ["Subscriptions / month", s.totalSubscriptionsMonthly],
        ["Net profit (paid − expenses)", s.netProfit],
        [],
        ["Period", `${data.period.from} → ${data.period.to}`],
        ["Employee filter", data.filterUser || "All employees"],
        ["Generated", `${data.generatedAt} by ${data.generatedBy}`],
      ],
    },
    {
      title: "Invoices",
      headers: [
        "Invoice No.",
        "Client",
        "Date",
        "Status",
        "Currency",
        "Subtotal",
        "Tax",
        "GST",
        "Total",
        "Due Date",
        "Paid Date",
        "Payment Method",
        "Payment Status",
        "Items",
        "Project",
        "Notes",
      ],
      rows: data.invoices.map((r) => [
        r.number,
        r.client,
        r.date,
        r.status,
        r.currency,
        r.subtotal,
        r.tax,
        r.gst,
        r.total,
        r.dueDate,
        r.paidAt,
        r.paymentMethod,
        r.paymentStatus,
        r.itemCount,
        r.project,
        r.notes,
      ]),
    },
    {
      title: "Payments",
      headers: ["Invoice", "Date", "Method", "Amount", "Note"],
      rows: data.payments.map((r) => [r.invoice, r.date, r.method, r.amount, r.note]),
    },
    {
      title: "Expenses",
      headers: [
        "Date",
        "Category",
        "Description",
        "Project",
        "Employee",
        "Payment Ref",
        "Receipt URL",
        "Amount",
        "Currency",
      ],
      rows: data.expenses.map((r) => [
        r.date,
        r.category,
        r.description,
        r.project,
        r.employee,
        r.paymentRef,
        r.receiptUrl,
        r.amount,
        r.currency,
      ]),
    },
    {
      title: "Subscriptions",
      headers: [
        "Service",
        "Category",
        "Amount",
        "Currency",
        "Frequency",
        "Status",
        "Start Date",
        "End Date",
        "Notes",
      ],
      rows: data.subscriptions.map((r) => [
        r.service,
        r.category,
        r.amount,
        r.currency,
        r.frequency,
        r.status,
        r.startDate,
        r.endDate,
        r.notes,
      ]),
    },
  ]

  if (data.earnings.length) {
    tabs.push({
      title: "Earnings",
      headers: ["Employee", "Date", "Amount", "Currency"],
      rows: data.earnings.map((r) => [r.employee, r.date, r.amount, r.currency]),
    })
  }

  if (data.clients.length) {
    tabs.push({
      title: "Clients",
      headers: ["Client", "Invoiced", "Paid"],
      rows: data.clients.map((c) => [c.name, c.invoiced, c.paid]),
    })
  }

  return tabs
}

/**
 * Create the sheet tabs, write all values and format header rows in a native
 * Google Sheet. Tabs are created first (Summary first), the default empty sheet
 * is removed, then values are written and headers bolded + frozen.
 */
export async function populateFinanceSheet(
  spreadsheetId: string,
  tabs: FinanceSheetTab[]
): Promise<void> {
  const sheets = await getSheetsClient()

  const addRequests: sheets_v4.Schema$Request[] = tabs.map((t, i) => ({
    addSheet: {
      properties: {
        title: t.title,
        index: i,
        gridProperties: { frozenRowCount: 1 },
      },
    },
  }))
  addRequests.push({ deleteSheet: { sheetId: 0 } })

  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: addRequests },
  })
  const sheetIds = (created.data.replies || [])
    .slice(0, tabs.length)
    .map((r, i) => {
      const sid = r.addSheet?.properties?.sheetId
      if (typeof sid !== "number") {
        throw new Error(`Sheets API did not return an id for tab "${tabs[i].title}"`)
      }
      return sid
    })

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: tabs.map((t) => ({
        range: `'${t.title}'!A1`,
        values: [t.headers, ...t.rows],
      })),
    },
  })

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: tabs.map((t, i): sheets_v4.Schema$Request => ({
        updateCells: {
          range: {
            sheetId: sheetIds[i],
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: t.headers.length,
          },
          rows: [
            {
              values: t.headers.map(() => ({
                userEnteredFormat: { textFormat: { bold: true } },
              })),
            },
          ],
          fields: "userEnteredFormat.textFormat.bold",
        },
      })),
    },
  })
}

/**
 * Create a native Google Sheet for the period, populate it with all finance
 * data and save it under Finance Reports → YYYY-MM in the Files tree + Drive.
 * Reuses an existing sheet with the same name so nothing is duplicated.
 */
export async function saveFinanceSheetToDrive(opts: {
  fileName: string
  monthKey: string
  generatedBy: string
  data: FinanceReportData
}): Promise<{
  fileItemId: string
  spreadsheetId: string
  webViewLink: string | null
  folderUrl: string
  reused: boolean
}> {
  const { monthNodeId, monthDriveId } = await ensureFinanceReportFolder(opts.monthKey)

  const existing = (await db.$queryRawUnsafe(
    `SELECT "id","driveFileId","webViewLink" FROM "FileItem"
     WHERE "nodeId" = ? AND "name" = ? AND "deletedAt" IS NULL LIMIT 1`,
    monthNodeId,
    opts.fileName
  )) as Array<{ id: string; driveFileId: string | null; webViewLink: string | null }>
  if (existing[0]) {
    const driveLink =
      existing[0].webViewLink || getDriveFileLink(existing[0].driveFileId || existing[0].id)
    return {
      fileItemId: existing[0].id,
      spreadsheetId: existing[0].driveFileId || existing[0].id,
      webViewLink: driveLink,
      folderUrl: `https://drive.google.com/drive/folders/${monthDriveId}`,
      reused: true,
    }
  }

  // Import the generated workbook as a native Google Sheet via Drive API.
  // This works with the existing Drive connection even when Sheets API is
  // disabled in the connected Google Cloud project.
  const workbook = await renderFinanceXlsx(opts.data)
  const created = await importGoogleWorkspaceFile({
    name: opts.fileName,
    sourceMimeType: FINANCE_REPORT_MIME.xlsx,
    targetMimeType: GOOGLE_SHEETS_MIME,
    parentId: monthDriveId,
    body: workbook,
  })

  const fileItemId = newId("fi")
  await db.$executeRawUnsafe(
    `INSERT INTO "FileItem" ("id","nodeId","name","mimeType","sizeBytes","driveFileId","webViewLink","createdById","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    fileItemId,
    monthNodeId,
    opts.fileName,
    GOOGLE_SHEETS_MIME,
    0,
    created.id,
    created.webViewLink || null,
    opts.generatedBy
  )

  return {
    fileItemId,
    spreadsheetId: created.id,
    webViewLink: created.webViewLink || getDriveFileLink(created.id),
    folderUrl: `https://drive.google.com/drive/folders/${monthDriveId}`,
    reused: false,
  }
}

/** Month folder key e.g. "2026-08". */
export function financeMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export const FINANCE_REPORT_MIME: Record<FinanceReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  sheets: GOOGLE_SHEETS_MIME,
}
