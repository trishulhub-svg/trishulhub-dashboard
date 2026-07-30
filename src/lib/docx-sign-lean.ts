/**
 * Lean Docx Sign list helpers — never select PDF/signature TEXT blobs for list UIs.
 */
import { db } from "@/lib/db"

export type LeanMyAssignment = {
  id: string
  status: string
  signedAt: Date | string | null
  resignNote: string | null
  hasSignature: boolean
  hasSignedPdf: boolean
  authorizedPersonName: string | null
  createdAt: Date | string
  document: { id: string; title: string; fileName: string; createdAt?: Date | string }
  assignedBy: { id: string; name: string }
}

type RawMyRow = {
  id: string
  status: string
  signedAt: string | null
  resignNote: string | null
  hasSignature: number | bigint
  hasSignedPdf: number | bigint
  authorizedPersonName: string | null
  createdAt: string
  documentId: string
  documentTitle: string
  documentFileName: string
  documentCreatedAt: string
  assignedById: string
  assignedByName: string
}

function mapMyRow(r: RawMyRow): LeanMyAssignment {
  return {
    id: r.id,
    status: r.status,
    signedAt: r.signedAt,
    resignNote: r.resignNote,
    hasSignature: Number(r.hasSignature) === 1,
    hasSignedPdf: Number(r.hasSignedPdf) === 1,
    authorizedPersonName: r.authorizedPersonName || r.assignedByName,
    createdAt: r.createdAt,
    document: {
      id: r.documentId,
      title: r.documentTitle,
      fileName: r.documentFileName,
      createdAt: r.documentCreatedAt,
    },
    assignedBy: { id: r.assignedById, name: r.assignedByName },
  }
}

/** List assignments for a user without loading signature/PDF blobs. */
export async function listMyAssignmentsLean(
  userId: string,
  opts?: { take?: number; statuses?: string[] }
): Promise<LeanMyAssignment[]> {
  const take = Math.min(Math.max(opts?.take ?? 100, 1), 200)
  const statuses = opts?.statuses?.filter(Boolean) || []

  if (statuses.length > 0) {
    const placeholders = statuses.map(() => "?").join(",")
    const rows = (await db.$queryRawUnsafe(
      `SELECT a."id" as id, a."status" as status, a."signedAt" as signedAt, a."resignNote" as resignNote,
        CASE WHEN a."signatureData" IS NOT NULL AND length(a."signatureData") > 10 THEN 1 ELSE 0 END as hasSignature,
        CASE WHEN a."signedFileData" IS NOT NULL AND length(a."signedFileData") > 10 THEN 1 ELSE 0 END as hasSignedPdf,
        a."authorizedPersonName" as authorizedPersonName, a."createdAt" as createdAt,
        d."id" as documentId, d."title" as documentTitle, d."fileName" as documentFileName, d."createdAt" as documentCreatedAt,
        ab."id" as assignedById, ab."name" as assignedByName
       FROM "DocxAssignment" a
       INNER JOIN "DocxDocument" d ON d."id" = a."documentId"
       INNER JOIN "User" ab ON ab."id" = a."assignedById"
       WHERE a."userId" = ? AND d."isActive" = 1 AND a."status" IN (${placeholders})
       ORDER BY a."createdAt" DESC
       LIMIT ?`,
      userId,
      ...statuses,
      take
    )) as RawMyRow[]
    return rows.map(mapMyRow)
  }

  const rows = (await db.$queryRawUnsafe(
    `SELECT a."id" as id, a."status" as status, a."signedAt" as signedAt, a."resignNote" as resignNote,
      CASE WHEN a."signatureData" IS NOT NULL AND length(a."signatureData") > 10 THEN 1 ELSE 0 END as hasSignature,
      CASE WHEN a."signedFileData" IS NOT NULL AND length(a."signedFileData") > 10 THEN 1 ELSE 0 END as hasSignedPdf,
      a."authorizedPersonName" as authorizedPersonName, a."createdAt" as createdAt,
      d."id" as documentId, d."title" as documentTitle, d."fileName" as documentFileName, d."createdAt" as documentCreatedAt,
      ab."id" as assignedById, ab."name" as assignedByName
     FROM "DocxAssignment" a
     INNER JOIN "DocxDocument" d ON d."id" = a."documentId"
     INNER JOIN "User" ab ON ab."id" = a."assignedById"
     WHERE a."userId" = ? AND d."isActive" = 1
     ORDER BY a."createdAt" DESC
     LIMIT ?`,
    userId,
    take
  )) as RawMyRow[]
  return rows.map(mapMyRow)
}

