// File Upload API - Handles file uploads for agent chats and tasks
// Returns base64 data URLs instead of saving to filesystem
// This works on Vercel's read-only serverless environment

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
  code: [
    "text/javascript",
    "text/typescript",
    "text/html",
    "text/css",
    "application/json",
    "text/xml",
    "text/markdown",
  ],
  archive: ["application/zip", "application/x-tar", "application/gzip"],
}

const ALL_ALLOWED = Object.values(ALLOWED_TYPES).flat()

function getFileCategory(mimeType: string): string {
  for (const [category, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) return category
  }
  return "other"
}

function isImageType(mimeType: string): boolean {
  return ALLOWED_TYPES.image.includes(mimeType)
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const agentId = formData.get("agentId") as string | null
    const chatId = formData.get("chatId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      }, { status: 400 })
    }

    // Check file type
    const mimeType = file.type || "application/octet-stream"
    if (!ALL_ALLOWED.includes(mimeType) && !mimeType.startsWith("text/")) {
      return NextResponse.json({
        error: `File type "${mimeType}" not allowed. Allowed types: images, documents, code files, archives.`,
      }, { status: 400 })
    }

    // Convert file to base64 data URL (no filesystem writes needed)
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64Data = buffer.toString("base64")
    const dataUrl = `data:${mimeType};base64,${base64Data}`

    // Build response with data URL
    const category = getFileCategory(mimeType)
    const isImage = isImageType(mimeType)

    const fileMeta = {
      name: file.name,
      url: dataUrl,
      size: file.size,
      type: mimeType,
      category,
      isImage,
      agentId,
      chatId,
      uploadedAt: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      file: fileMeta,
    })
  } catch (error: any) {
    console.error("[upload] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - No-op since files are not stored on filesystem
// Kept for API compatibility
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Files are now stored as base64 data URLs, no filesystem cleanup needed
    return NextResponse.json({ success: true, message: "File reference removed" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
