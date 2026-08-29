"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarRange,
  FileDown,
  ExternalLink,
  RefreshCw,
  User as UserIcon,
  FileSpreadsheet,
  FileType2,
  FileText,
  Sheet,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { safeText, safeNumber } from "@/lib/utils";

type ReportRow = {
  id: string;
  name: string;
  mimeType?: string | null;
  url: string | null;
  size: number;
  createdAt: string;
  folder: string;
};

type TeamUser = { id: string; name: string; email: string };

const FORMATS = [
  { value: "pdf", label: "PDF", icon: FileType2 },
  { value: "xlsx", label: "Excel (XLSX)", icon: FileSpreadsheet },
  { value: "docx", label: "Word (DOCX)", icon: FileText },
  { value: "sheets", label: "Google Sheets", icon: Sheet },
] as const;

export function FinanceReportsPanel() {
  const { data: session } = useSession();
  const defaultDates = (() => {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return {
      from: first.toISOString().slice(0, 10),
      to: d.toISOString().slice(0, 10),
    };
  })();
  const [from, setFrom] = useState(defaultDates.from);
  const [to, setTo] = useState(defaultDates.to);
  const [userId, setUserId] = useState("");
  const [format, setFormat] = useState<string>("pdf");
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [lastSummary, setLastSummary] = useState<Record<string, number> | null>(null);

  const loadReports = useCallback(async () => {
    await Promise.resolve() // defer setState out of the effect's synchronous body
    setLoadingReports(true);
    try {
      const res = await fetch("/api/finance/reports", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data.reports) ? data.reports : []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingReports(false);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.ok) {
        const u = await res.json();
        const arr = Array.isArray(u) ? u : u?.data || [];
        setTeamUsers(
          arr
            .filter((x: TeamUser) => x?.id && x?.email)
            .map((x: TeamUser) => ({ id: x.id, name: x.name || x.email, email: x.email }))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Standard data-loading effect: fetch once on mount (matches app-wide pattern)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReports();
    void loadTeam();
  }, [loadReports, loadTeam]);

  const generate = async () => {
    if (!from || !to) {
      toast.error("Select a date range");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/finance/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, userId: userId || null, format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to generate report");
        return;
      }
      setLastSummary(data.summary || null);
      toast.success(
        data.report?.reused
          ? "Report already exists — opened the saved copy"
          : format === "sheets"
            ? "Google Sheet generated & saved to your Drive"
            : `${format.toUpperCase()} report generated & saved to Drive/Files`
      );
      void loadReports();
      if (data.report?.folderUrl) {
        toast.message("Saved under Finance Reports", {
          action: {
            label: "Open in Drive",
            onClick: () => window.open(String(data.report.folderUrl), "_blank", "noopener,noreferrer"),
          },
        });
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const formatIcon = (r: ReportRow) => {
    if (r.mimeType === "application/vnd.google-apps.spreadsheet")
      return <Sheet className="h-4 w-4 text-emerald-600" />;
    const name = r.name || "";
    if (name.endsWith(".xlsx")) return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
    if (name.endsWith(".docx")) return <FileText className="h-4 w-4 text-sky-600" />;
    return <FileType2 className="h-4 w-4 text-red-600" />;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Generate finance report</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose a date range (and optionally a team member) to generate a full finance
            report as PDF, Excel, Word or a native Google Sheet (all transactions with full
            details, organized in tabs). It is automatically saved to{" "}
            <strong>Finance Reports → YYYY-MM</strong> in your Drive and the Files module — no
            duplicates.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Team member (optional)</Label>
              <Select value={userId || undefined} onValueChange={(v) => setUserId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {safeText(u.name)} · {safeText(u.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="PDF" />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <span className="flex items-center gap-2">
                        <f.icon className="h-3.5 w-3.5" /> {f.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => void generate()} disabled={generating || !from || !to} className="h-9 w-full">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-1" /> Generate
                  </>
                )}
              </Button>
            </div>
          </div>
          {lastSummary && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Last report · Invoices: <strong>{safeNumber(lastSummary.totalInvoiced)}</strong> · Paid:{" "}
              <strong>{safeNumber(lastSummary.totalPaid)}</strong> · Expenses:{" "}
              <strong>{safeNumber(lastSummary.totalExpenses)}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Saved reports</h3>
              <Badge variant="secondary" className="text-[10px]">
                {reports.length}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void loadReports()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
          {loadingReports ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileDown className="h-10 w-10 mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No reports yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate your first report above — it appears in Files automatically.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-9 w-9 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                    {formatIcon(r)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{safeText(r.name)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {safeText(r.folder)} · {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                      {r.mimeType === "application/vnd.google-apps.spreadsheet"
                        ? "Google Sheet"
                        : `${(safeNumber(r.size) / 1024).toFixed(0)} KB`}
                    </p>
                  </div>
                  {r.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => window.open(String(r.url), "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground px-1">
        Reports are saved under <UserIcon className="inline h-3 w-3 align-[-2px]" /> Finance Reports in
        the Files module and your Google Drive, organized by month. Opening one requires Drive access
        as configured in Files → Settings.
      </p>
    </div>
  );
}
