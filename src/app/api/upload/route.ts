// File Upload API - Handles file uploads for agent chats and tasks
// Supports images, documents, code files, and more
// Files are saved to /public/uploads/ and metadata is returned

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { existsSync } from "fs"

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads")
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

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename
    const ext = path.extname(file.name) || `.${mimeType.split("/")[1] || "bin"}`
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 50)
    const uniqueName = `${timestamp}-${randomSuffix}-${safeName}`

    // Save file
    const filePath = path.join(UPLOAD_DIR, uniqueName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Build response
    const fileUrl = `/uploads/${uniqueName}`
    const category = getFileCategory(mimeType)
    const isImage = isImageType(mimeType)

    const fileMeta = {
      name: file.name,
      url: fileUrl,
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

// DELETE - Remove an uploaded file
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const fileUrl = searchParams.get("url")

    if (!fileUrl) {
      return NextResponse.json({ error: "File URL is required" }, { status: 400 })
    }

    // Security: only allow deleting files from uploads directory
    if (!fileUrl.startsWith("/uploads/")) {
      return NextResponse.json({ error: "Invalid file URL" }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), "public", fileUrl)
    if (!filePath.startsWith(path.join(process.cwd(), "public", "uploads"))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const { unlink } = await import("fs/promises")
    if (existsSync(filePath)) {
      await unlink(filePath)
    }

    return NextResponse.json({ success: true, message: "File deleted" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
