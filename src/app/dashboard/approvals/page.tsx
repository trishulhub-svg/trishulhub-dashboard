"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useUrlState } from "@/hooks/use-url-state";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CheckCircle2, XCircle, Clock, Bot, MessageSquare, RefreshCw,
  AlertTriangle, Trash2, User, AlertCircle, Calendar,
  ShieldCheck, HourglassIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { safeArray, safeText, safeJsonParse } from "@/lib/utils";
import { formatDisplayDateRange } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TypeScript Interfaces
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Approval {
  id: string;
  type: string;
  requesterType: string;
  requesterId: string | null;
  agentId: string | null;
  title: string;
  description: string | null;
  data: string;
  status: string;
  feedback: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string; type: string } | null;
  approvedBy?: { id: string; name: string } | null;
}

interface Leave {
  id: string;
  userId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  feedback: string | null;
  approvedAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string; avatar: string | null } | null;
  approver?: { id: string; name: string } | null;
}

interface PendingCounts {
  approvals: number;
  leaveRequests: number;
  total: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color Mappings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const approvalTypeColors: Record<string, string> = {
  TASK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  INVOICE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  EMAIL: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  QUOTATION: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  PROJECT_PLAN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  CODE_REVIEW: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  EXPENSE_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const statusColors: Record<string, string> = {
  PENDING: "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10",
  APPROVED: "border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/10",
  REJECTED: "border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-900/10",
  NEEDS_IMPROVEMENT: "border-orange-300 bg-orange-50/50 dark:border-orange-700 dark:bg-orange-900/10",
  AWAITING_APPROVAL: "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10",
  DONE: "border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/10",
};

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "default",
  APPROVED: "secondary",
  REJECTED: "destructive",
  NEEDS_IMPROVEMENT: "outline",
  AWAITING_APPROVAL: "default",
  DONE: "secondary",
};

const leaveTypeBadge: Record<string, string> = {
  CASUAL_LEAVE: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  SICK_LEAVE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ANNUAL_LEAVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  PUBLIC_HOLIDAY: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  MATERNITY_LEAVE: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  PATERNITY_LEAVE: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  COMPENSATORY_OFF: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  HALF_DAY: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  WORK_FROM_HOME: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  OTHER: "bg-muted text-muted-foreground",
  // Legacy short labels (in case any remain)
  CASUAL: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  SICK: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

function formatLeaveType(leaveType: string): string {
  return leaveType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const sourceTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  LEAVE: {
    label: "Leave Request",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    icon: <Calendar className="h-4 w-4" />,
  },
  AI: {
    label: "System",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    icon: <Bot className="h-4 w-4" />,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: get initials from name
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Unified Pending Item (for All Pending tab)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UnifiedPendingItem {
  id: string;
  source: "LEAVE" | "AI";
  title: string;
  description: string | null;
  requesterName: string;
  requesterAvatar: string | null;
  createdAt: string;
  raw: Approval | Leave;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// History Entry Interface — I6: Used for unified history rendering in renderHistoryCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HistoryEntry {
  id: string;
  source: "AI" | "LEAVE";
  title: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  feedback: string | null;
  approvedByName: string | null;
  type?: string;
  agent?: { id: string; name: string; type: string } | null;
  requesterType?: string;
  description?: string | null;
  userName?: string | null;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading approvals…</div>}>
      <ApprovalsPageInner />
    </Suspense>
  );
}

function ApprovalsPageInner() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const isSessionLoading = sessionStatus === "loading";
  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  // isAdminUser = SUPER_ADMIN or ADMIN only. Used for leave-management UI
  // (admin sees all leaves + can approve/reject; PM/dev see only their own
  // leaves + cannot approve/reject). PROJECT_MANAGER is intentionally NOT
  // included here so they get developer-level leave access.
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  // canManageApprovals = SUPER_ADMIN, ADMIN, or PROJECT_MANAGER. Used for
  // AI approval UI (these roles can see and act on AI approval requests).
  // PROJECT_MANAGER is included so they can manage non-leave approvals.
  const canManageApprovals = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "PROJECT_MANAGER";

  // Tab state (persist across refresh)
  const [activeTab, setActiveTab] = useUrlState("tab", "all-pending");

  // Data states
  const [aiApprovals, setAiApprovals] = useState<Approval[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Leave[]>([]);
  const [historyItems, setHistoryItems] = useState<Approval[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<Leave[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackTexts, setFeedbackTexts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Computed counts (memoized)
  const pendingAiApprovals = useMemo(() => aiApprovals.filter((a) => a.status === "PENDING"), [aiApprovals]);
  const pendingLeaves = useMemo(() => leaveRequests.filter((l) => l.status === "PENDING"), [leaveRequests]);

  // Role-based filtering: admins see all, developers see only their own
  const myLeaves = isAdminUser ? leaveRequests : leaveRequests.filter((l) => l.userId === userId);
  const myPendingLeaves = myLeaves.filter((l) => l.status === "PENDING");

  const counts: PendingCounts = isAdminUser ? {
    approvals: pendingAiApprovals.length,
    leaveRequests: pendingLeaves.length,
    total: pendingAiApprovals.length + pendingLeaves.length,
  } : canManageApprovals ? {
    // PROJECT_MANAGER: can manage AI approvals (see all) but only their own leaves
    approvals: pendingAiApprovals.length,
    leaveRequests: myPendingLeaves.length,
    total: pendingAiApprovals.length + myPendingLeaves.length,
  } : {
    approvals: 0,
    leaveRequests: myPendingLeaves.length,
    total: myPendingLeaves.length,
  };

  // Unified pending queue (memoized)
  // - ADMIN/SUPER_ADMIN: all pending leaves + all pending AI approvals
  // - PROJECT_MANAGER: own pending leaves + all pending AI approvals
  //   (PM can manage AI approvals but only has developer-level leave access)
  // - DEVELOPER: own pending leaves only (no AI approvals)
  const unifiedPending: UnifiedPendingItem[] = useMemo(() => [
    ...(isAdminUser ? pendingLeaves : myPendingLeaves).map((l) => ({
      id: l.id,
      source: "LEAVE" as const,
      title: `${safeText(l.user?.name, "Unknown")} — ${formatLeaveType(l.leaveType)}`,
      description: l.reason || `${formatLeaveType(l.leaveType)} from ${formatDisplayDateRange(l.startDate, l.endDate)}`,
      requesterName: safeText(l.user?.name, "Unknown"),
      requesterAvatar: l.user?.avatar || null,
      createdAt: l.createdAt,
      raw: l,
    })),
    ...(canManageApprovals ? pendingAiApprovals : []).map((a) => ({
      id: a.id,
      source: "AI" as const,
      title: a.title,
      description: a.description,
      requesterName: a.agent?.name || (a.requesterType === "AI" ? "System" : "Team Member"),
      requesterAvatar: null,
      createdAt: a.createdAt,
      raw: a,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [isAdminUser, canManageApprovals, pendingLeaves, myPendingLeaves, pendingAiApprovals]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Data Fetching
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const fetchPendingData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Pending only on first paint — history statuses load when History tab opens (L1/L7).
      const [approvalsRes, leavesRes] = await Promise.allSettled([
        fetch("/api/approvals?status=PENDING", { credentials: "include" }),
        fetch("/api/leaves?limit=200", { credentials: "include" }),
      ]);

      if (approvalsRes.status === "fulfilled" && approvalsRes.value.status === 401) {
        router.push("/login");
        return;
      }
      if (approvalsRes.status === "fulfilled" && approvalsRes.value.ok) {
        setAiApprovals(safeArray<Approval>(await approvalsRes.value.json()));
      } else if (approvalsRes.status === "fulfilled") {
        setAiApprovals([]);
      }

      let rawLeaves: Leave[] = [];
      if (leavesRes.status === "fulfilled" && leavesRes.value.ok) {
        rawLeaves = safeArray<Leave>(await leavesRes.value.json());
        setLeaveRequests(rawLeaves);
      }

      setLeaveHistory(
        rawLeaves
          .filter((l: Leave) => l.status === "APPROVED" || l.status === "REJECTED")
          .sort((a: Leave, b: Leave) => {
            const ta = new Date(a.approvedAt || a.updatedAt || a.createdAt).getTime();
            const tb = new Date(b.approvedAt || b.updatedAt || b.createdAt).getTime();
            return tb - ta;
          })
      );
    } catch (err) {
      console.error("[approvals] fetchPendingData Error:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchHistoryData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetch("/api/approvals?status=APPROVED", { credentials: "include" }),
        fetch("/api/approvals?status=REJECTED", { credentials: "include" }),
        fetch("/api/approvals?status=NEEDS_IMPROVEMENT", { credentials: "include" }),
      ]);
      const arrays = await Promise.all(
        results
          .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled" && r.value.ok)
          .map(async (r) => safeArray<Approval>(await r.value.json()))
      );
      setHistoryItems(
        arrays.flat().sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      );
    } catch (err) {
      console.error("[approvals] fetchHistoryData Error:", err);
    }
  }, []);

  const fetchAllData = fetchPendingData;

  useEffect(() => {
    if (!isSessionLoading && session) {
      fetchPendingData();
    }
  }, [isSessionLoading, session, fetchPendingData]);

  // Lazy-load history when that tab is selected
  useEffect(() => {
    if (activeTab === "history") {
      void fetchHistoryData();
    }
  }, [activeTab, fetchHistoryData]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Action Handlers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const setActionLoadingState = (id: string, state: boolean) => {
    setActionLoading((prev) => ({ ...prev, [id]: state }));
  };

  const handleAiApproval = async (id: string, action: "APPROVED" | "REJECTED" | "NEEDS_IMPROVEMENT") => {
    setActionLoadingState(id, true);
    try {
      const feedback = feedbackTexts[id] || undefined;
      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, status: action, feedback }),
      });

      if (res.ok) {
        const msgs: Record<string, string> = {
          APPROVED: "Approved successfully!",
          REJECTED: "Rejected — sent back for revision",
          NEEDS_IMPROVEMENT: "Marked as needs improvement — will be revised",
        };
        toast.success(msgs[action]);
        setFeedbackTexts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        fetchAllData();
      } else {
        // W47: Wrap res.json() in try/catch to handle non-JSON error responses
        let err: Record<string, unknown> = {};
        try { err = await res.json(); } catch { err = {}; }
        toast.error((err as { error?: string }).error || "Failed to process approval");
      }
    } catch {
      toast.error("Failed to process approval");
    } finally {
      setActionLoadingState(id, false);
    }
  };

  const handleLeaveAction = async (id: string, action: "APPROVED" | "REJECTED") => {
    setActionLoadingState(id, true);
    try {
      const feedback = feedbackTexts[id] || undefined;
      const res = await fetch(`/api/leaves/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: action, feedback }),
      });

      if (res.ok) {
        toast.success(action === "APPROVED" ? "Leave approved!" : "Leave rejected");
        setFeedbackTexts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        fetchAllData();
      } else {
        // W47: Wrap res.json() in try/catch to handle non-JSON error responses
        let err: Record<string, unknown> = {};
        try { err = await res.json(); } catch { err = {}; }
        toast.error((err as { error?: string }).error || "Failed to process leave request");
      }
    } catch {
      toast.error("Failed to process leave request");
    } finally {
      setActionLoadingState(id, false);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Loading / Auth States
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (isSessionLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchAllData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Render Helpers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const renderApprovalCard = (item: Approval) => {
    const parsedData = safeJsonParse<Record<string, unknown>>(item.data, {});
    return (
      <Card key={item.id} className={`border ${statusColors[item.status] || ""}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${approvalTypeColors[item.type] || "bg-muted"}`}>
                {item.type === "CHAT_DELETION" ? (
                  <Trash2 className="h-5 w-5" />
                ) : item.requesterType === "AI" ? (
                  <Bot className="h-5 w-5" />
                ) : (
                  <MessageSquare className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{safeText(item.title, "Untitled")}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">
                    {item.type === "CHAT_DELETION" ? "Chat Deletion" : item.type.replace(/_/g, " ")}
                  </Badge>
                  {item.agent && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Bot className="h-3 w-3" />
                      <span>{safeText(item.agent.name, "AI")}</span>
                    </div>
                  )}
                  {item.requesterType === "AI" && (
                    <Badge variant="outline" className="text-[10px]">AI Requested</Badge>
                  )}
                  {item.type === "CHAT_DELETION" && typeof parsedData.requestedBy === "string" && parsedData.requestedBy && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>Requested by {safeText(parsedData.requestedBy, "")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={statusBadgeVariant[item.status] || "secondary"} className="text-xs">
                {item.status.replace(/_/g, " ")}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {item.description && (
            <p className="text-sm text-muted-foreground">{safeText(item.description, "")}</p>
          )}

          {typeof parsedData.output === "string" && parsedData.output && (
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <MessageSquare className="h-3 w-3" /> Output
              </div>
              <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                {safeText(parsedData.output, "")}
              </p>
            </div>
          )}

          {item.feedback && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300 mb-1">
                <AlertTriangle className="h-3 w-3" /> Feedback
              </div>
              <p className="text-sm">{safeText(item.feedback, "")}</p>
              {item.approvedBy && (
                <p className="text-xs text-muted-foreground mt-1">By {safeText(item.approvedBy.name, "")}</p>
              )}
            </div>
          )}

          {item.status === "PENDING" && (
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                placeholder="Feedback (optional for approve, recommended for reject/improve)..."
                className="text-xs min-h-[44px]"
                rows={2}
                value={feedbackTexts[item.id] || ""}
                onChange={(e) => setFeedbackTexts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                aria-label="Approval feedback"
              />
              <div className="flex gap-2">
                <Button
                  className="bg-green-600 hover:bg-green-700 flex-1"
                  disabled={actionLoading[item.id]}
                  onClick={() => handleAiApproval(item.id, "APPROVED")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="border-orange-400 text-orange-600 hover:bg-orange-50 flex-1"
                  disabled={actionLoading[item.id]}
                  onClick={() => handleAiApproval(item.id, "NEEDS_IMPROVEMENT")}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" /> Needs Work
                </Button>
                <Button
                  variant="destructive"
                  disabled={actionLoading[item.id]}
                  onClick={() => handleAiApproval(item.id, "REJECTED")}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderLeaveCard = (leave: Leave, showActions: boolean = true) => {
    const isPending = leave.status === "PENDING";
    return (
      <Card key={leave.id} className={`border ${statusColors[leave.status] || ""}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={leave.user?.avatar || undefined} alt={safeText(leave.user?.name, "")} />
                <AvatarFallback>{getInitials(safeText(leave.user?.name, "?"))}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{safeText(leave.user?.name, "Unknown Employee")}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="secondary" className={`text-[10px] ${leaveTypeBadge[leave.leaveType] || ""}`}>
                    {formatLeaveType(leave.leaveType)}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {formatDisplayDateRange(leave.startDate, leave.endDate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={statusBadgeVariant[leave.status] || "secondary"} className="text-xs">
                {leave.status.replace(/_/g, " ")}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(leave.createdAt).toLocaleString()}
              </p>
              {leave.approver?.name && (
                <p className="text-xs text-muted-foreground">by {safeText(leave.approver.name)}</p>
              )}
            </div>
          </div>

          {leave.reason && (
            <p className="text-sm text-muted-foreground">{safeText(leave.reason, "")}</p>
          )}

          {leave.feedback && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300 mb-1">
                <AlertTriangle className="h-3 w-3" /> Feedback
              </div>
              <p className="text-sm">{safeText(leave.feedback, "")}</p>
            </div>
          )}

          {isPending && showActions && (
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                placeholder="Feedback (optional for approve, recommended for reject)..."
                className="text-xs min-h-[44px]"
                rows={2}
                value={feedbackTexts[leave.id] || ""}
                onChange={(e) => setFeedbackTexts((prev) => ({ ...prev, [leave.id]: e.target.value }))}
                aria-label="Leave feedback"
              />
              <div className="flex gap-2">
                <Button
                  className="bg-green-600 hover:bg-green-700 flex-1"
                  disabled={actionLoading[leave.id]}
                  onClick={() => handleLeaveAction(leave.id, "APPROVED")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={actionLoading[leave.id]}
                  onClick={() => handleLeaveAction(leave.id, "REJECTED")}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderUnifiedCard = (item: UnifiedPendingItem) => {
    const src = sourceTypeConfig[item.source] || sourceTypeConfig.AI;
    if (item.source === "LEAVE") {
      return renderLeaveCard(item.raw as Leave, isAdminUser);
    }
    // AI approval — render inline with source badge
    const approval = item.raw as Approval;
    const parsedData = safeJsonParse<Record<string, unknown>>(approval.data, {});
    return (
      <Card key={item.id} className="border border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${src.color}`}>
                {src.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{safeText(approval.title, "Untitled")}</p>
                  <Badge variant="secondary" className={`text-[10px] ${src.color}`}>
                    {src.label}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {approval.type.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {approval.agent && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Bot className="h-3 w-3" />
                      <span>{safeText(approval.agent.name, "AI")}</span>
                    </div>
                  )}
                  {approval.requesterType === "AI" && (
                    <Badge variant="outline" className="text-[10px]">AI Requested</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(approval.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <Badge variant="default" className="text-xs">PENDING</Badge>
          </div>

          {approval.description && (
            <p className="text-sm text-muted-foreground">{safeText(approval.description, "")}</p>
          )}

          {typeof parsedData.output === "string" && parsedData.output && (
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <MessageSquare className="h-3 w-3" /> Output
              </div>
              <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                {safeText(parsedData.output, "")}
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Textarea
              placeholder="Feedback (optional for approve, recommended for reject/improve)..."
              className="text-xs min-h-[44px]"
              rows={2}
              value={feedbackTexts[approval.id] || ""}
              onChange={(e) => setFeedbackTexts((prev) => ({ ...prev, [approval.id]: e.target.value }))}
              aria-label="Approval feedback"
            />
            <div className="flex gap-2">
              <Button
                className="bg-green-600 hover:bg-green-700 flex-1"
                disabled={actionLoading[approval.id]}
                onClick={() => handleAiApproval(approval.id, "APPROVED")}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button
                variant="outline"
                className="border-orange-400 text-orange-600 hover:bg-orange-50 flex-1"
                disabled={actionLoading[approval.id]}
                onClick={() => handleAiApproval(approval.id, "NEEDS_IMPROVEMENT")}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Needs Work
              </Button>
              <Button
                variant="destructive"
                disabled={actionLoading[approval.id]}
                onClick={() => handleAiApproval(approval.id, "REJECTED")}
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Empty state
  const renderEmpty = (message: string, icon?: React.ReactNode) => (
    <Card>
      <CardContent className="p-12 text-center">
        <div className="flex justify-center mb-4 text-green-500">
          {icon || <CheckCircle2 className="h-12 w-12" />}
        </div>
        <h3 className="text-lg font-semibold mb-1">All caught up!</h3>
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );

  // Loading skeleton
  const renderLoading = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40 rounded-lg" />
      ))}
    </div>
  );

  // Combined history items with unified sorting (memoized)
  const allHistory: HistoryEntry[] = useMemo(() => [
    ...historyItems.map((a) => ({
      id: a.id,
      source: "AI" as const,
      title: safeText(a.title, "Untitled"),
      status: a.status,
      statusLabel: a.status.replace(/_/g, " "),
      updatedAt: a.updatedAt,
      feedback: a.feedback,
      approvedByName: a.approvedBy?.name || null,
      type: a.type,
      agent: a.agent,
      requesterType: a.requesterType,
      description: a.description,
    })),
    ...leaveHistory.map((l) => ({
      id: l.id,
      source: "LEAVE" as const,
      title: `${safeText(l.user?.name, "Unknown")} — ${formatLeaveType(l.leaveType)}`,
      status: l.status,
      statusLabel: l.status.replace(/_/g, " "),
      updatedAt: l.createdAt,
      feedback: l.feedback,
      approvedByName: l.approver?.name || null,
      userName: l.user?.name || null,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [historyItems, leaveHistory]);

  // History card (unified for all types, no actions)
  const renderHistoryCard = (item: HistoryEntry) => {
    const src = item.source === "AI"
      ? sourceTypeConfig.AI
      : sourceTypeConfig.LEAVE;

    return (
      <Card key={item.id} className={`border ${statusColors[item.status] || ""}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${src.color}`}>
                {src.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{item.title}</p>
                  <Badge variant="secondary" className={`text-[10px] ${src.color}`}>
                    {src.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {item.source === "AI" && item.type && (
                    <Badge variant="secondary" className="text-[10px]">
                      {item.type.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {item.source === "AI" && item.agent && (
                    <span className="text-xs text-muted-foreground">{safeText(item.agent.name, "AI")}</span>
                  )}
                  {item.source === "LEAVE" && item.startDate && item.endDate && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDisplayDateRange(item.startDate, item.endDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={statusBadgeVariant[item.status] || "secondary"} className="text-xs">
                {item.statusLabel}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(item.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
          {item.feedback && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted rounded p-2">
              <span className="font-medium">Feedback: </span>
              {safeText(item.feedback, "")}
              {item.approvedByName && (
                <span className="ml-1">— {safeText(item.approvedByName, "")}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Stat Cards
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const statCards = isAdminUser ? [
    {
      label: "Total Pending",
      value: counts.total,
      icon: <HourglassIcon className="h-5 w-5" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "Approval Requests",
      value: counts.approvals,
      icon: <Bot className="h-5 w-5" />,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      label: "Leave Requests",
      value: counts.leaveRequests,
      icon: <Calendar className="h-5 w-5" />,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50 dark:bg-sky-900/20",
    },
  ] : canManageApprovals ? [
    // PROJECT_MANAGER: can manage AI approvals, sees own leaves only
    {
      label: "Approval Requests",
      value: counts.approvals,
      icon: <Bot className="h-5 w-5" />,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      label: "My Leave Requests",
      value: myPendingLeaves.length,
      icon: <Calendar className="h-5 w-5" />,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50 dark:bg-sky-900/20",
    },
    {
      label: "Total Pending",
      value: counts.total,
      icon: <ShieldCheck className="h-5 w-5" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
  ] : [
    {
      label: "My Leave Requests",
      value: myPendingLeaves.length,
      icon: <Calendar className="h-5 w-5" />,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50 dark:bg-sky-900/20",
    },
    {
      label: "Total Actions",
      value: counts.total,
      icon: <ShieldCheck className="h-5 w-5" />,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    },
  ];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Main Render
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="space-y-6">
      <PageHeader title="Approval Center" description={canManageApprovals ? "Universal approval gateway for all system requests" : "Track your tasks, leave requests, and approvals"}>
        <Button variant="outline" size="sm" onClick={fetchAllData}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </PageHeader>

      {/* ── Summary Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all-pending">
            {canManageApprovals ? "All Pending" : "My Pending"}
            {counts.total > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {counts.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="leaves">
            {isAdminUser ? "Leave Requests" : "My Leaves"}
            {counts.leaveRequests > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {counts.leaveRequests}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="history">
            History
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: All Pending ── */}
        <TabsContent value="all-pending" className="mt-4">
          {loading ? (
            renderLoading()
          ) : unifiedPending.length === 0 ? (
            renderEmpty(canManageApprovals ? "No pending approvals across the system." : "No pending items for you.")
          ) : (
            <div className="space-y-3">
              {unifiedPending.map((item) => renderUnifiedCard(item))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Leave Requests / My Leaves ── */}
        <TabsContent value="leaves" className="mt-4">
          {loading ? (
            renderLoading()
          ) : (isAdminUser ? leaveRequests : myLeaves).length === 0 ? (
            renderEmpty(isAdminUser ? "No leave requests found." : "No leave requests found.")
          ) : (
            <div className="space-y-3">
              {(isAdminUser ? leaveRequests : myLeaves).map((leave) => renderLeaveCard(leave, isAdminUser))}
            </div>
          )}
        </TabsContent>


        {/* ── Tab: History ── */}
        <TabsContent value="history" className="mt-4">
          {loading ? (
            renderLoading()
          ) : allHistory.length === 0 ? (
            renderEmpty("No resolved items in history.", <Clock className="h-12 w-12 text-muted-foreground" />)
          ) : (
            <div className="space-y-2">
              {allHistory.map((item) => renderHistoryCard(item))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

