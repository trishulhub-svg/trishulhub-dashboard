import nodemailer from "nodemailer"
import { db } from "@/lib/db"

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
  "kozow.com", "matchpol.net", "mt2015.com", "naver.com",
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
    await (db as any).emailLog.create({
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
  } catch (err: any) {
    // Non-blocking: if EmailLog table doesn't exist yet, just log to console
    console.warn("[email-log] Failed to log email event:", err.message)
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
  const smtpConfigs = await db.smtpConfig.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  })

  if (smtpConfigs.length === 0) {
    await logEmailEvent({
      to: options.to,
      subject: options.subject,
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
      const result = await sendViaSmtp(config, options)
      if (result.success) {
        const method = config.isPrimary ? "primary" : "failover"
        // Log successful send with messageId for tracking
        await logEmailEvent({
          to: options.to,
          subject: options.subject,
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
      // If primary fails, log and try next
      console.warn(`[email] SMTP ${config.isPrimary ? "primary" : "failover"} (${config.host}) failed: ${result.error}`)
      // Log failure for this attempt
      await logEmailEvent({
        to: options.to,
        subject: options.subject,
        type: options.type || "UNKNOWN",
        status: "FAILED",
        smtpConfigId: config.id,
        smtpHost: config.host,
        method: config.isPrimary ? "primary" : "failover",
        error: result.error,
        triggeredBy: options.triggeredBy,
      })
    } catch (err: any) {
      console.warn(`[email] SMTP ${config.isPrimary ? "primary" : "failover"} (${config.host}) error: ${err.message}`)
      await logEmailEvent({
        to: options.to,
        subject: options.subject,
        type: options.type || "UNKNOWN",
        status: "FAILED",
        smtpConfigId: config.id,
        smtpHost: config.host,
        method: config.isPrimary ? "primary" : "failover",
        error: err.message,
        triggeredBy: options.triggeredBy,
      })
    }
  }

  await logEmailEvent({
    to: options.to,
    subject: options.subject,
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
      pass: config.password,
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
        "X-Mailer": "TrishulHub Dashboard",
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
  } catch (error: any) {
    try { await transporter.close() } catch {}
    return { success: false, error: error.message }
  }
}

/**
 * Generate a random 6-digit OTP code
 */
export function generateOTP(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto")
  const num = randomBytes(3).readUIntBE(0, 3) % 1000000
  return num.toString().padStart(6, "0")
}

/**
 * Generate a secure random token for password reset links
 */
export function generateResetToken(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto")
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
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Dashboard. Do not reply.</p>
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
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Dashboard. Do not reply.</p>
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
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 24px; margin: 0;">TrishulHub</h1>
        <p style="color: #6b7280; margin: 4px 0 0;">Password Reset</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">Hello ${userName},</p>
        <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">An administrator has requested a password reset for your account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="background: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">This link expires in <strong>1 hour</strong>. If you did not request this reset, you can safely ignore this email.</p>
        <p style="color: #6b7280; font-size: 13px; margin: 8px 0 0;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color: #4f46e5; font-size: 13px; word-break: break-all; margin: 4px 0 0;">${resetLink}</p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Dashboard. Do not reply.</p>
    </div>
  `

  return sendEmailWithFailover({
    to: toEmail,
    subject: "TrishulHub - Password Reset Request",
    html,
    text: `Hello ${userName}, an administrator has requested a password reset for your account. Click this link to reset your password: ${resetLink}. This link expires in 1 hour. If you did not request this, ignore this email.`,
    type: "RESET_LINK",
    triggeredBy,
  })
}
