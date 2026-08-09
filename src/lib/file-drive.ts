/**
 * Google Drive client for Trishulhub Files.
 * Credentials live encrypted in AppSetting (Super Admin editable).
 * Preferred auth: service account + domain-wide delegation as info@trishulhub.in
 */

import { google, drive_v3 } from "googleapis"
import { db } from "@/lib/db"
import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/encryption"

export const FILE_DRIVE_SETTING_KEY = "file_drive_config"
export const FILE_ACCESS_ROLES_KEY = "file_access_roles"
export const DRIVE_ROOT_NAME = "Trishulhub Files"
export const DRIVE_REVIEW_NAME = "Review"

export type FileDriveAuthMode = "SERVICE_ACCOUNT" | "OAUTH"

export type FileDriveConfigPublic = {
  connected: boolean
  mode: FileDriveAuthMode
  impersonateEmail: string
  rootFolderId: string | null
  reviewFolderId: string | null
  clientEmail?: string | null
  hasServiceAccountJson: boolean
  hasOAuthClient: boolean
  hasRefreshToken: boolean
  encryptionReady: boolean
  updatedAt?: string | null
}

type FileDriveConfigStored = {
  mode: FileDriveAuthMode
  impersonateEmail: string
  rootFolderId: string | null
  reviewFolderId: string | null
  // encrypted envelopes
  serviceAccountJsonEnc?: string | null
  serviceAccountJsonIv?: string | null
  serviceAccountJsonTag?: string | null
  oauthClientIdEnc?: string | null
  oauthClientIdIv?: string | null
  oauthClientIdTag?: string | null
  oauthClientSecretEnc?: string | null
  oauthClientSecretIv?: string | null
  oauthClientSecretTag?: string | null
  refreshTokenEnc?: string | null
  refreshTokenIv?: string | null
  refreshTokenTag?: string | null
  clientEmail?: string | null
}

function encField(plaintext: string) {
  const { encrypted, iv, tag } = encrypt(plaintext)
  return { encrypted, iv, tag }
}

function decField(encrypted?: string | null, iv?: string | null, tag?: string | null): string | null {
  if (!encrypted || !iv || !tag) return null
  try {
    return decrypt(encrypted, iv, tag)
  } catch {
    return null
  }
}

async function readStored(): Promise<FileDriveConfigStored | null> {
  const row = await db.appSetting.findUnique({ where: { key: FILE_DRIVE_SETTING_KEY } })
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as FileDriveConfigStored
  } catch {
    return null
  }
}

export async function getFileDriveConfigPublic(): Promise<FileDriveConfigPublic> {
  const encryptionReady = isEncryptionConfigured()
  const stored = await readStored()
  if (!stored) {
    return {
      connected: false,
      mode: "OAUTH",
      impersonateEmail: "info@trishulhub.in",
      rootFolderId: null,
      reviewFolderId: null,
      hasServiceAccountJson: false,
      hasOAuthClient: false,
      hasRefreshToken: false,
      encryptionReady,
    }
  }
  const hasSa = Boolean(stored.serviceAccountJsonEnc)
  const hasOauth =
    Boolean(stored.oauthClientIdEnc) && Boolean(stored.oauthClientSecretEnc)
  const hasRefresh = Boolean(stored.refreshTokenEnc)
  const connected =
    stored.mode === "OAUTH"
      ? hasOauth && hasRefresh
      : hasSa && Boolean(stored.impersonateEmail)

  const row = await db.appSetting.findUnique({ where: { key: FILE_DRIVE_SETTING_KEY } })
  return {
    connected,
    mode: stored.mode || "OAUTH",
    impersonateEmail: stored.impersonateEmail || "info@trishulhub.in",
    rootFolderId: stored.rootFolderId || null,
    reviewFolderId: stored.reviewFolderId || null,
    clientEmail: stored.clientEmail || null,
    hasServiceAccountJson: hasSa,
    hasOAuthClient: hasOauth,
    hasRefreshToken: hasRefresh,
    encryptionReady,
    updatedAt: row?.updatedAt?.toISOString?.() || null,
  }
}

