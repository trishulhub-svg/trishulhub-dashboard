/**
 * Team support helpers — ticket numbers + SMTP notifications.
 */
import { sendEmailWithFailover } from "@/lib/email"

export const TEAM_ISSUE_AREAS = [
  "Time Tracking",
  "Docx Sign",
  "Access Hub",
  "Projects / Work",
  "CRM / Clients",
  "Training / Learning",
  "Leaves / Attendance",
  "Finance",
  "Login / Account",
  "Other",
] as const

export type TeamIssueArea = (typeof TEAM_ISSUE_AREAS)[number]

/** Generate a readable ticket number: TH-YYMMDD-XXXX */
export function buildTicketNumber(seq: number, now = new Date()): string {
  const y = String(now.getUTCFullYear()).slice(-2)
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const d = String(now.getUTCDate()).padStart(2, "0")
  const n = String(Math.max(1, seq)).padStart(4, "0")
  return `TH-${y}${m}${d}-${n}`
}

export async function notifyTicketRaised(opts: {
  to: string
  ticketNumber: string
  subject: string
  issueArea: string
  triggeredBy?: string
}): Promise<void> {
  if (!opts.to) return
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">Support ticket received</h2>
      <p>We received your support request.</p>
      <p><strong>Ticket:</strong> ${opts.ticketNumber}<br/>
      <strong>Area:</strong> ${opts.issueArea}<br/>
      <strong>Subject:</strong> ${opts.subject}</p>
      <p>Our team will review it and update you when there is progress.</p>
      <p style="color:#666;font-size:12px">TrishulHub Support</p>
    </div>
  `
  void sendEmailWithFailover({
    to: opts.to,
    subject: `[${opts.ticketNumber}] Support ticket received`,
    html,
    text: `Ticket ${opts.ticketNumber} received for ${opts.issueArea}: ${opts.subject}`,
    type: "SUPPORT_TICKET",
    triggeredBy: opts.triggeredBy,
  })
}

export async function notifyTicketResolved(opts: {
  to: string
  ticketNumber: string
  subject: string
  resolution?: string | null
  triggeredBy?: string
}): Promise<void> {
  if (!opts.to) return
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">Support ticket resolved</h2>
      <p>Your ticket <strong>${opts.ticketNumber}</strong> (${opts.subject}) has been marked resolved.</p>
      ${opts.resolution ? `<p><strong>Resolution:</strong><br/>${opts.resolution}</p>` : ""}
      <p style="color:#666;font-size:12px">TrishulHub Support</p>
    </div>
  `
  void sendEmailWithFailover({
    to: opts.to,
    subject: `[${opts.ticketNumber}] Support ticket resolved`,
    html,
    text: `Ticket ${opts.ticketNumber} resolved. ${opts.resolution || ""}`,
    type: "SUPPORT_TICKET",
    triggeredBy: opts.triggeredBy,
  })
}
