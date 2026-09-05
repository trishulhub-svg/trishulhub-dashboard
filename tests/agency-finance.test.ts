import { describe, expect, it } from "vitest";
import { buildAgencyFinanceOverview } from "@/lib/agency-finance";

const now = new Date("2026-09-05T12:00:00.000Z");

describe("agency finance overview", () => {
  it("connects invoices, payments, project costs, recurring costs and tracked time", () => {
    const overview = buildAgencyFinanceOverview(
      {
        projects: [
          { id: "p1", name: "Client portal", status: "IN_PROGRESS", budget: 1_000, clientId: "c1", clientName: "Acme" },
        ],
        invoices: [
          {
            id: "i1",
            invoiceNumber: "INV-1",
            total: 1_200,
            status: "SENT",
            dueDate: "2026-08-20T00:00:00.000Z",
            paidAt: null,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            projectId: "p1",
            projectName: "Client portal",
            clientId: "c1",
            clientName: "Acme",
            payments: [{ amount: 400, paidAt: "2026-09-02T00:00:00.000Z" }],
          },
        ],
        expenses: [
          { amount: 300, date: "2026-09-03T00:00:00.000Z", projectId: "p1" },
          { amount: 50, date: "2026-09-04T00:00:00.000Z", projectId: null },
        ],
        subscriptions: [
          {
            amount: 120,
            frequency: "YEARLY",
            status: "ACTIVE",
            startDate: "2026-08-01T00:00:00.000Z",
            endDate: null,
            projectId: "p1",
          },
        ],
        timeEntries: [{ projectId: "p1", totalHours: 12.5, date: "2026-09-03T00:00:00.000Z" }],
      },
      { months: 3, now }
    );

    expect(overview.summary.cashCollected).toBe(400);
    expect(overview.summary.outstanding).toBe(800);
    expect(overview.summary.overdue).toBe(800);
    expect(overview.summary.recordedCosts).toBe(360);
    expect(overview.summary.recordedResult).toBe(40);
    expect(overview.attention.unassignedExpenses).toEqual({ count: 1, amount: 50 });

    expect(overview.projects[0]).toMatchObject({
      id: "p1",
      invoiced: 1_200,
      collected: 400,
      outstanding: 800,
      directExpenses: 300,
      monthlyRecurringCost: 10,
      trackedHours: 12.5,
    });
    expect(overview.projects[0].recordedCosts).toBe(310);
    expect(overview.projects[0].health).toBe("HEALTHY");
  });

  it("counts paid legacy invoices without payment rows once", () => {
    const overview = buildAgencyFinanceOverview(
      {
        projects: [],
        invoices: [
          {
            id: "legacy",
            invoiceNumber: "INV-OLD",
            total: 500,
            status: "PAID",
            dueDate: null,
            paidAt: "2026-09-01T00:00:00.000Z",
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            projectId: null,
            projectName: null,
            clientId: "c1",
            clientName: "Acme",
            payments: [],
          },
        ],
        expenses: [],
        subscriptions: [],
        timeEntries: [],
      },
      { months: 1, now }
    );

    expect(overview.summary.cashCollected).toBe(500);
    expect(overview.summary.outstanding).toBe(0);
    expect(overview.clients[0].collected).toBe(500);
  });

  it("flags project budget pressure without treating missing budgets as zero", () => {
    const overview = buildAgencyFinanceOverview(
      {
        projects: [
          { id: "over", name: "Over", status: "IN_PROGRESS", budget: 100, clientId: null, clientName: null },
          { id: "watch", name: "Watch", status: "IN_PROGRESS", budget: 100, clientId: null, clientName: null },
          { id: "missing", name: "Missing", status: "PLANNING", budget: null, clientId: null, clientName: null },
        ],
        invoices: [],
        expenses: [
          { amount: 110, date: "2026-09-01T00:00:00.000Z", projectId: "over" },
          { amount: 85, date: "2026-09-01T00:00:00.000Z", projectId: "watch" },
        ],
        subscriptions: [],
        timeEntries: [],
      },
      { months: 1, now }
    );

    expect(overview.projects.map((project) => [project.id, project.health])).toEqual([
      ["over", "OVER_BUDGET"],
      ["watch", "WATCH"],
      ["missing", "MISSING_BUDGET"],
    ]);
    expect(overview.attention).toMatchObject({
      projectsOverBudget: 1,
      projectsAtRisk: 1,
      projectsMissingBudget: 1,
    });
  });

  it("includes current one-time tools and historical stopped subscriptions in the right periods", () => {
    const overview = buildAgencyFinanceOverview(
      {
        projects: [],
        invoices: [],
        expenses: [],
        subscriptions: [
          {
            amount: 60,
            frequency: "MONTHLY",
            status: "STOPPED",
            startDate: "2026-07-01T00:00:00.000Z",
            endDate: "2026-08-20T00:00:00.000Z",
            projectId: null,
          },
          {
            amount: 90,
            frequency: "ONE_TIME",
            status: "COMPLETED",
            startDate: "2026-09-02T00:00:00.000Z",
            endDate: "2026-09-02T00:00:00.000Z",
            projectId: null,
          },
        ],
        timeEntries: [],
      },
      { months: 3, now }
    );

    expect(overview.summary.oneTimeCosts).toBe(90);
    expect(overview.summary.recordedCosts).toBe(90);
    expect(overview.trend).toEqual([
      { month: "Jul", invoiced: 0, collected: 0, costs: 60 },
      { month: "Aug", invoiced: 0, collected: 0, costs: 60 },
      { month: "Sept", invoiced: 0, collected: 0, costs: 90 },
    ]);
  });
});
