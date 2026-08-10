import nodemailer from "nodemailer"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { decryptSmtpPassword } from "@/lib/encryption"
import { formatDisplayDate } from "@/lib/format"

// ━━ Disposable Email Domain Blocklist ━━
// Common temporary/disposable email providers - blocked to prevent spam
const DISPOSABLE_DOMAINS = new Set([
  // Popular disposable email services
  "tempmail.com", "throwaway.email", "mailinator.com", "guerrillamail.com",
  "guerrillamailblock.com", "sharklasers.com", "grr.la", "guerrillamail.biz",
  "guerrillamail.de", "guerrillamail.net", "guerrillamail.org", "spam4.me",
  "tempmailaddress.com", "tempmailo.com", "temp-mail.org", "tempmail.zone",
  "dispostable.com", "maildrop.cc", "mailnesia.com", "trashmail.com",
  "trashmail.ws", "trashmail.me", "yopmail.com", "yopmail.fr", "yopmail.net",
  "jetable.org", "jetable.fr", "mailforspam.com", "safetymail.info",
  "instantemailaddress.com", "emaillime.com", "emailisvalid.com",
  "emailondeck.com", "emailsensei.com", "emailtemp.info", "emailtmp.com",
  "fakeinbox.com", "filzmail.com", "getairmail.com", "getnator.com",
  "harakirimail.com", "inboxkitten.com", "incognitomail.org", "mailcatch.com",
  "mailscrap.com", "mailshell.com", "meltmail.com", "mohmal.com",
  "mytemp.email", "mytempemail.com", "no-spam.ws", "nobuma.com",
  "objectmail.com", "proxymail.eu", "quickemail.info", "rcpt.at",
  "reallymymail.com", "recode.me", "regbypass.com", "rmqkr.net",
  "royal.net", "s0ny.net", "safersignup.de", "safetypost.de",
  "saynotospams.com", "scbox.one", "schafmail.de", "selfdestructingmail.com",
  "sendspamhere.com", "shortmail.net", "sinnlos-mail.de", "slaskpost.se",
  "smellrear.com", "solvemail.info", "sogetthis.com", "spamavert.com",
  "spambob.net", "spambog.com", "spambog.de", "spambog.ru",
  "spambox.us", "spamcannon.com", "spamcero.com", "spamcorptastic.com",
  "spamcowboy.com", "spamfree24.org", "spamgourmet.com", "spamherelots.com",
  "spamhole.com", "spamify.com", "spaml.com", "spammotel.com",
  "spamspot.com", "spamthis.co.uk", "speed.1s.fr", "strictlyemail.com",
  "superrito.com", "superstachel.de", "tagmymail.com", "tempail.com",
  "tempalias.com", "tempe-mail.com", "tempemail.co.za", "tempemail.com",
  "tempinbox.co.uk", "tempinbox.com", "tempmail.eu", "tempmaildemo.com",
  "tempmailer.com", "tempmailer.de", "tempmails.com", "tempomail.fr",
  "temporarioemail.com.br", "temporaryemail.net", "temporaryemail.org",
  "temporarymailaddress.com", "temporarymail.de", "tempthe.net",
  "thankyou2010.com", "throwam.com", "throwawayemailaddress.com",
  "tmail.ws", "toomail.biz", "topranklist.de", "trash-mail.at",
  "trash-mail.com", "trash2009.com", "trashemail.de", "trashmail.at",
  "trashmail.io", "twinmail.de", "uggsrock.com", "wegwerf-email.de",
  "wegwerfemail.de", "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "wh4f.org", "whyspam.me", "willselfdestruct.com", "wuzup.net",
  "wuzupmail.net", "yopmail.fr", "zepp.dk", "zippymail.info",
  "zoaxe.com", "10minutemail.com", "10minutemail.net", "33mail.com",
  "6paq.com", "6url.com", "abstracta.com", "armyspy.com",
  "cuvox.de", "dayrep.com", "einrot.com", "einrot.de",
  "fleckens.hu", "gustr.com", "jourrapide.com", "katz.me",
  "kozow.com", "matchpol.net", "mt2015.com",
  "politikerclub.de", "rhyta.com", "superrito.com", "teleworm.at",
  "teleworm.com", "teleworm.de", "teleworm.fr", "teleworm.us",
  "throwam.com", "trbvm.com", "trbvn.com", "vpn8.ru",
  // Add common patterns
  "mailcatch.com", "mailnull.com", "mailshell.com", "mailzilla.com",
  "mailzilla.org", "mbx.cc", "meltmail.com", "messagebeamer.de",
])

