"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, Loader2, Filter, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface EmailLog {
  id: string;
  to: string;
  subject: string;
  type: string;
  status: string;
  smtpHost: string | null;
  method: string | null;
  error: string | null;
  triggeredBy: string | null;
  createdAt: string;
}

const emailTypeLabels: Record<string, string> = {
  OTP: "OTP",
  PASSWORD_CHANGE: "Password Change",
  EMAIL_CHANGE: "Email Change",
  RESET_LINK: "Reset Link",
  DIRECT_RESET: "Direct Reset",
};

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

export default function EmailLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailLogsTotal, setEmailLogsTotal] = useState(0);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [emailLogTypeFilter, setEmailLogTypeFilter] = useState<string>("ALL");
  const [emailLogStatusFilter, setEmailLogStatusFilter] = useState<string>("ALL");
  const [clearingLogs, setClearingLogs] = useState(false);
  const [clearLogsConfirm, setClearLogsConfirm] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [status, isSuperAdmin, router]);

  const fetchEmailLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setEmailLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (emailLogTypeFilter !== "ALL") params.set("type", emailLogTypeFilter);
      if (emailLogStatusFilter !== "ALL") params.set("status", emailLogStatusFilter);
      const res = await fetch(`/api/email-logs?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setEmailLogs(data.logs || []);
        setEmailLogsTotal(data.total || 0);
      } else {
        toast.error("Failed to load email logs");
      }
    } catch (err) {
      console.error("[email-logs] Failed to fetch:", err);
    } finally {
      setEmailLogsLoading(false);
    }
  }, [isSuperAdmin, emailLogTypeFilter, emailLogStatusFilter]);

  useEffect(() => {
    fetchEmailLogs();
  }, [fetchEmailLogs]);

  const handleClearOldLogs = async () => {
    setClearingLogs(true);
    try {
      const res = await fetch("/api/email-logs?olderThanDays=30", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || `Deleted ${data.deleted} old log(s)`);
        setClearLogsConfirm(false);
        fetchEmailLogs();
      } else {
        toast.error(data.error || "Failed to clear logs");
      }
    } catch {
      toast.error("Failed to clear logs");
    } finally {
      setClearingLogs(false);
    }
  };

  if (status === "loading" || !session) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Email Logs" description="Audit trail of all email activity" />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Email Logs</CardTitle>
                <CardDescription>Filter and review outbound email delivery</CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setClearLogsConfirm(true)}
              disabled={clearingLogs}
            >
              {clearingLogs ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Clearing...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-1" /> Clear Old Logs</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={emailLogTypeFilter} onValueChange={setEmailLogTypeFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="OTP">OTP</SelectItem>
                  <SelectItem value="PASSWORD_CHANGE">Password Change</SelectItem>
                  <SelectItem value="EMAIL_CHANGE">Email Change</SelectItem>
                  <SelectItem value="RESET_LINK">Reset Link</SelectItem>
                  <SelectItem value="DIRECT_RESET">Direct Reset</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={emailLogStatusFilter} onValueChange={setEmailLogStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Showing {emailLogs.length} of {emailLogsTotal} log{emailLogsTotal !== 1 ? "s" : ""}
            </span>
          </div>

          {emailLogsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : emailLogs.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <Mail className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
              <p className="text-sm text-muted-foreground">No email logs found</p>
              <p className="text-xs text-muted-foreground mt-1">Email activity will appear here when emails are sent</p>
            </div>
          ) : (
            <>
              {/* Mobile: stacked rows (no cramped multi-column table) */}
              <div className="space-y-2 md:hidden">
                {emailLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border/70 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {emailTypeLabels[log.type] || log.type}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] shrink-0 ${
                          log.status === "SENT"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : log.status === "FAILED"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            : ""
                        }`}
                      >
                        {log.status}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium break-words">{log.subject}</p>
                    <p className="text-[11px] text-muted-foreground break-all">{log.to}</p>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{log.smtpHost || "—"}</span>
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        {getRelativeTime(log.createdAt)}
                      </span>
                    </div>
                    {log.status === "FAILED" && log.error && (
                      <p className="text-[10px] text-red-500 break-words" title={log.error}>
                        {log.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop / tablet table */}
              <div className="hidden md:block rounded-lg border max-h-[32rem] overflow-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">To</TableHead>
                      <TableHead className="text-xs">Subject</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">SMTP</TableHead>
                      <TableHead className="text-xs">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {emailTypeLabels[log.type] || log.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {log.to}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[180px]" title={log.subject}>
                          {log.subject}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              log.status === "SENT"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : log.status === "FAILED"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                : ""
                            }`}
                          >
                            {log.status}
                          </Badge>
                          {log.status === "FAILED" && log.error && (
                            <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[200px] cursor-help" title={log.error}>
                              {log.error}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {log.smtpHost || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getRelativeTime(log.createdAt)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={clearLogsConfirm} onOpenChange={setClearLogsConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Old Email Logs</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete all email logs older than 30 days? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setClearLogsConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearOldLogs} disabled={clearingLogs}>
              {clearingLogs ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Clearing...</> : "Clear Old Logs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
