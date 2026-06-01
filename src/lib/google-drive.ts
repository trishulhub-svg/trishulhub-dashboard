// ━━ Google Drive Service Layer ━━
// Wraps Google Drive API v3 with service account authentication.
// All actual file storage happens in Google Drive — zero bytes in Vercel/Turso.

import { google } from "googleapis"

// ── Environment variable validation ──
function getCredentials() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "1th4v_mtGsQfeX3Im76as8MWGAURo2kVT"

  if (!clientEmail || !privateKey) {
    return null
  }

  // Handle escaped newlines in private key
  const cleanKey = privateKey.replace(/\\n/g, "\n")

  return { clientEmail, privateKey: cleanKey, folderId }
}

// ── Auth client (lazy initialized) ──
let authClient: ReturnType<typeof createAuth> | null = null

function createAuth() {
  const creds = getCredentials()
  if (!creds) return null

  return new google.auth.JWT({
    email: creds.clientEmail,
    key: creds.privateKey,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  })
}

function getAuth() {
  if (!authClient) {
    authClient = createAuth()
  }
  return authClient
}

function getDrive() {
  const auth = getAuth()
  if (!auth) return null
  return google.drive({ version: "v3", auth })
}

function getRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID || "1th4v_mtGsQfeX3Im76as8MWGAURo2kVT"
}

// ── Types ──
export interface DriveFileInfo {
  id: string
  name: string
  mimeType: string
  size: number
  parents?: string[]
  trashed: boolean
  description?: string
  thumbnailLink?: string
  webViewLink?: string
  modifiedTime?: string
  createdTime?: string
}

export interface DriveListResult {
  files: DriveFileInfo[]
  nextPageToken?: string
}

export interface StorageInfo {
  usedBytes: number
  totalBytes: number
}

// ── Helper: is folder MIME type ──
export function isFolder(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.folder"
}

// ── List files in a folder ──
export async function listFiles(
  folderId?: string,
  pageToken?: string,
  pageSize: number = 100,
  query?: string
): Promise<DriveListResult> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  const parent = folderId || getRootFolderId()
  if (!parent) throw new Error("Root folder ID not configured")

  // Build query: only list children of parent, exclude trashed by default
  const qParts = [`'${parent}' in parents`, "trashed = false"]
  if (query) {
    qParts.push(`name contains '${query.replace(/'/g, "\\'")}'`)
  }
  const q = qParts.join(" and ")

  const res = await drive.files.list({
    q,
    pageSize,
    pageToken,
    fields: "nextPageToken, files(id, name, mimeType, size, parents, trashed, description, thumbnailLink, webViewLink, modifiedTime, createdTime)",
    orderBy: "folder, name",
  })

  const files: DriveFileInfo[] = (res.data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: parseInt(f.size || "0", 10),
    parents: f.parents || [],
    trashed: f.trashed || false,
    description: f.description || undefined,
    thumbnailLink: f.thumbnailLink || undefined,
    webViewLink: f.webViewLink || undefined,
    modifiedTime: f.modifiedTime || undefined,
    createdTime: f.createdTime || undefined,
  }))

  return {
    files,
    nextPageToken: res.data.nextPageToken || undefined,
  }
}

// ── Get file metadata ──
export async function getFile(fileId: string): Promise<DriveFileInfo | null> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  try {
    const res = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size, parents, trashed, description, thumbnailLink, webViewLink, modifiedTime, createdTime",
    })

    return {
      id: res.data.id!,
      name: res.data.name || "",
      mimeType: res.data.mimeType || "",
      size: parseInt(String(res.data.size || "0"), 10),
      parents: res.data.parents || [],
      trashed: res.data.trashed || false,
      description: res.data.description || undefined,
      thumbnailLink: res.data.thumbnailLink || undefined,
      webViewLink: res.data.webViewLink || undefined,
      modifiedTime: res.data.modifiedTime || undefined,
      createdTime: res.data.createdTime || undefined,
    }
  } catch (err: any) {
    if (err?.code === 404) return null
    throw err
  }
}

// ── Upload file to Drive ──
export async function uploadFile(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  description?: string
): Promise<DriveFileInfo> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  const parent = folderId || getRootFolderId()!
  const isImage = mimeType.startsWith("image/")

  // For images, use resumable upload
  if (isImage && buffer.length > 0) {
    // Create the file metadata
    const fileMetadata: any = {
      name: fileName,
      parents: [parent],
    }
    if (description) fileMetadata.description = description

    const media = {
      mimeType,
      body: buffer as any, // googleapis expects a stream-like object
    }

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, name, mimeType, size, parents, description, thumbnailLink, webViewLink",
    })

    return {
      id: res.data.id!,
      name: res.data.name || fileName,
      mimeType: res.data.mimeType || mimeType,
      size: parseInt(String(res.data.size || "0"), 10),
      parents: res.data.parents || [parent],
      trashed: false,
      description: res.data.description || description,
      thumbnailLink: res.data.thumbnailLink || undefined,
      webViewLink: res.data.webViewLink || undefined,
    }
  }

  // For non-image files
  const fileMetadata: any = {
    name: fileName,
    parents: [parent],
  }
  if (description) fileMetadata.description = description

  const media = {
    mimeType,
    body: buffer as any,
  }

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, name, mimeType, size, parents, description, thumbnailLink, webViewLink",
  })

  return {
    id: res.data.id!,
    name: res.data.name || fileName,
    mimeType: res.data.mimeType || mimeType,
    size: parseInt(String(res.data.size || "0"), 10),
    parents: res.data.parents || [parent],
    trashed: false,
    description: res.data.description || description,
    thumbnailLink: res.data.thumbnailLink || undefined,
    webViewLink: res.data.webViewLink || undefined,
  }
}