/**
 * Check if an email address uses a disposable/temporary domain
 * Returns true if the email should be BLOCKED
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase()
  if (!domain) return true // No domain = invalid
  return DISPOSABLE_DOMAINS.has(domain)
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email)
}

/**
 * Log an email event to the database for the SuperAdmin audit trail
 */
export async function logEmailEvent(options: {
  to: string
  subject: string
  type: string // OTP, PASSWORD_RESET, EMAIL_CHANGE, RESET_LINK
  status: string // SENT, FAILED, REJECTED
  smtpConfigId?: string
  smtpHost?: string
  method?: string // primary, failover
  error?: string
  triggeredBy?: string // userId who triggered
  metadata?: string // JSON string for additional info
}): Promise<void> {
  try {
    // Try to log - if EmailLog table doesn't exist, just console.warn
    await db.emailLog.create({
      data: {
        to: options.to,
        subject: options.subject,
        type: options.type,
        status: options.status,
        smtpConfigId: options.smtpConfigId,
        smtpHost: options.smtpHost,
        method: options.method,
        error: options.error,
        triggeredBy: options.triggeredBy,
        metadata: options.metadata,
      },
    })
  } catch (err: unknown) {
    // Non-blocking: if EmailLog table doesn't exist yet, just log to console
    console.warn("[email-log] Failed to log email event:", err instanceof Error ? err.message : String(err))
  }
}

/**
 * Send an email using configured SMTP servers with automatic failover
 * Tries primary SMTP first, then failover if primary fails
 */
