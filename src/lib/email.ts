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
 * Send an email using configured SMTP servers with automatic failover
 * Tries primary SMTP first, then failover if primary fails
 */
export async function sendEmailWithFailover(options: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<{ success: boolean; method?: string; error?: string }> {
  const smtpConfigs = await db.smtpConfig.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  })

  if (smtpConfigs.length === 0) {
    return { success: false, error: "No SMTP server configured. Please ask your SUPER_ADMIN to configure SMTP settings." }
  }

  // Try each SMTP config (primary first, then failover)
  for (const config of smtpConfigs) {
    try {
      const result = await sendViaSmtp(config, options)
      if (result.success) {
        return { success: true, method: config.isPrimary ? "primary" : "failover" }
      }
      // If primary fails, log and try next
      console.warn(`[email] SMTP ${config.isPrimary ? "primary" : "failover"} (${config.host}) failed: ${result.error}`)
    } catch (err: any) {
      console.warn(`[email] SMTP ${config.isPrimary ? "primary" : "failover"} (${config.host}) error: ${err.message}`)
    }
  }

  return { success: false, error: "All SMTP servers failed to deliver the email" }
}

/**
 * Send email via a single SMTP configuration
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
): Promise<{ success: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
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
    await transporter.verify()

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
    })

    await transporter.close()
    return { success: true }
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
 * Send OTP email for email verification
 */
export async function sendOTPEmail(
  toEmail: string,
  otp: string
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
  })
}