export async function saveFileDriveConfig(input: {
  mode: FileDriveAuthMode
  impersonateEmail: string
  rootFolderId?: string | null
  serviceAccountJson?: string | null
  oauthClientId?: string | null
  oauthClientSecret?: string | null
  refreshToken?: string | null
  clear?: boolean
}): Promise<FileDriveConfigPublic> {
  if (input.clear) {
    await db.appSetting.deleteMany({ where: { key: FILE_DRIVE_SETTING_KEY } })
    return getFileDriveConfigPublic()
  }

  if (!isEncryptionConfigured()) {
    throw new Error(
      "Server encryption is not configured. Set ENCRYPTION_KEY (64-char hex) or NEXTAUTH_SECRET on Vercel, then redeploy."
    )
  }

  const prev = (await readStored()) || {
    mode: "OAUTH" as const,
    impersonateEmail: "info@trishulhub.in",
    rootFolderId: null,
    reviewFolderId: null,
  }

  const next: FileDriveConfigStored = {
    ...prev,
    mode: input.mode,
    impersonateEmail: (input.impersonateEmail || prev.impersonateEmail || "info@trishulhub.in").trim(),
    rootFolderId:
      input.rootFolderId !== undefined ? input.rootFolderId || null : prev.rootFolderId,
  }

  if (input.mode === "SERVICE_ACCOUNT") {
    if (input.serviceAccountJson && input.serviceAccountJson.trim()) {
      const json = input.serviceAccountJson.trim()
      JSON.parse(json) // validate
      const parsed = JSON.parse(json) as { client_email?: string }
      const e = encField(json)
      next.serviceAccountJsonEnc = e.encrypted
      next.serviceAccountJsonIv = e.iv
      next.serviceAccountJsonTag = e.tag
      next.clientEmail = parsed.client_email || null
    }
    if (!next.serviceAccountJsonEnc) {
      throw new Error("Paste the full service account JSON key to save Service account mode.")
    }
    if (!next.impersonateEmail) {
      throw new Error("Impersonate email is required (e.g. info@trishulhub.in).")
    }
  } else {
    // OAuth-only — service account JSON is not required
    if (input.oauthClientId && input.oauthClientId.trim()) {
      const clientId = input.oauthClientId.trim()
      // Reject emails / autofill mistakes — must be a Google Web OAuth client id
      if (!/\.apps\.googleusercontent\.com$/i.test(clientId) || clientId.includes("@")) {
        throw new Error(
          "OAuth Client ID looks wrong. Paste the Google Web client ID ending with .apps.googleusercontent.com (not an email address)."
        )
      }
      const e = encField(clientId)
      next.oauthClientIdEnc = e.encrypted
      next.oauthClientIdIv = e.iv
      next.oauthClientIdTag = e.tag
    }
    if (input.oauthClientSecret && input.oauthClientSecret.trim()) {
      const secret = input.oauthClientSecret.trim()
      if (secret.includes("@") || secret.length < 10) {
        throw new Error(
          "OAuth Client Secret looks wrong. Paste the secret from Google Cloud → Credentials (usually starts with GOCSPX-)."
        )
      }
      const e = encField(secret)
      next.oauthClientSecretEnc = e.encrypted
      next.oauthClientSecretIv = e.iv
      next.oauthClientSecretTag = e.tag
    }
    if (input.refreshToken && input.refreshToken.trim()) {
      const token = input.refreshToken.trim()
      if (token.includes("@") || token.length < 20) {
        throw new Error(
          "Refresh token looks wrong. Get a new one from OAuth Playground (Authorize as info@trishulhub.in → Exchange → copy Refresh token)."
        )
      }
      const e = encField(token)
      next.refreshTokenEnc = e.encrypted
      next.refreshTokenIv = e.iv
      next.refreshTokenTag = e.tag
    }
    if (!next.oauthClientIdEnc || !next.oauthClientSecretEnc || !next.refreshTokenEnc) {
      throw new Error(
        "OAuth mode needs Client ID, Client Secret, and Refresh token (all three). Get the refresh token while signed in as info@trishulhub.in."
      )
    }
  }

  await db.appSetting.upsert({
    where: { key: FILE_DRIVE_SETTING_KEY },
    create: { key: FILE_DRIVE_SETTING_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return getFileDriveConfigPublic()
}

async function getAuthClient() {
  const stored = await readStored()
  if (!stored) {
    throw new Error(
      "Google Drive is not connected. Super Admin → Files → Settings → choose OAuth (or Service account) → Save → Test."
    )
  }

  if (stored.mode === "OAUTH") {
    const clientId = decField(stored.oauthClientIdEnc, stored.oauthClientIdIv, stored.oauthClientIdTag)
    const clientSecret = decField(
      stored.oauthClientSecretEnc,
      stored.oauthClientSecretIv,
      stored.oauthClientSecretTag
    )
    const refreshToken = decField(stored.refreshTokenEnc, stored.refreshTokenIv, stored.refreshTokenTag)
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "OAuth Drive credentials incomplete or could not be decrypted. Re-paste Client ID, Client Secret, and Refresh token, then Save."
      )
    }
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
    oauth2.setCredentials({ refresh_token: refreshToken })
    return oauth2
  }

  const saJson = decField(
    stored.serviceAccountJsonEnc,
    stored.serviceAccountJsonIv,
    stored.serviceAccountJsonTag
  )
  if (!saJson) {
    throw new Error(
      "Service account JSON missing or could not be decrypted. Paste the JSON key again, or switch to OAuth mode."
    )
  }
  const credentials = JSON.parse(saJson)
  const email = stored.impersonateEmail || "info@trishulhub.in"
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: email,
  })
  return auth
}

