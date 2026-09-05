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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFinanceLiveRefresh } from "@/lib/finance-events";
import { PageHeader } from "@/components/page-header";
import { CollapsibleStatStrip } from "@/components/collapsible-stat-strip";
import { FinanceReportSection } from "@/components/dashboard/finance/finance-report-section";

const FILTERS = [
  { key: "profit", label: "Recorded result", axis: "money" as const },
  { key: "loss", label: "Negative result", axis: "money" as const },
  { key: "revenue", label: "Recorded revenue", axis: "money" as const },
  { key: "expenses", label: "Recorded costs", axis: "money" as const },
  { key: "salary", label: "Salary", axis: "money" as const },
] as const;

type Tab = "normal" | "graph";
type NormalMode = "month" | "year";

const MONEY_KEYS = new Set(["profit", "loss", "revenue", "expenses", "salary"]);

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

  const hasMoneySeries = selected.some((k) => MONEY_KEYS.has(k));

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
    <div className="space-y-4">
      <PageHeader
        title="P&L"
        description="Recorded income and business costs in GBP. This is a management view, not an accounting ledger."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/finance">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Finance overview
          </Link>
        </Button>
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
      </PageHeader>

      <FinanceReportSection />

      <CollapsibleStatStrip
        title="P&L summary"
        storageKey="finance-pnl-stats-open"
        defaultOpen={false}
        items={[
          { key: "revenue", label: "Recorded revenue", value: fmt(Number(totals.revenueGBP || 0)) },
          { key: "costs", label: "Recorded costs", value: fmt(Number(totals.expensesGBP || 0)) },
          { key: "salaries", label: "Salaries", value: fmt(Number(totals.salaryGBP || 0)) },
          { key: "result", label: "Recorded result", value: fmt(Number(totals.profitGBP || 0)) },
        ]}
      />

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

          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{normalMode === "month" ? "Month" : "Year"}</th>
                  <th className="px-3 py-2">Recorded revenue</th>
                  <th className="px-3 py-2">Recorded costs</th>
                  <th className="px-3 py-2">Salary</th>
                  <th className="px-3 py-2">Recorded result</th>
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
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}