// ── Create folder in Drive ──
export async function createFolder(
  parentFolderId: string,
  folderName: string
): Promise<DriveFileInfo> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  const parent = parentFolderId || getRootFolderId()!

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parent],
    },
    fields: "id, name, mimeType, size, parents, webViewLink",
  })

  return {
    id: res.data.id!,
    name: res.data.name || folderName,
    mimeType: "application/vnd.google-apps.folder",
    size: 0,
    parents: res.data.parents || [parent],
    trashed: false,
    webViewLink: res.data.webViewLink || undefined,
  }
}

// ── Rename file/folder ──
export async function renameFile(fileId: string, newName: string): Promise<DriveFileInfo> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  await drive.files.update({
    fileId,
    requestBody: { name: newName },
  })

  const updated = await getFile(fileId)
  if (!updated) throw new Error("File not found after rename")
  return updated
}

// ── Move file to different folder ──
export async function moveFile(fileId: string, newParentId: string): Promise<void> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  // Get current parents
  const file = await drive.files.get({
    fileId,
    fields: "parents",
  })

  const previousParents = (file.data.parents || []).join(",")

  await drive.files.update({
    fileId,
    requestBody: {},
    addParents: newParentId,
    removeParents: previousParents,
  })
}

// ── Delete file (trash or permanent) ──
export async function deleteFile(fileId: string, permanent: boolean = false): Promise<void> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  if (permanent) {
    await drive.files.delete({ fileId })
  } else {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
    })
  }
}

// ── Get download URL for a file ──
export async function getDownloadUrl(fileId: string): Promise<string | null> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  try {
    await drive.files.get({
      fileId,
      fields: "id",
      alt: "media",
    })

    // Use export for Google Docs types
    const fileInfo = await getFile(fileId)
    if (!fileInfo) return null

    if (fileInfo.mimeType.startsWith("application/vnd.google-apps.")) {
      // Google Docs native format - export as PDF
      const exportMime = "application/pdf"
      const res = await drive.files.export({
        fileId,
        mimeType: exportMime,
      })

      // export doesn't return a URL directly, but we can construct one
      return `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportMime}`
    }

    // Regular file - generate webContentLink
    return `https://drive.google.com/uc?export=download&id=${fileId}`
  } catch (err: any) {
    console.error("[google-drive] Failed to get download URL:", err?.message)
    return null
  }
}

// ── Search files across Drive ──
export async function searchFiles(
  query: string,
  pageToken?: string,
  pageSize: number = 50
): Promise<DriveListResult> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  const rootFolder = getRootFolderId()

  // Search within the root folder hierarchy
  const q = `(name contains '${query.replace(/'/g, "\\'")}') and trashed = false and '${rootFolder}' in parents`

  const res = await drive.files.list({
    q,
    pageSize,
    pageToken,
    fields: "nextPageToken, files(id, name, mimeType, size, parents, trashed, description, thumbnailLink, webViewLink, modifiedTime)",
    orderBy: "modifiedTime desc",
  })

  const files: DriveFileInfo[] = (res.data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: parseInt(f.size || "0", 10),
    parents: f.parents || [],
    trashed: f.trashed || false,
    description: f.description || undefined,
    thumbnailLink: f.thumbnailLink || undefined,
    webViewLink: f.webViewLink || undefined,
    modifiedTime: f.modifiedTime || undefined,
  }))

  return {
    files,
    nextPageToken: res.data.nextPageToken || undefined,
  }
}

// ── Get storage usage ──
export async function getStorageUsage(): Promise<StorageInfo> {
  const drive = getDrive()
  if (!drive) {
    return { usedBytes: 0, totalBytes: 0 }
  }

  try {
    const res = await drive.about.get({
      fields: "storageQuota",
    })

    const quota = res.data.storageQuota
    return {
      usedBytes: parseInt(String(quota?.usage || "0"), 10),
      totalBytes: parseInt(String(quota?.limit || "0"), 10),
    }
  } catch (err) {
    console.error("[google-drive] Failed to get storage usage:", err)
    return { usedBytes: 0, totalBytes: 0 }
  }
}

// ── Update file description ──
export async function updateDescription(
  fileId: string,
  description: string
): Promise<void> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  await drive.files.update({
    fileId,
    requestBody: { description },
  })
}

// ── Restore file from trash ──
export async function restoreFile(fileId: string): Promise<void> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  await drive.files.update({
    fileId,
    requestBody: { trashed: false },
  })
}

// ── Empty trash (delete all trashed files permanently) ──
export async function emptyTrash(): Promise<void> {
  const drive = getDrive()
  if (!drive) throw new Error("Google Drive credentials not configured")

  await drive.files.emptyTrash()
}

// ── Check if Drive is configured (credentials + folder ID) ──
export function isConfigured(): boolean {
  const creds = getCredentials()
  return creds !== null && getRootFolderId() !== null
}

// ── Check if folder ID is configured (independent of credentials) ──
export function isFolderConfigured(): boolean {
  return getRootFolderId() !== null
}

// ── Get root folder ID ──
export function getRootId(): string | null {
  return getRootFolderId()
}