export async function sendEmailWithFailover(options: {
  to: string
  subject: string
  html: string
  text?: string
  type?: string // For logging: OTP, PASSWORD_RESET, EMAIL_CHANGE, RESET_LINK
  triggeredBy?: string // userId who triggered the email
}): Promise<{ success: boolean; method?: string; error?: string }> {
  // Strip CRLF to prevent email header injection
  function sanitizeEmailHeader(val: string): string { return val.replace(/[\r\n]/g, ' ').trim() }
  const safeTo = sanitizeEmailHeader(options.to)
  const safeSubject = sanitizeEmailHeader(options.subject)

  const smtpConfigs = await db.smtpConfig.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  })

  if (smtpConfigs.length === 0) {
    await logEmailEvent({
      to: safeTo,
      subject: safeSubject,
      type: options.type || "UNKNOWN",
      status: "FAILED",
      error: "No SMTP server configured",
      triggeredBy: options.triggeredBy,
    })
    return { success: false, error: "No SMTP server configured. Please ask your SUPER_ADMIN to configure SMTP settings." }
  }

  // Try each SMTP config (primary first, then failover)
  for (const config of smtpConfigs) {
    try {
      const result = await sendViaSmtp(config, { ...options, to: safeTo, subject: safeSubject })
      if (result.success) {
        const method = config.isPrimary ? "primary" : "failover"
        // Log successful send with messageId for tracking
        await logEmailEvent({
          to: safeTo,
          subject: safeSubject,
          type: options.type || "UNKNOWN",
          status: "SENT",
          smtpConfigId: config.id,
          smtpHost: config.host,
          method,
          triggeredBy: options.triggeredBy,
          metadata: JSON.stringify({ messageId: result.messageId || "" }),
        })
        return { success: true, method }
      }
      // Intermediate SMTP failures: console only. Logging each attempt as FAILED
      // duplicated EmailLog rows for one password-reset (user receives one email via failover).
      console.warn(`[email] SMTP ${config.isPrimary ? "primary" : "failover"} (${config.host}) failed: ${result.error}`)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[email] SMTP ${config.isPrimary ? "primary" : "failover"} (${config.host}) error: ${errMsg}`)
    }
  }

  // Single FAILED row only when every SMTP config failed
  await logEmailEvent({
    to: safeTo,
    subject: safeSubject,
    type: options.type || "UNKNOWN",
    status: "FAILED",
    error: "All SMTP servers failed to deliver the email",
    triggeredBy: options.triggeredBy,
  })
  return { success: false, error: "All SMTP servers failed to deliver the email" }
}

/**
 * Send email via a single SMTP configuration
 * 
 * FIX: Removed redundant verify() call - sendMail() already verifies the connection.
 * Added proper email headers for better deliverability (replyTo, Date).
 * Check info.rejected for recipient-level rejections during SMTP conversation.
 */
async function sendViaSmtp(
  config: {
    host: string
    port: number
    username: string
    password: string
    fromEmail: string
    fromName: string
    secure: boolean
  },
  options: {
    to: string
    subject: string
    html: string
    text?: string
  }
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true = implicit TLS (port 465), false = STARTTLS (port 587)
    requireTLS: !config.secure, // When secure=false, upgrade to TLS via STARTTLS
    auth: {
      user: config.username,
      pass: config.password.includes(":") ? decryptSmtpPassword(config.password) : config.password,
    },
    // Timeout settings to fail fast and try next server
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })

  try {
    // NOTE: Removed redundant transporter.verify() call.
    // sendMail() already establishes/verifies the connection internally.
    // The extra verify() was adding an unnecessary round-trip (5-10s on Vercel)
    // which contributed to function timeouts without any benefit.

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: options.to,
      replyTo: config.fromEmail, // Add replyTo for better deliverability
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
      // Ensure proper headers for deliverability
      // These headers help email providers verify the email is legitimate
      // and reduce the chance of being flagged as spam
      headers: {
        "X-Mailer": "TrishulHub Technology",
        "X-Priority": "3", // Normal priority
        "X-Auto-Response-Suppress": "OOF, DR, RN, NRN", // Prevent auto-replies
        "List-Unsubscribe": "No", // Indicate this is not a mailing list
      },
      // Set encoding to quoted-printable for better compatibility
      encoding: "utf-8",
    })

    // Check if the recipient was rejected during SMTP conversation
    if (info.rejected && info.rejected.length > 0) {
      await transporter.close()
      return { success: false, error: `Recipient rejected by SMTP server: ${info.rejected.join(", ")}` }
    }

    // Log detailed SMTP response for debugging delivery issues
    // messageId is critical for tracking delivery in Brevo/ESP dashboards
    console.log(`[email] SMTP response from ${config.host}: response=${info.response}, messageId=${info.messageId}, envelopeFrom=${info.envelope?.from}, envelopeTo=${JSON.stringify(info.envelope?.to)}`)

    await transporter.close()
    return { success: true, messageId: info.messageId }
  } catch (error: unknown) {
    try { await transporter.close() } catch {}
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Generate a random 6-digit OTP code
 */
export function generateOTP(): string {
  const num = randomBytes(3).readUIntBE(0, 3) % 1000000
  return num.toString().padStart(6, "0")
}

/**
 * Generate a secure random token for password reset links
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Send OTP email for email verification
 */
export async function sendOTPEmail(
  toEmail: string,
  otp: string,
  triggeredBy?: string
): Promise<{ success: boolean; error?: string }> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 24px; margin: 0;">TrishulHub</h1>
        <p style="color: #6b7280; margin: 4px 0 0;">Email Verification</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">You requested to change your email address. Please use the following OTP to verify your new email:</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1f2937;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">This OTP expires in <strong>10 minutes</strong>. If you did not request this change, please ignore this email.</p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Technology. Do not reply.</p>
    </div>
  `

  return sendEmailWithFailover({
    to: toEmail,
    subject: "TrishulHub - Email Verification OTP",
    html,
    text: `Your email verification OTP is: ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    type: "OTP",
    triggeredBy,
  })
}

/**
 * Send password change OTP email
 */
export async function sendPasswordChangeOTP(
  toEmail: string,
  otp: string,
  triggeredBy?: string
): Promise<{ success: boolean; error?: string }> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 24px; margin: 0;">TrishulHub</h1>
        <p style="color: #6b7280; margin: 4px 0 0;">Password Change Verification</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">You requested to change your password. Please use the following OTP to verify your identity:</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1f2937;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">This OTP expires in <strong>10 minutes</strong>. If you did not request this change, please contact your administrator immediately.</p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Technology. Do not reply.</p>
    </div>
  `

  return sendEmailWithFailover({
    to: toEmail,
    subject: "TrishulHub - Password Change OTP",
    html,
    text: `Your password change OTP is: ${otp}. It expires in 10 minutes. If you did not request this, contact your administrator immediately.`,
    type: "PASSWORD_CHANGE",
    triggeredBy,
  })
}

/**
 * Send password reset link email (SuperAdmin initiated)
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  userName: string,
  triggeredBy?: string
): Promise<{ success: boolean; error?: string }> {
  // The reset link will point to the app's reset page
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`

  const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const safeUserName = escapeHtml(userName)

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 24px; margin: 0;">TrishulHub</h1>
        <p style="color: #6b7280; margin: 4px 0 0;">Password Reset</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">Hello ${safeUserName},</p>
        <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">An administrator has requested a password reset for your account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="background: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">This link expires in <strong>1 hour</strong>. If you did not request this reset, you can safely ignore this email.</p>
        <p style="color: #6b7280; font-size: 13px; margin: 8px 0 0;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color: #4f46e5; font-size: 13px; word-break: break-all; margin: 4px 0 0;">${resetLink}</p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Technology. Do not reply.</p>
    </div>
  `

  return sendEmailWithFailover({
    to: toEmail,
    subject: "TrishulHub - Password Reset Request",
    html,
    text: `Hello ${safeUserName}, an administrator has requested a password reset for your account. Click this link to reset your password: ${resetLink}. This link expires in 1 hour. If you did not request this, ignore this email.`,
    type: "RESET_LINK",
    triggeredBy,
  })
}

/**
 * Send an invoice email to a client.
 *
 * Builds an HTML email with the invoice details (line items, subtotal, GST, total,
 * due date, notes) and delivers it via the configured SMTP servers using the
 * standard failover pipeline. The email event is logged to the EmailLog table
 * with type="INVOICE" for audit trail / deliverability tracking.
 *
 * @returns { success, method?, error? } — same shape as sendEmailWithFailover
 */
export async function sendInvoiceEmail(options: {
  to: string
  invoice: {
    invoiceNumber: string
    status?: string
    currency?: string | null
    subtotal?: number | null
    tax?: number | null
    gst?: number | null
    gstPercent?: number | null
    total?: number | null
    dueDate?: Date | string | null
    paymentMethod?: string | null
    paymentStatus?: string | null
    notes?: string | null
  }
  client: {
    name: string
    company?: string | null
  }
  project?: {
    name?: string | null
  } | null
  triggeredBy?: string
}): Promise<{ success: boolean; method?: string; error?: string }> {
  const esc = (s: unknown): string =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "TrishulHub"
  const companyTagline = process.env.NEXT_PUBLIC_COMPANY_TAGLINE || "Official Workspace"
  const appUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const logoUrl = appUrl ? `${appUrl}/logo.svg` : ""
  const currencyCode = String(options.invoice.currency || "GBP").toUpperCase()
  const locale = currencyCode === "GBP" ? "en-GB" : currencyCode === "INR" ? "en-IN" : "en-GB"
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(n)
    } catch {
      const sym = currencyCode === "GBP" ? "£" : currencyCode === "INR" ? "₹" : currencyCode + " "
      return `${sym}${new Intl.NumberFormat(locale).format(n)}`
    }
  }
  const fmtDate = (d: Date | string | null | undefined): string => formatDisplayDate(d)

  const inv = options.invoice
  const sub = Number(inv.subtotal ?? 0)
  const tax = Number(inv.tax ?? 0)
  const gst = Number(inv.gst ?? 0)
  const gstPct = Number(inv.gstPercent ?? 0)
  const total = Number(inv.total ?? sub + tax + gst)

  const showGstRow = gst > 0 || gstPct > 0
  const showTaxRow = tax > 0

  const paymentMethodLabel = inv.paymentMethod
    ? String(inv.paymentMethod).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 640px; margin: 0 auto; padding: 0; background: #0f172a;">
      <div style="background: linear-gradient(135deg,#0f172a 0%,#134e4a 55%,#0f172a 100%); padding: 28px 24px; text-align: center;">
        ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(companyName)}" width="48" height="48" style="display:inline-block;margin-bottom:12px;" />` : ""}
        <h1 style="color: #f8fafc; font-size: 26px; margin: 0; letter-spacing: 0.04em;">${esc(companyName)}</h1>
        <p style="color: #99f6e4; margin: 6px 0 0; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${esc(companyTagline)}</p>
      </div>
      <div style="background: #ffffff; padding: 28px 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div>
            <p style="margin:0; color:#0f766e; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">Invoice</p>
            <h2 style="color: #0f172a; font-size: 22px; margin: 4px 0 0;">${esc(inv.invoiceNumber)}</h2>
            ${inv.status ? `<p style="color: #64748b; margin: 4px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">${esc(inv.status)} · ${esc(currencyCode)}</p>` : ""}
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; color: #334155; font-size: 13px;"><strong>Due</strong><br/>${esc(fmtDate(inv.dueDate))}</p>
            ${paymentMethodLabel ? `<p style="margin: 8px 0 0; color: #64748b; font-size: 12px;">${esc(paymentMethodLabel)}</p>` : ""}
          </div>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <p style="margin: 0; color: #0f172a; font-size: 14px;"><strong>Bill To</strong><br/>${esc(options.client.name)}${options.client.company ? ` · ${esc(options.client.company)}` : ""}</p>
          ${options.project?.name ? `<p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">Project: ${esc(options.project.name)}</p>` : ""}
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="display:flex; justify-content:space-between; padding: 6px 0; color: #334155; font-size: 14px;">
            <span>Subtotal</span><span>${esc(fmt(sub))}</span>
          </div>
          ${showTaxRow ? `<div style="display:flex; justify-content:space-between; padding: 6px 0; color: #334155; font-size: 14px;"><span>Tax</span><span>${esc(fmt(tax))}</span></div>` : ""}
          ${showGstRow ? `<div style="display:flex; justify-content:space-between; padding: 6px 0; color: #334155; font-size: 14px;"><span>GST${gstPct > 0 ? ` (${gstPct}%)` : ""}</span><span>${esc(fmt(gst))}</span></div>` : ""}
          <div style="display:flex; justify-content:space-between; padding: 14px 0 4px; border-top: 2px solid #0f766e; margin-top: 10px; color: #0f172a; font-size: 20px; font-weight: 700;">
            <span>Total</span><span>${esc(fmt(total))}</span>
          </div>
        </div>
        ${inv.notes ? `<div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"><p style="margin: 0; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing:0.08em; text-transform: uppercase;">Notes</p><p style="margin: 6px 0 0; color: #0f172a; font-size: 14px; white-space: pre-wrap;">${esc(inv.notes)}</p></div>` : ""}
        <p style="color: #64748b; font-size: 13px; margin: 16px 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Please remit payment by the due date. Questions? Reply to this email.</p>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Sent by ${esc(companyName)} · Powered by Trishulhub</p>
    </div>
  `

  const text = [
    `Invoice ${inv.invoiceNumber}`,
    `Bill To: ${options.client.name}${options.client.company ? ` (${options.client.company})` : ""}`,
    options.project?.name ? `Project: ${options.project.name}` : null,
    `Due: ${fmtDate(inv.dueDate)}`,
    paymentMethodLabel ? `Payment Method: ${paymentMethodLabel}` : null,
    "",
    `Subtotal: ${fmt(sub)}`,
    showTaxRow ? `Tax: ${fmt(tax)}` : null,
    showGstRow ? `GST${gstPct > 0 ? ` (${gstPct}%)` : ""}: ${fmt(gst)}` : null,
    `Total: ${fmt(total)}`,
    "",
    inv.notes ? `Notes: ${inv.notes}` : null,
    "",
    `Please review this invoice and remit payment by the due date.`,
  ].filter(Boolean).join("\n")

  return sendEmailWithFailover({
    to: options.to,
    subject: `Invoice ${inv.invoiceNumber} from ${companyName}`,
    html,
    text,
    type: "INVOICE",
    triggeredBy: options.triggeredBy,
  })
}

/**
 * Training "Buzz" reminder — lists all open/overdue assignments for one person.
 * Uses Trishulhub branded layout (same family as invoice emails).
 */
export async function sendTrainingBuzzEmail(options: {
  to: string
  userName: string
  items: Array<{
    title: string
    dueDate: Date | string
    status: string
    notes?: string | null
  }>
  triggeredBy?: string
}): Promise<{ success: boolean; method?: string; error?: string }> {
  const esc = (s: unknown): string =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "TrishulHub"
  const companyTagline = process.env.NEXT_PUBLIC_COMPANY_TAGLINE || "Official Workspace"
  const appUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const logoUrl = appUrl ? `${appUrl}/logo.svg` : ""
  const myTrainingUrl = appUrl ? `${appUrl}/dashboard/training/my` : "/dashboard/training/my"
  const safeName = esc(options.userName || "Team member")

  const rows = options.items
    .map((item, i) => {
      const overdue = String(item.status).toUpperCase() === "OVERDUE"
      const statusLabel = overdue ? "OVERDUE" : "DUE"
      const statusColor = overdue ? "#b91c1c" : "#0f766e"
      const notes = item.notes?.trim()
        ? `<p style="margin:4px 0 0;color:#64748b;font-size:12px;">${esc(item.notes.trim())}</p>`
        : ""
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;vertical-align:top;">
            <p style="margin:0;color:#0f172a;font-size:14px;font-weight:600;">${i + 1}. ${esc(item.title)}</p>
            ${notes}
          </td>
          <td style="padding:12px 0 12px 12px;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:right;white-space:nowrap;vertical-align:top;">
            <p style="margin:0;color:#334155;font-size:13px;">${esc(formatDisplayDate(item.dueDate))}</p>
            <p style="margin:4px 0 0;color:${statusColor};font-size:11px;font-weight:700;letter-spacing:0.06em;">${statusLabel}</p>
          </td>
        </tr>`
    })
    .join("")

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 640px; margin: 0 auto; padding: 0; background: #0f172a;">
      <div style="background: linear-gradient(135deg,#0f172a 0%,#134e4a 55%,#0f172a 100%); padding: 28px 24px; text-align: center;">
        ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(companyName)}" width="48" height="48" style="display:inline-block;margin-bottom:12px;" />` : ""}
        <h1 style="color: #f8fafc; font-size: 26px; margin: 0; letter-spacing: 0.04em;">${esc(companyName)}</h1>
        <p style="color: #99f6e4; margin: 6px 0 0; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${esc(companyTagline)}</p>
      </div>
      <div style="background: #ffffff; padding: 28px 24px;">
        <p style="margin:0; color:#0f766e; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Training reminder</p>
        <h2 style="color: #0f172a; font-size: 22px; margin: 6px 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Action required — complete your training</h2>
        <p style="color: #334155; font-size: 15px; margin: 16px 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; line-height:1.55;">
          Hello ${safeName}, this is an official reminder from ${esc(companyName)}. The following training item${options.items.length === 1 ? " is" : "s are"} still incomplete and require your attention:
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 8px; border-collapse:collapse;">
          ${rows}
        </table>
        <div style="text-align:center; margin: 24px 0;">
          <a href="${esc(myTrainingUrl)}" style="background:#0f766e;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Open My Training</a>
        </div>
        <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:14px 16px;margin-top:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <p style="margin:0;color:#9a3412;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Important notice</p>
          <p style="margin:8px 0 0;color:#7c2d12;font-size:13px;line-height:1.55;">
            If the training listed above is not completed after this warning, it may have a negative effect on your performance review.
            A penalty may also be charged accordingly and the matter will be discussed in supervision.
            Please complete your training promptly to avoid further action.
          </p>
        </div>
        <p style="color: #64748b; font-size: 13px; margin: 18px 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; line-height:1.5;">
          Go to Learning → My Training in Trishulhub to mark items complete when finished.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Sent by ${esc(companyName)} · Powered by Trishulhub · Do not reply to this email</p>
    </div>
  `

  const textLines = [
    `Hello ${options.userName || "Team member"},`,
    "",
    `This is an official training reminder from ${companyName}.`,
    "The following training is still incomplete:",
    "",
    ...options.items.map(
      (item, i) =>
        `${i + 1}. ${item.title} — due ${formatDisplayDate(item.dueDate)} (${String(item.status).toUpperCase() === "OVERDUE" ? "OVERDUE" : "DUE"})`
    ),
    "",
    `Open My Training: ${myTrainingUrl}`,
    "",
    "IMPORTANT: If the training listed above is not completed after this warning, it may have a negative effect on your performance review. A penalty may also be charged accordingly and the matter will be discussed in supervision.",
    "",
    `— ${companyName}`,
  ]

  return sendEmailWithFailover({
    to: options.to,
    subject:
      options.items.length === 1
        ? `${companyName} — Training due: ${options.items[0].title}`
        : `${companyName} — ${options.items.length} trainings require your attention`,
    html,
    text: textLines.join("\n"),
    type: "TRAINING_BUZZ",
    triggeredBy: options.triggeredBy,
  })
}
