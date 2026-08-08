/**
 * Google Drive client for Trishulhub Files.
 * Credentials live encrypted in AppSetting (Super Admin editable).
 * Preferred auth: service account + domain-wide delegation as info@trishulhub.in
 */

import { google, drive_v3 } from "googleapis"
import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"

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
  const stored = await readStored()
  if (!stored) {
    return {
      connected: false,
      mode: "SERVICE_ACCOUNT",
      impersonateEmail: "info@trishulhub.in",
      rootFolderId: null,
      reviewFolderId: null,
      hasServiceAccountJson: false,
      hasOAuthClient: false,
      hasRefreshToken: false,
    }
  }
  const hasSa = Boolean(stored.serviceAccountJsonEnc)
  const hasOauth =
    Boolean(stored.oauthClientIdEnc) && Boolean(stored.oauthClientSecretEnc)
  const hasRefresh = Boolean(stored.refreshTokenEnc)
  const connected =
    stored.mode === "SERVICE_ACCOUNT"
      ? hasSa && Boolean(stored.impersonateEmail)
      : hasOauth && hasRefresh

  const row = await db.appSetting.findUnique({ where: { key: FILE_DRIVE_SETTING_KEY } })
  return {
    connected,
    mode: stored.mode || "SERVICE_ACCOUNT",
    impersonateEmail: stored.impersonateEmail || "info@trishulhub.in",
    rootFolderId: stored.rootFolderId || null,
    reviewFolderId: stored.reviewFolderId || null,
    clientEmail: stored.clientEmail || null,
    hasServiceAccountJson: hasSa,
    hasOAuthClient: hasOauth,
    hasRefreshToken: hasRefresh,
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

  const prev = (await readStored()) || {
    mode: "SERVICE_ACCOUNT" as const,
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

  if (input.oauthClientId && input.oauthClientId.trim()) {
    const e = encField(input.oauthClientId.trim())
    next.oauthClientIdEnc = e.encrypted
    next.oauthClientIdIv = e.iv
    next.oauthClientIdTag = e.tag
  }
  if (input.oauthClientSecret && input.oauthClientSecret.trim()) {
    const e = encField(input.oauthClientSecret.trim())
    next.oauthClientSecretEnc = e.encrypted
    next.oauthClientSecretIv = e.iv
    next.oauthClientSecretTag = e.tag
  }
  if (input.refreshToken && input.refreshToken.trim()) {
    const e = encField(input.refreshToken.trim())
    next.refreshTokenEnc = e.encrypted
    next.refreshTokenIv = e.iv
    next.refreshTokenTag = e.tag
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
  if (!stored) throw new Error("Google Drive is not connected. Super Admin must save credentials in Files → Settings.")

  if (stored.mode === "OAUTH") {
    const clientId = decField(stored.oauthClientIdEnc, stored.oauthClientIdIv, stored.oauthClientIdTag)
    const clientSecret = decField(
      stored.oauthClientSecretEnc,
      stored.oauthClientSecretIv,
      stored.oauthClientSecretTag
    )
    const refreshToken = decField(stored.refreshTokenEnc, stored.refreshTokenIv, stored.refreshTokenTag)
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("OAuth Drive credentials incomplete")
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
  if (!saJson) throw new Error("Service account JSON missing")
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
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
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

/** Block typical mobile app UAs for Files APIs (PC / desktop browser only). */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua)
}
