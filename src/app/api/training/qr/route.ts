import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { notifyUsers } from "@/lib/notify"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { z } from "zod"

const IMAGE_DATA_URL =
  /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i

const uploadSchema = z.object({
  imageData: z.string().min(32).max(3_500_000),
})

async function ensureTrainingQrTables() {
  try {
    await Promise.race([
      (async () => {
        await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TrainingQr" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "imageData" TEXT NOT NULL,
          "mimeType" TEXT NOT NULL DEFAULT 'image/png',
          "uploadedById" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT 1,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`)
        await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TrainingQrRequest" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "note" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "fulfilledAt" DATETIME,
          "fulfilledByQrId" TEXT
        )`)
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ])
  } catch {
    /* table may already exist or migrate later */
  }
}

async function getLatestActiveQr() {
  return db.trainingQr.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      imageData: true,
      mimeType: true,
      uploadedById: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  })
}

/**
 * GET /api/training/qr
 * Latest active training QR + request status for the current user.
 * SuperAdmin also receives pending request count + requester names.
 */
export async function GET() {
  try {
    await ensureTrainingQrTables()
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const role = session.user.role || ""
    const canManage = isAdmin(role)

    const [qr, myPending, pendingCount, pendingRequesters] = await Promise.all([
      getLatestActiveQr(),
      db.trainingQrRequest.findFirst({
        where: { userId, status: "PENDING" },
        select: { id: true, createdAt: true },
      }),
      canManage
        ? db.trainingQrRequest.count({ where: { status: "PENDING" } })
        : Promise.resolve(0),
      canManage
        ? db.trainingQrRequest.findMany({
            where: { status: "PENDING" },
            orderBy: { createdAt: "asc" },
            take: 20,
            select: {
              id: true,
              createdAt: true,
              user: { select: { id: true, name: true, email: true } },
            },
          })
        : Promise.resolve([]),
    ])

    return NextResponse.json({
      qr: qr
        ? {
            id: qr.id,
            imageData: qr.imageData,
            mimeType: qr.mimeType,
            createdAt: qr.createdAt,
            updatedAt: qr.updatedAt,
            uploadedBy: qr.uploadedBy,
          }
        : null,
      hasPendingRequest: !!myPending,
      pendingRequestAt: myPending?.createdAt ?? null,
      pendingCount: canManage ? pendingCount : undefined,
      pendingRequesters: canManage ? pendingRequesters : undefined,
      isSuperAdmin: canManage,
      isAdmin: canManage,
    })
  } catch (err) {
    console.error("[training/qr GET]", err)
    return NextResponse.json({ error: "Failed to load training QR" }, { status: 500 })
  }
}

/**
 * POST /api/training/qr
 * SuperAdmin upload/replace. Notifies only users with PENDING requests
 * created before this upload (cohort since last QR), then marks them fulfilled.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureTrainingQrTables()
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isAdmin(session.user.role || "")) {
      return NextResponse.json({ error: "Only Admin or Super Admin can upload the training QR" }, { status: 403 })
    }

    const body = await req.json()
    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid image payload" }, { status: 400 })
    }

    const match = IMAGE_DATA_URL.exec(parsed.data.imageData)
    if (!match) {
      return NextResponse.json(
        { error: "Image must be a PNG, JPEG, WebP, or GIF data URL" },
        { status: 400 }
      )
    }
    const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg")

    const pending = await db.trainingQrRequest.findMany({
      where: { status: "PENDING" },
      select: { id: true, userId: true },
    })

    // Deactivate previous active QR(s), then create the new one
    await db.trainingQr.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    const qr = await db.trainingQr.create({
      data: {
        imageData: parsed.data.imageData,
        mimeType,
        uploadedById: session.user.id,
        isActive: true,
      },
      select: {
        id: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    })

    // Smart notify: only the pending cohort for THIS upload (A then B example)
    const requesterIds = [...new Set(pending.map((p) => p.userId))]
    if (requesterIds.length > 0) {
      void notifyUsers({
        userIds: requesterIds,
        title: "New training QR available",
        message:
          "A new Percipio login QR has been uploaded. Open Learning to scan and log in.",
        type: "SUCCESS",
        link: "/dashboard/training/my",
        metadata: { trainingQrId: qr.id, kind: "training_qr_updated" },
      })

      await db.trainingQrRequest.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: {
          status: "FULFILLED",
          fulfilledAt: new Date(),
          fulfilledByQrId: qr.id,
        },
      })
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "LEARNING",
      page: "training",
      action: "CREATE",
      entityType: "TrainingQr",
      entityId: qr.id,
      description: `Uploaded training QR (notified ${requesterIds.length} pending requester${requesterIds.length === 1 ? "" : "s"})`,
      newValue: JSON.stringify({ mimeType: qr.mimeType, notifiedCount: requesterIds.length }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      ok: true,
      qr: {
        id: qr.id,
        imageData: parsed.data.imageData,
        mimeType: qr.mimeType,
        createdAt: qr.createdAt,
        updatedAt: qr.updatedAt,
        uploadedBy: qr.uploadedBy,
      },
      notifiedCount: requesterIds.length,
    })
  } catch (err) {
    console.error("[training/qr POST]", err)
    return NextResponse.json({ error: "Failed to upload training QR" }, { status: 500 })
  }
}

/**
 * DELETE /api/training/qr
 * SuperAdmin removes the active QR. Pending requests stay pending.
 */
export async function DELETE() {
  try {
    await ensureTrainingQrTables()
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isAdmin(session.user.role || "")) {
      return NextResponse.json({ error: "Only Admin or Super Admin can delete the training QR" }, { status: 403 })
    }

    const result = await db.trainingQr.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "LEARNING",
      page: "training",
      action: "DELETE",
      entityType: "TrainingQr",
      description: `Deactivated active training QR (${result.count} record${result.count === 1 ? "" : "s"})`,
      newValue: JSON.stringify({ deactivated: result.count }),
    })

    return NextResponse.json({ ok: true, deactivated: result.count })
  } catch (err) {
    console.error("[training/qr DELETE]", err)
    return NextResponse.json({ error: "Failed to delete training QR" }, { status: 500 })
  }
}
