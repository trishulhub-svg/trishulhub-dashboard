/**
 * Docx Sign helpers — dual-signature PDF stamp, geo/time labels, validation.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

export const DOCX_SIGN_STATUSES = ["PENDING", "SIGNED", "RESIGN_REQUESTED"] as const
export type DocxSignStatus = (typeof DOCX_SIGN_STATUSES)[number]

/** Soft limit for Turso TEXT — ~4MB base64 payload */
export const MAX_PDF_DATA_URL_CHARS = 5_500_000
export const MAX_SIGNATURE_DATA_URL_CHARS = 900_000

export const UK_TIME_ZONE = "Europe/London"
export const UK_COUNTRY_CODES = new Set(["GB", "UK"])

/** Common ISO country → IANA timezone fallback when client timezone is missing. */
const COUNTRY_TIME_ZONE: Record<string, string> = {
  GB: "Europe/London",
  UK: "Europe/London",
  IN: "Asia/Kolkata",
  US: "America/New_York",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  AE: "Asia/Dubai",
  SG: "Asia/Singapore",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  NL: "Europe/Amsterdam",
  IE: "Europe/Dublin",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  NP: "Asia/Kathmandu",
  LK: "Asia/Colombo",
  JP: "Asia/Tokyo",
  CN: "Asia/Shanghai",
  NZ: "Pacific/Auckland",
}

const COUNTRY_LABELS: Record<string, string> = {
  GB: "United Kingdom",
  UK: "United Kingdom",
  IN: "India",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  AE: "United Arab Emirates",
  SG: "Singapore",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  IE: "Ireland",
  PK: "Pakistan",
  BD: "Bangladesh",
  NP: "Nepal",
  LK: "Sri Lanka",
  JP: "Japan",
  CN: "China",
  NZ: "New Zealand",
}

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

export function toPdfDataUrl(bytes: Uint8Array): string {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`
}

/** Country from CDN / edge headers (Vercel etc.). */
export function getSignerCountry(req: Request): string | null {
  const raw =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-country-code") ||
    ""
  const code = raw.trim().toUpperCase()
  if (!code || code === "XX" || code === "T1") return null
  return code.slice(0, 3)
}

export function isUkCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false
  return UK_COUNTRY_CODES.has(countryCode.trim().toUpperCase())
}

export function countryDisplayName(countryCode: string | null | undefined): string {
  if (!countryCode) return "Local"
  const code = countryCode.trim().toUpperCase()
  return COUNTRY_LABELS[code] || code
}

export function resolveSignerTimeZone(
  countryCode: string | null | undefined,
  clientTimeZone?: string | null
): string {
  const tz = (clientTimeZone || "").trim()
  if (tz && /^[A-Za-z_]+\/[A-Za-z0-9_+\-]+$/.test(tz)) return tz
  if (countryCode) {
    const mapped = COUNTRY_TIME_ZONE[countryCode.trim().toUpperCase()]
    if (mapped) return mapped
  }
  return UK_TIME_ZONE
}

export function formatDocxDateTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  } catch {
    return new Date(iso).toISOString()
  }
}

export type DocxStampMeta = {
  acceptorName: string
  authorizedPersonName: string
  signedAtIso: string
  signerIp: string
  signerCountry?: string | null
  signerTimeZone?: string | null
}

/**
 * Stamp dual signatures on the last page:
 * - Left: Authorized Person (assigner)
 * - Right: Accepted by (signer)
 * - UK date/time always; second country line when signer is outside UK
 * - Bottom footer line: IP Address (standard for all signed contracts)
 */
export async function stampSignatureOnPdf(
  pdfBytes: Uint8Array,
  acceptorSignaturePng: Uint8Array,
  authorizedSignaturePng: Uint8Array,
  meta: DocxStampMeta
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes)
  const pages = pdf.getPages()
  const last = pages[pages.length - 1]
  if (!last) throw new Error("PDF has no pages")

  const acceptorPng = await pdf.embedPng(acceptorSignaturePng)
  const authPng = await pdf.embedPng(authorizedSignaturePng)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { width } = last.getSize()

  const margin = 28
  const gap = 10
  const colW = (width - margin * 2 - gap) / 2
  const footerH = 14
  const timeLines = isUkCountry(meta.signerCountry) ? 1 : 2
  const metaBlockH = 10 + timeLines * 11 + 4
  const sigMaxH = 48
  const boxH = 22 + sigMaxH + 16 + metaBlockH + footerH + 8
  const boxY = margin

  last.drawRectangle({
    x: margin,
    y: boxY,
    width: width - margin * 2,
    height: boxH,
    borderColor: rgb(0.72, 0.75, 0.8),
    borderWidth: 0.8,
    color: rgb(0.985, 0.987, 0.99),
  })

  const drawColumn = (
    x: number,
    title: string,
    name: string,
    png: typeof acceptorPng
  ) => {
    last.drawText(title, {
      x: x + 8,
      y: boxY + boxH - 14,
      size: 8,
      font: fontBold,
      color: rgb(0.2, 0.22, 0.26),
    })
    const aspect = png.height / Math.max(png.width, 1)
    const sigW = Math.min(colW - 16, 160)
    const sigH = Math.min(sigMaxH, sigW * aspect)
    last.drawImage(png, {
      x: x + 8,
      y: boxY + boxH - 18 - sigH,
      width: sigW,
      height: sigH,
    })
    last.drawText(name.slice(0, 42), {
      x: x + 8,
      y: boxY + boxH - 18 - sigH - 12,
      size: 8,
      font,
      color: rgb(0.28, 0.3, 0.34),
    })
  }

  drawColumn(margin, "Authorized Person", meta.authorizedPersonName || "Authorized Person", authPng)
  drawColumn(margin + colW + gap, "Accepted by", meta.acceptorName || "Signer", acceptorPng)

  const ukLine = `UK date & time: ${formatDocxDateTime(meta.signedAtIso, UK_TIME_ZONE)}`
  const timeY0 = boxY + footerH + 10 + (timeLines === 2 ? 12 : 0)
  last.drawText(ukLine.slice(0, 110), {
    x: margin + 8,
    y: timeY0,
    size: 7.5,
    font,
    color: rgb(0.25, 0.27, 0.3),
  })

  if (!isUkCountry(meta.signerCountry)) {
    const localTz = resolveSignerTimeZone(meta.signerCountry, meta.signerTimeZone)
    const label = countryDisplayName(meta.signerCountry)
    const localLine = `${label} date & time: ${formatDocxDateTime(meta.signedAtIso, localTz)} (${localTz})`
    last.drawText(localLine.slice(0, 120), {
      x: margin + 8,
      y: boxY + footerH + 10,
      size: 7.5,
      font,
      color: rgb(0.25, 0.27, 0.3),
    })
  }

  // Standard bottom line — IP for every signed contract
  const ip = (meta.signerIp || "unknown").trim() || "unknown"
  last.drawText(`IP Address: ${ip}`.slice(0, 100), {
    x: margin + 8,
    y: boxY + 5,
    size: 7,
    font,
    color: rgb(0.35, 0.37, 0.4),
  })

  return pdf.save()
}