export async function getDriveClient(): Promise<drive_v3.Drive> {
  const auth = await getAuthClient()
  return google.drive({ version: "v3", auth })
}

async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = [
    `'${parentId}' in parents`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ")
  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 5,
  })
  return res.data.files?.[0]?.id || null
}

export async function ensureDriveFolder(
  name: string,
  parentId?: string | null
): Promise<string> {
  const drive = await getDriveClient()
  if (parentId) {
    const existing = await findChildFolder(drive, parentId, name)
    if (existing) return existing
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  })
  if (!created.data.id) throw new Error("Failed to create Drive folder")
  return created.data.id
}

/** Ensure root + Review folders; persist IDs. */
export async function ensureRootAndReview(): Promise<{
  rootFolderId: string
  reviewFolderId: string
}> {
  const stored = await readStored()
  if (!stored) throw new Error("Drive not connected")

  let rootFolderId = stored.rootFolderId
  if (!rootFolderId) {
    rootFolderId = await ensureDriveFolder(DRIVE_ROOT_NAME, null)
  }
  let reviewFolderId = stored.reviewFolderId
  if (!reviewFolderId) {
    reviewFolderId = await ensureDriveFolder(DRIVE_REVIEW_NAME, rootFolderId)
  }

  if (rootFolderId !== stored.rootFolderId || reviewFolderId !== stored.reviewFolderId) {
    const next = { ...stored, rootFolderId, reviewFolderId }
    await db.appSetting.upsert({
      where: { key: FILE_DRIVE_SETTING_KEY },
      create: { key: FILE_DRIVE_SETTING_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
  }
  return { rootFolderId: rootFolderId!, reviewFolderId: reviewFolderId! }
}

export async function testDriveConnection(): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const drive = await getDriveClient()
    const about = await drive.about.get({ fields: "user(emailAddress,displayName)" })
    await ensureRootAndReview()
    return { ok: true, email: about.data.user?.emailAddress || undefined }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const lower = raw.toLowerCase()
    if (lower.includes("unauthorized_client")) {
      return {
        ok: false,
        error:
          "unauthorized_client — Client ID/Secret/Refresh token do not match. Use a Web OAuth client ID ending in .apps.googleusercontent.com (not an email), paste matching secret, then generate a NEW refresh token in OAuth Playground with those same credentials as info@trishulhub.in.",
      }
    }
    if (lower.includes("invalid_grant")) {
      return {
        ok: false,
        error:
          "invalid_grant — Refresh token is expired or was made with an old secret. Generate a NEW refresh token in OAuth Playground with the current Client ID + Secret, signed in as info@trishulhub.in, then Save all three again.",
      }
    }
    if (lower.includes("invalid_client")) {
      return {
        ok: false,
        error:
          "invalid_client — Client ID or Secret is wrong. Copy both from Google Cloud → APIs & Services → Credentials → your Web client.",
      }
    }
    return { ok: false, error: raw.slice(0, 280) }
  }
}

export async function moveDriveFile(fileId: string, newParentId: string, oldParentId?: string | null) {
  const drive = await getDriveClient()
  let removeParents = oldParentId || undefined
  if (!removeParents) {
    const meta = await drive.files.get({ fileId, fields: "parents" })
    removeParents = meta.data.parents?.[0]
  }
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: removeParents || undefined,
    fields: "id,parents",
  })
}

