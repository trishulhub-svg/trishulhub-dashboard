import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessFinance } from "@/lib/rbac";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildAgencyFinanceOverview,
  type AgencyFinanceInput,
} from "@/lib/agency-finance";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessFinance(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rl = rateLimit(
      `finance-overview-${session.user.id}`,
      RATE_LIMITS.finance.limit,
      RATE_LIMITS.finance.windowMs
    );
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const requestedMonths = Number(new URL(req.url).searchParams.get("months") || 6);
    const months = Math.min(Math.max(Number.isFinite(requestedMonths) ? requestedMonths : 6, 1), 12);

    const [projects, invoices, expenses, subscriptions, timeEntries] = await Promise.all([
      db.project.findMany({
        where: { isDemo: false },
        select: {
          id: true,
          name: true,
          status: true,
          budget: true,
          clientId: true,
          client: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      db.invoice.findMany({
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          projectId: true,
          clientId: true,
          client: { select: { name: true } },
          project: { select: { name: true } },
          payments: { select: { amount: true, paidAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      db.expense.findMany({
        select: { amount: true, date: true, projectId: true },
        orderBy: { date: "desc" },
        take: 20000,
      }),
      db.subscription.findMany({
        select: {
          amount: true,
          frequency: true,
          status: true,
          startDate: true,
          endDate: true,
          projectId: true,
        },
        take: 5000,
      }),
      db.timeEntry.findMany({
        where: { status: "COMPLETED" },
        select: { projectId: true, totalHours: true, date: true },
        orderBy: { date: "desc" },
        take: 30000,
      }),
    ]);

    const input: AgencyFinanceInput = {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        budget: project.budget,
        clientId: project.clientId,
        clientName: project.client?.name || null,
      })),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        projectId: invoice.projectId,
        projectName: invoice.project?.name || null,
        clientId: invoice.clientId,
        clientName: invoice.client.name,
        payments: invoice.payments,
      })),
      expenses,
      subscriptions,
      timeEntries,
    };

    return NextResponse.json(buildAgencyFinanceOverview(input, { months }));
  } catch (error: unknown) {
    console.error("[finance/overview] GET error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load agency finance overview" }, { status: 500 });
  }
}