/** Single assignment metadata for the sign page — no blobs. */
export async function getAssignmentLeanById(
  assignmentId: string,
  userId: string
): Promise<LeanMyAssignment | null> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT a."id" as id, a."status" as status, a."signedAt" as signedAt, a."resignNote" as resignNote,
      CASE WHEN a."signatureData" IS NOT NULL AND length(a."signatureData") > 10 THEN 1 ELSE 0 END as hasSignature,
      CASE WHEN a."signedFileData" IS NOT NULL AND length(a."signedFileData") > 10 THEN 1 ELSE 0 END as hasSignedPdf,
      a."authorizedPersonName" as authorizedPersonName, a."createdAt" as createdAt,
      d."id" as documentId, d."title" as documentTitle, d."fileName" as documentFileName, d."createdAt" as documentCreatedAt,
      ab."id" as assignedById, ab."name" as assignedByName
     FROM "DocxAssignment" a
     INNER JOIN "DocxDocument" d ON d."id" = a."documentId"
     INNER JOIN "User" ab ON ab."id" = a."assignedById"
     WHERE a."id" = ? AND a."userId" = ? AND d."isActive" = 1
     LIMIT 1`,
    assignmentId,
    userId
  )) as RawMyRow[]
  return rows[0] ? mapMyRow(rows[0]) : null
}

export type LeanDocAssignment = {
  id: string
  userId: string
  status: string
  signedAt: Date | string | null
  resignNote: string | null
  authorizedPersonName: string | null
  signerIp: string | null
  signerCountry: string | null
  user: { id: string; name: string; email: string }
  assignedBy: { id: string; name: string }
}

/** Assignees for one document — metadata only. */
export async function listDocumentAssignmentsLean(
  documentId: string
): Promise<LeanDocAssignment[]> {
  type Raw = {
    id: string
    userId: string
    status: string
    signedAt: string | null
    resignNote: string | null
    authorizedPersonName: string | null
    signerIp: string | null
    signerCountry: string | null
    userName: string
    userEmail: string
    assignedById: string
    assignedByName: string
  }
  const rows = (await db.$queryRawUnsafe(
    `SELECT a."id" as id, a."userId" as userId, a."status" as status, a."signedAt" as signedAt,
      a."resignNote" as resignNote, a."authorizedPersonName" as authorizedPersonName,
      a."signerIp" as signerIp, a."signerCountry" as signerCountry,
      u."name" as userName, u."email" as userEmail,
      ab."id" as assignedById, ab."name" as assignedByName
     FROM "DocxAssignment" a
     INNER JOIN "User" u ON u."id" = a."userId"
     INNER JOIN "User" ab ON ab."id" = a."assignedById"
     WHERE a."documentId" = ?
     ORDER BY a."createdAt" DESC
     LIMIT 200`,
    documentId
  )) as Raw[]
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    status: r.status,
    signedAt: r.signedAt,
    resignNote: r.resignNote,
    authorizedPersonName: r.authorizedPersonName || r.assignedByName,
    signerIp: r.signerIp,
    signerCountry: r.signerCountry,
    user: { id: r.userId, name: r.userName, email: r.userEmail },
    assignedBy: { id: r.assignedById, name: r.assignedByName },
  }))
}