export async function renameDriveFile(fileId: string, name: string) {
  const drive = await getDriveClient()
  await drive.files.update({
    fileId,
    requestBody: { name },
    fields: "id,name",
  })
}

export async function shareDriveFolderWithEmail(
  folderId: string,
  email: string,
  role: "reader" | "writer" = "writer"
) {
  const drive = await getDriveClient()
  try {
    await drive.permissions.create({
      fileId: folderId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role,
        emailAddress: email,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // already shared is OK
    if (!/already|duplicate/i.test(msg)) throw err
  }
}

export async function unshareDriveFolderFromEmail(folderId: string, email: string) {
  const drive = await getDriveClient()
  const perms = await drive.permissions.list({
    fileId: folderId,
    fields: "permissions(id,emailAddress)",
  })
  const match = perms.data.permissions?.find(
    (p) => (p.emailAddress || "").toLowerCase() === email.toLowerCase()
  )
  if (match?.id) {
    await drive.permissions.delete({ fileId: folderId, permissionId: match.id })
  }
}

export async function uploadDriveFile(opts: {
  name: string
  mimeType: string
  parentId: string
  body: Buffer
}): Promise<{ id: string; webViewLink?: string | null }> {
  const drive = await getDriveClient()
  const { Readable } = await import("stream")
  const created = await drive.files.create({
    requestBody: {
      name: opts.name,
      parents: [opts.parentId],
    },
    media: {
      mimeType: opts.mimeType,
      body: Readable.from(opts.body),
    },
    fields: "id,webViewLink",
  })
  if (!created.data.id) throw new Error("Upload failed")
  // Fetch webViewLink if missing
  let webViewLink = created.data.webViewLink
  if (!webViewLink) {
    const meta = await drive.files.get({
      fileId: created.data.id,
      fields: "webViewLink",
    })
    webViewLink = meta.data.webViewLink
  }
  return { id: created.data.id, webViewLink }
}

export async function getDriveWebViewLink(fileId: string): Promise<string | null> {
  const drive = await getDriveClient()
  const meta = await drive.files.get({ fileId, fields: "webViewLink" })
  return meta.data.webViewLink || null
}

/** Detect typical mobile browser / app user-agents. */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua)
}

/**
 * Mobile Files access: allowed for SUPER_ADMIN / ADMIN only.
 * Everyone else must use a PC / desktop browser.
 */
export function isFilesMobileBlocked(
  ua: string | null | undefined,
  role: string | null | undefined
): boolean {
  if (!isMobileUserAgent(ua)) return false
  return role !== "SUPER_ADMIN" && role !== "ADMIN"
}
