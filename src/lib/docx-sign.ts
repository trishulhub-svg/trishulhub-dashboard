/**
 * Docx Sign helpers — PDF stamp + validation for e-signature contracts.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

export const DOCX_SIGN_STATUSES = ["PENDING", "SIGNED", "RESIGN_REQUESTED"] as const
export type DocxSignStatus = (typeof DOCX_SIGN_STATUSES)[number]

/** Soft limit for Turso TEXT — ~4MB base64 payload */
export const MAX_PDF_DATA_URL_CHARS = 5_500_000
export const MAX_SIGNATURE_DATA_URL_CHARS = 900_000

export function isAdminDocxRole(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

export function parsePdfDataUrl(raw: string): { bytes: Uint8Array; dataUrl: string } | null {
  const trimmed = (raw || "").trim()
  if (!trimmed.startsWith("data:application/pdf;base64,")) return null
  if (trimmed.length > MAX_PDF_DATA_URL_CHARS) return null
  const b64 = trimmed.slice("data:application/pdf;base64,".length)
  try {
    const bin = Buffer.from(b64, "base64")
    if (bin.length < 100) return null
    // PDF magic
    if (bin[0] !== 0x25 || bin[1] !== 0x50 || bin[2] !== 0x44 || bin[3] !== 0x46) return null
    return { bytes: new Uint8Array(bin), dataUrl: trimmed }
  } catch {
    return null
  }
}

export function parsePngDataUrl(raw: string): Uint8Array | null {
  const trimmed = (raw || "").trim()
  if (!trimmed.startsWith("data:image/png;base64,")) return null
  if (trimmed.length > MAX_SIGNATURE_DATA_URL_CHARS) return null
  try {
    const bin = Buffer.from(trimmed.slice("data:image/png;base64,".length), "base64")
    if (bin.length < 32) return null
    return new Uint8Array(bin)
  } catch {
    return null
  }
}

/** Stamp signature PNG onto the last page (bottom signature box area). */
export async function stampSignatureOnPdf(
  pdfBytes: Uint8Array,
  signaturePng: Uint8Array,
  meta: { signerName: string; signedAtIso: string }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes)
  const pages = pdf.getPages()
  const last = pages[pages.length - 1]
  if (!last) throw new Error("PDF has no pages")

  const png = await pdf.embedPng(signaturePng)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const { width } = last.getSize()
  const sigW = Math.min(220, width * 0.45)
  const sigH = (png.height / png.width) * sigW
  const margin = 36
  const boxH = Math.max(72, sigH + 28)

  last.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: boxH,
    borderColor: rgb(0.75, 0.78, 0.82),
    borderWidth: 0.75,
    color: rgb(0.98, 0.98, 0.99),
  })

  last.drawImage(png, {
    x: margin + 12,
    y: margin + 18,
    width: sigW,
    height: Math.min(sigH, boxH - 24),
  })

  const label = `Signed by ${meta.signerName} · ${new Date(meta.signedAtIso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  })} UK`
  last.drawText(label.slice(0, 120), {
    x: margin + 12,
    y: margin + 6,
    size: 8,
    font,
    color: rgb(0.25, 0.27, 0.3),
  })

  return pdf.save()
}

export function toPdfDataUrl(bytes: Uint8Array): string {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`
}
