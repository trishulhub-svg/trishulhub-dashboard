import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { roundMoney } from "@/lib/money"
import { z } from "zod"

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive("Amount must be greater than 0"),
  method: z.string().max(50).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  paidAt: z.string().datetime().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`invoice-payments-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = paymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const { invoiceId, amount, method, note, paidAt } = parsed.data

    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: roundMoney(amount),
          method: method ?? null,
          note: note ?? null,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
        },
      })

      const agg = await tx.payment.aggregate({
        where: { invoiceId },
        _sum: { amount: true },
      })
      const paidTotal = roundMoney(agg._sum.amount ?? 0)
      const invoiceTotal = roundMoney(invoice.total)

      let updatedInvoice = invoice
      if (paidTotal >= invoiceTotal) {
        updatedInvoice = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            paymentStatus: "PAID",
            status: "PAID",
            paidAt: payment.paidAt,
            ...(method ? { paymentMethod: method } : {}),
          },
        })
      }

      return { payment, invoice: updatedInvoice, paidTotal }
    })

    return NextResponse.json(deepSanitize(result), { status: 201 })
  } catch (error: unknown) {
    console.error("[invoice-payments] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 })
  }
}
