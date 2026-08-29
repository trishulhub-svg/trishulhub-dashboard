"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FileType2,
  LineChart,
  Loader2,
  Save,
  Sheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFinanceLiveRefresh } from "@/lib/finance-events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FinanceReportsPanel } from "@/components/dashboard/finance/finance-reports-panel";

const FILTERS = [
  { key: "profit", label: "Profit", axis: "money" as const },
  { key: "loss", label: "Loss", axis: "money" as const },
  { key: "revenue", label: "Revenue", axis: "money" as const },
  { key: "expenses", label: "Expenses", axis: "money" as const },
  { key: "salary", label: "Salary", axis: "money" as const },
  { key: "performance", label: "Employee performance", axis: "money" as const },
  { key: "projects", label: "Projects", axis: "count" as const },
  { key: "clients", label: "Clients", axis: "count" as const },
  { key: "crm", label: "CRM", axis: "count" as const },
  { key: "time", label: "Time tracking", axis: "count" as const },
  { key: "audit", label: "Audit", axis: "count" as const },
] as const;

type Tab = "normal" | "graph";
type NormalMode = "month" | "year";

const MONEY_KEYS = new Set(["profit", "loss", "revenue", "expenses", "salary", "performance"]);
const COUNT_KEYS = new Set(["projects", "clients", "crm", "time", "audit"]);

const PnLChart = dynamic(() => import("./pnl-chart"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading chart…
    </div>
  ),
});

