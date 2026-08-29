"use client";

import { ChevronDown, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FinanceReportsPanel } from "@/components/dashboard/finance/finance-reports-panel";

type FinanceReportSectionProps = {
  defaultOpen?: boolean;
};

export function FinanceReportSection({ defaultOpen = false }: FinanceReportSectionProps) {
  return (
    <details
      open={defaultOpen || undefined}
      className="group overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Generate finance report</span>
          <span className="block text-xs text-muted-foreground">
            Choose a date range and save a PDF, Google Sheet or Google Doc to Drive
          </span>
        </span>
        <Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">
          Drive synced
        </Badge>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/60 bg-muted/10 p-3 sm:p-4">
        <FinanceReportsPanel />
      </div>
    </details>
  );
}
