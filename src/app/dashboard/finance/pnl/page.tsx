"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ChevronLeft, ChevronRight, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "profit", label: "Profit" },
  { key: "loss", label: "Loss" },
  { key: "revenue", label: "Revenue" },
  { key: "expenses", label: "Expenses" },
  { key: "salary", label: "Salary" },
  { key: "performance", label: "Employee performance" },
  { key: "projects", label: "Projects" },
  { key: "clients", label: "Clients" },
  { key: "crm", label: "CRM" },
  { key: "time", label: "Time tracking" },
  { key: "audit", label: "Audit" },
] as const;

type Tab = "normal" | "graph";
type NormalMode = "month" | "year";

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
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    const role = session?.user?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = selected.join(",");
      const res = await fetch(`/api/finance/pnl?categories=${encodeURIComponent(qs)}`, {
        credentials: "include",
      });
      if (res.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      setMonths(Array.isArray(data.months) ? data.months : []);
      setYears(Array.isArray(data.years) ? data.years : []);
      setGraph(Array.isArray(data.graph) ? data.graph : []);
      setTotals(data.totals || {});
      setNote(data.note || "");
      const len = Array.isArray(data.graph) ? data.graph.length : 0;
      setWindowStart(Math.max(0, len - 12));
    } catch {
      toast.error("Failed to load P&L");
    } finally {
      setLoading(false);
    }
  }, [selected, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const windowed = useMemo(() => {
    return graph.slice(windowStart, windowStart + 12);
  }, [graph, windowStart]);

  const toggle = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
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
                {(normalMode === "month" ? months : years).map((m) => {
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
                {!(normalMode === "month" ? months : years).length && (
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
              disabled={windowStart <= 0}
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
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={windowed}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {selected.includes("revenue") && (
                  <Area type="monotone" dataKey="revenue" stroke="#059669" fill="#05966933" name="Revenue £" />
                )}
                {selected.includes("expenses") && (
                  <Area type="monotone" dataKey="expenses" stroke="#dc2626" fill="#dc262622" name="Expenses £" />
                )}
                {selected.includes("salary") && (
                  <Line type="monotone" dataKey="salary" stroke="#d97706" strokeWidth={2} name="Salary £" dot={false} />
                )}
                {selected.includes("profit") && (
                  <Line type="monotone" dataKey="profit" stroke="#2563eb" strokeWidth={2.5} name="Profit £" />
                )}
                {selected.includes("loss") && (
                  <Line type="monotone" dataKey="loss" stroke="#be123c" strokeWidth={2} name="Loss £" />
                )}
                {selected.includes("projects") && (
                  <Line type="monotone" dataKey="projects" stroke="#7c3aed" strokeWidth={1.5} name="Projects" />
                )}
                {selected.includes("clients") && (
                  <Line type="monotone" dataKey="clients" stroke="#0f766e" strokeWidth={1.5} name="Clients" />
                )}
                {selected.includes("crm") && (
                  <Line type="monotone" dataKey="crmWon" stroke="#ea580c" strokeWidth={1.5} name="CRM won" />
                )}
                {selected.includes("time") && (
                  <Line type="monotone" dataKey="timeEntries" stroke="#64748b" strokeWidth={1.5} name="Time entries" />
                )}
                {selected.includes("audit") && (
                  <Line type="monotone" dataKey="audit" stroke="#475569" strokeWidth={1.5} name="Audit events" />
                )}
                {selected.includes("performance") && (
                  <Line type="monotone" dataKey="performance" stroke="#db2777" strokeWidth={2} name="Employee perf £" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