export default function PnLPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("normal");
  const [normalMode, setNormalMode] = useState<NormalMode>("month");
  const [months, setMonths] = useState<Array<Record<string, number | string>>>([]);
  const [years, setYears] = useState<Array<Record<string, number | string>>>([]);
  const [graph, setGraph] = useState<Array<Record<string, number | string>>>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>(["profit", "revenue", "expenses"]);
  const [windowStart, setWindowStart] = useState(0);
  // Latest period first by default; controller to flip the order.
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [savingReport, setSavingReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    if (status === "loading") return;
    const role = session?.user?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      // Full series always — filter toggles are client-only (no stale graph keys)
      const res = await fetch("/api/finance/pnl?categories=all", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (res.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      if (id !== requestId.current) return;
      const nextGraph = Array.isArray(data.graph) ? data.graph : [];
      setMonths(Array.isArray(data.months) ? data.months : []);
      setYears(Array.isArray(data.years) ? data.years : []);
      setGraph(nextGraph);
      setTotals(data.totals || {});
      setNote(data.note || "");
      setWindowStart(Math.max(0, nextGraph.length - 12));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to load P&L");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [router]);

  useFinanceLiveRefresh(() => {
    void load();
  });

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const windowed = useMemo(() => {
    return graph.slice(windowStart, windowStart + 12);
  }, [graph, windowStart]);

  // Periods for the normal table — newest first by default (controller flips).
  const periodList = normalMode === "month" ? months : years;
  const sortedPeriods = useMemo(() => {
    return [...periodList].sort((a, b) => {
      const cmp = String(a.key).localeCompare(String(b.key));
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [periodList, sortDir]);

  /** Export the visible P&L span to a finance report saved straight to Drive. */
  const saveReportToDrive = useCallback(
    async (format: "pdf" | "xlsx" | "docx" | "sheets") => {
      if (periodList.length === 0) {
        toast.error("No P&L data to export yet");
        return;
      }
      const keys = periodList.map((p) => String(p.key)).sort();
      const firstKey = keys[0];
      const lastKey = keys[keys.length - 1];
      let from: string;
      let to: string;
      if (normalMode === "month") {
        const [ly, lm] = lastKey.split("-").map(Number);
        const lastDay = new Date(ly, lm, 0).getDate();
        from = `${firstKey}-01`;
        to = `${lastKey}-${String(lastDay).padStart(2, "0")}`;
      } else {
        from = `${firstKey}-01-01`;
        to = `${lastKey}-12-31`;
      }
      setSavingReport(true);
      try {
        const res = await fetch("/api/finance/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ from, to, format }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success(`P&L saved to Drive → Finance Reports`);
        } else {
          toast.error((data as { error?: string })?.error || "Failed to save P&L report");
        }
      } catch {
        toast.error("Failed to save P&L report");
      } finally {
        setSavingReport(false);
      }
    },
    [periodList, normalMode]
  );

  const hasMoneySeries = selected.some((k) => MONEY_KEYS.has(k));
  const hasCountSeries = selected.some((k) => COUNT_KEYS.has(k));

  const toggle = (key: string) => {
    setSelected((prev) => {
      if (prev.includes(key)) {
        // Keep at least one filter selected
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const fmt = (n: number) =>
    `£${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n || 0)}`;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/finance"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <LineChart className="h-6 w-6 text-emerald-600" />
              P &amp; L with Personal
            </h1>
            <p className="text-sm text-muted-foreground">
              Company profit &amp; loss in GBP · Normal table + journey graph
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
          {(["normal", "graph"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md capitalize",
                tab === t ? "bg-background shadow-sm" : "text-muted-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Revenue (GBP)", value: totals.revenueGBP },
          { label: "Expenses (GBP)", value: totals.expensesGBP },
          { label: "Salary (GBP)", value: totals.salaryGBP },
          { label: "Profit (GBP)", value: totals.profitGBP },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-background/70 p-3">
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{fmt(Number(c.value || 0))}</p>
          </div>
        ))}
      </div>

      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tab === "normal" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg border p-1 bg-muted/30 w-fit">
                {(["month", "year"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNormalMode(m)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-md capitalize",
                      normalMode === m ? "bg-background shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    By {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border bg-background text-muted-foreground hover:bg-muted/50"
                title="Change period order"
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortDir === "desc" ? "Newest first" : "Oldest first"}
              </button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={savingReport || periodList.length === 0}>
                  {savingReport ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  Save to Drive
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => void saveReportToDrive("pdf")} disabled={savingReport}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void saveReportToDrive("xlsx")} disabled={savingReport}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Excel (XLSX)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void saveReportToDrive("docx")} disabled={savingReport}>
                  <FileType2 className="h-3.5 w-3.5 mr-2" /> Word (DOCX)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void saveReportToDrive("sheets")} disabled={savingReport}>
                  <Sheet className="h-3.5 w-3.5 mr-2" /> Google Sheets
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <p className="px-2 py-1 text-[10px] text-muted-foreground leading-snug">
                  Saved under Finance Reports → period folder as a native Google Sheet, and
                  appears in Files + Finance → Reports.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{normalMode === "month" ? "Month" : "Year"}</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Expenses</th>
                  <th className="px-3 py-2">Salary</th>
                  <th className="px-3 py-2">Profit / Loss</th>
                </tr>
              </thead>
              <tbody>
                {sortedPeriods.map((m) => {
                  const profit = Number(m.profitGBP || 0);
                  return (
                    <tr key={String(m.key)} className="border-t border-border/50">
                      <td className="px-3 py-2 font-medium">{String(m.key)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(Number(m.revenueGBP || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(Number(m.expensesGBP || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(Number(m.salaryGBP || 0))}</td>
                      <td
                        className={cn(
                          "px-3 py-2 tabular-nums font-semibold",
                          profit >= 0 ? "text-emerald-600" : "text-red-600"
                        )}
                      >
                        {fmt(profit)}
                      </td>
                    </tr>
                  );
                })}
                {!sortedPeriods.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No finance data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => toggle(f.key)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md border",
                  selected.includes(f.key)
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background text-muted-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {hasMoneySeries && hasCountSeries && (
            <p className="text-[11px] text-muted-foreground">
              Money (£) uses the left axis · counts use the right axis so lines stay readable.
            </p>
          )}

          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={windowStart <= 0 || graph.length === 0}
              onClick={() => setWindowStart((s) => Math.max(0, s - 3))}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Past
            </Button>
            <p className="text-xs text-muted-foreground">
              Window {windowed[0]?.month || "—"} → {windowed[windowed.length - 1]?.month || "—"}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={windowStart + 12 >= graph.length}
              onClick={() => setWindowStart((s) => Math.min(Math.max(0, graph.length - 12), s + 3))}
            >
              Ahead <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          <div className="h-[360px] w-full rounded-xl border bg-gradient-to-b from-emerald-50/40 to-background dark:from-emerald-950/20 p-2">
            {graph.length === 0 || windowed.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No journey data yet — add paid invoices or expenses to see the graph.
              </div>
            ) : (
              <PnLChart
                data={windowed}
                selected={selected}
                hasMoneySeries={hasMoneySeries}
                hasCountSeries={hasCountSeries}
              />
            )}
          </div>
        </div>
      )}

      {/* ━━ Finance Reports (auto-save to Drive) ━━ */}
      <FinanceReportsPanel />
    </div>
  );
}
