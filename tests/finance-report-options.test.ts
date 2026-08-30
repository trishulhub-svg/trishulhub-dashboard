import { describe, expect, it } from "vitest";
import {
  buildFinanceSheetTabs,
  renderFinanceXlsx,
  type FinanceReportData,
} from "@/lib/finance-report";

const reportData: FinanceReportData = {
  period: { from: "2026-08-01", to: "2026-08-29" },
  generatedAt: "2026-08-29T12:00:00.000Z",
  generatedBy: "Admin",
  filterUser: null,
  summary: {
    totalInvoiced: 1000,
    totalPaid: 750,
    totalOutstanding: 250,
    totalExpenses: 200,
    totalSubscriptionsMonthly: 50,
    netProfit: 550,
  },
  invoices: [{ number: "INV-1", client: "Client", total: 1000 }],
  payments: [{ invoice: "INV-1", amount: 750 }],
  expenses: [{ date: "2026-08-10", description: "Hosting", amount: 200 }],
  subscriptions: [{ service: "Cloud", amount: 50 }],
  earnings: [],
  clients: [{ name: "Client", invoiced: 1000, paid: 750 }],
};

describe("finance report exports", () => {
  it("builds a detailed Google Sheet with the core finance tabs", () => {
    const tabs = buildFinanceSheetTabs(reportData);

    expect(tabs.map((tab) => tab.title)).toEqual([
      "Summary",
      "Invoices",
      "Payments",
      "Expenses",
      "Subscriptions",
      "Clients",
    ]);
    expect(tabs.find((tab) => tab.title === "Expenses")?.headers).toContain("Receipt URL");
    expect(tabs.find((tab) => tab.title === "Invoices")?.headers).toContain("Payment Status");
  });

  it("creates an importable workbook without calling the Google Sheets API", async () => {
    const workbook = await renderFinanceXlsx(reportData);

    expect(Buffer.isBuffer(workbook)).toBe(true);
    expect(workbook.byteLength).toBeGreaterThan(1000);
    expect(workbook.subarray(0, 2).toString()).toBe("PK");
  });
});
