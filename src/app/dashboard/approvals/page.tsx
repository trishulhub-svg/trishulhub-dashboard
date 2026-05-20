"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CheckCircle2, XCircle, Clock, Bot, MessageSquare, RefreshCw,
  AlertTriangle, Trash2, User, AlertCircle, Calendar, ClipboardList,
  ShieldCheck, HourglassIcon, ListChecks, Send, RotateCcw,
  GraduationCap, BookOpen, FileQuestion, Timer, ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { safeArray, safeText, safeJsonParse } from "@/lib/utils";
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

interface LeaveRequest {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  feedback: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string; avatar: string | null } | null;
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  assignedTo: string | null;
  assigneeType: string;
  status: string;
  priority: string;
  deadline: string | null;
  completedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedToName: string | null;
  approvedByName: string | null;
  project?: { id: string; name: string } | null;
}

interface PendingCounts {
  approvals: number;
  leaveRequests: number;
  tasksAwaitingApproval: number;
  total: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Training Assignment (for Overdue Training tab)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TrainingAssignment {
  id: string;
  documentId: string;
  testId: string | null;
  assignedTo: string;
  assignedBy: string;
  testLevel: string;
  dueDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  document?: { id: string; topic: string; imageUrl: string | null } | null;
  employee?: { id: string; name: string; email: string; avatar: string | null } | null;
  assigner?: { id: string; name: string } | null;
  test?: { id: string; level: string; timeLimit: number; createdAt: string } | null;
  attempts?: { id: string; score: number; total: number; passed: boolean; timeTaken: number | null; createdAt: string }[];
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
  LEAD_OUTREACH: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  CONTENT_PIECE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  CHAT_DELETION: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  TASK_EXECUTION: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  EXPENSE_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  INVOICE_SENDING: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300",
  EMAIL_SENDING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  CODE_DEPLOYMENT: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  DATA_EXPORT: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  SCHEDULED_ACTION: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  CROSS_AGENT_REQUEST: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
};

const statusColors: Record<string, string> = {
  PENDING: "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10",
  APPROVED: "border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/10",
  REJECTED: "border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-900/10",
  NEEDS_IMPROVEMENT: "border-orange-300 bg-orange-50/50 dark:border-orange-700 dark:bg-orange-900/10",
  AWAITING_APPROVAL: "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10",
};

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "default",
  APPROVED: "secondary",
  REJECTED: "destructive",
  NEEDS_IMPROVEMENT: "outline",
  AWAITING_APPROVAL: "default",
  DONE: "secondary",
};

const trainingStatusBadge: Record<string, string> = {
  ASSIGNED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  READ: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  TEST_STARTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  PASSED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const testLevelBadge: Record<string, string> = {
  LOW: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const leaveTypeBadge: Record<string, string> = {
  CASUAL: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  SICK: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const priorityBadge: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const sourceTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  LEAVE: {
    label: "Leave Request",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    icon: <Calendar className="h-4 w-4" />,
  },
  TASK: {
    label: "Task Approval",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <ClipboardList className="h-4 w-4" />,
  },
  AI: {
    label: "System",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    icon: <Bot className="h-4 w-4" />,
  },
  OVERDUE_TRAINING: {
    label: "Overdue Training",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: <GraduationCap className="h-4 w-4" />,
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
  source: "LEAVE" | "TASK" | "AI" | "OVERDUE_TRAINING";
  title: string;
  description: string | null;
  requesterName: string;
  requesterAvatar: string | null;
  createdAt: string;
  raw: Approval | LeaveRequest | TaskItem | TrainingAssignment;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ApprovalsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // Tab state
  const [activeTab, setActiveTab] = useState("all-pending");

  const queryClient = useQueryClient();

  // ━━ useQuery: Pending AI approvals ━━
  const { data: aiApprovalsData = [], isLoading: approvalsLoading, error: approvalsError } = useQuery({
    queryKey: ["approvals-pending"],
    queryFn: async () => {
      const res = await fetch("/api/approvals?status=PENDING", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      return safeArray<Approval>(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  // ━━ useQuery: Approval history (approved + rejected + needs_improvement) ━━
 const { data: historyItemsData = [] } = useQuery({
    queryKey: ["approvals-history"],
    queryFn: async () => {
      const [approvedRes, rejectedRes, needsImprovementRes] = await Promise.allSettled([
        fetch("/api/approvals?status=APPROVED", { credentials: "include" }),
        fetch("/api/approvals?status=REJECTED", { credentials: "include" }),
        fetch("/api/approvals?status=NEEDS_IMPROVEMENT", { credentials: "include" }),
      ]);
      const historyPromises = [approvedRes, rejectedRes, needsImprovementRes]
        .filter((r) => r.status === "fulfilled" && r.value.ok)
        .map(async (r) => safeArray<Approval>(await (r as PromiseFulfilledResult<Response>).value.json()));
      const historyArrays = await Promise.all(historyPromises);
      return historyArrays.flat().sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  // ━━ useQuery: Leave requests ━━
  const { data: leaveRequestsData = [], isLoading: leavesLoading, error: leavesError } = useQuery({
    queryKey: ["approvals-leaves"],
    queryFn: async () => {
      const res = await fetch("/api/team?type=leaves", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load leave requests");
      const data = await res.json();
      return safeArray<LeaveRequest>(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  // ━━ useQuery: Tasks ━━
  const { data: tasksData = [], isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: ["approvals-tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load tasks");
      const data = await res.json();
      return safeArray<TaskItem>(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  // ━━ useQuery: Overdue Training Assignments ━━
  const { data: overdueTrainingData = [], isLoading: trainingLoading, error: trainingError } = useQuery({
    queryKey: ["approvals-overdue-training"],
    queryFn: async () => {
      const res = await fetch("/api/training/assignments?overdue=true", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load overdue training");
      const data = await res.json();
      return safeArray<TrainingAssignment>(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const aiApprovals = aiApprovalsData;
  const leaveRequests = leaveRequestsData;
  const tasks = tasksData;
  const historyItems = historyItemsData;
  const overdueTraining = overdueTrainingData;
  const loading = approvalsLoading || leavesLoading || tasksLoading || trainingLoading;
  const error = approvalsError?.message || leavesError?.message || tasksError?.message || trainingError?.message || null;
  const [feedbackTexts, setFeedbackTexts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Computed counts
  const pendingAiApprovals = aiApprovals.filter((a) => a.status === "PENDING");
  const pendingLeaves = leaveRequests.filter((l) => l.status === "PENDING");
  const pendingTasks = tasks.filter((t) => t.status === "AWAITING_APPROVAL");
  const overdueTrainingCount = overdueTraining.length;

  // Role-based filtering: admins see all, developers see only their own
  const myLeaves = isAdminUser ? leaveRequests : leaveRequests.filter((l) => l.userId === userId);
  const myTasks = isAdminUser ? tasks : tasks.filter((t) => t.assignedTo === userId);
  const myPendingLeaves = myLeaves.filter((l) => l.status === "PENDING");
  const myPendingTasks = myTasks.filter((t) => t.status === "AWAITING_APPROVAL");
  const myActiveTasks = myTasks.filter((t) => ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL"].includes(t.status));
  const myApprovals = isAdminUser ? aiApprovals : aiApprovals.filter((a) => a.requesterId === userId);

  const counts: PendingCounts = isAdminUser ? {
    approvals: pendingAiApprovals.length,
    leaveRequests: pendingLeaves.length,
    tasksAwaitingApproval: pendingTasks.length,
    total: pendingAiApprovals.length + pendingLeaves.length + pendingTasks.length + overdueTrainingCount,
  } : {
    approvals: myPendingTasks.length,
    leaveRequests: myPendingLeaves.length,
    tasksAwaitingApproval: myActiveTasks.length,
    total: myPendingLeaves.length + myPendingTasks.length + myActiveTasks.filter((t) => t.status !== "AWAITING_APPROVAL").length + overdueTrainingCount,
  };

  // Unified pending queue
  const unifiedPending: UnifiedPendingItem[] = [
    ...(isAdminUser ? pendingLeaves : myPendingLeaves).map((l) => ({
      id: l.id,
      source: "LEAVE" as const,
      title: `${safeText(l.user?.name, "Unknown")} — ${l.type} Leave`,
      description: l.reason || `${l.type} leave from ${new Date(l.startDate).toLocaleDateString()} to ${new Date(l.endDate).toLocaleDateString()}`,
      requesterName: safeText(l.user?.name, "Unknown"),
      requesterAvatar: l.user?.avatar || null,
      createdAt: l.createdAt,
      raw: l,
    })),
    ...(isAdminUser ? pendingTasks : myPendingTasks).map((t) => ({
      id: t.id,
      source: "TASK" as const,
      title: t.title,
      description: t.description || `Priority: ${t.priority}`,
      requesterName: safeText(t.assignedToName, "Unassigned"),
      requesterAvatar: null,
      createdAt: t.updatedAt,
      raw: t,
    })),
    ...(isAdminUser ? pendingAiApprovals : []).map((a) => ({
      id: a.id,
      source: "AI" as const,
      title: a.title,
      description: a.description,
      requesterName: a.agent?.name || (a.requesterType === "AI" ? "System" : "Team Member"),
      requesterAvatar: null,
      createdAt: a.createdAt,
      raw: a,
    })),
    // Overdue training items
    ...overdueTraining.map((t) => ({
      id: t.id,
      source: "OVERDUE_TRAINING" as const,
      title: `${safeText(t.employee?.name, "Unknown")} — ${safeText(t.document?.topic, "Training")}`,
      description: t.dueDate ? `Was due ${new Date(t.dueDate).toLocaleDateString()} · Status: ${t.status}` : `Status: ${t.status}`,
      requesterName: safeText(t.employee?.name, "Unknown"),
      requesterAvatar: t.employee?.avatar || null,
      createdAt: t.dueDate || t.createdAt,
      raw: t,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
        queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
        queryClient.invalidateQueries({ queryKey: ["approvals-history"] });
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to process approval");
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
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "leave", id, status: action, feedback }),
      });

      if (res.ok) {
        toast.success(action === "APPROVED" ? "Leave approved!" : "Leave rejected");
        setFeedbackTexts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["approvals-leaves"] });
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to process leave request");
      }
    } catch {
      toast.error("Failed to process leave request");
    } finally {
      setActionLoadingState(id, false);
    }
  };

  const handleTaskAction = async (id: string, action: "approve" | "reject") => {
    setActionLoadingState(id, true);
    try {
      const feedback = feedbackTexts[id] || undefined;
      const body: Record<string, unknown> = { id };

      if (action === "approve") {
        body.status = "DONE";
      } else {
        body.status = "IN_PROGRESS";
        body.description = feedback ? { feedback } : undefined;
      }

      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(action === "approve" ? "Task approved!" : "Task sent back for revision");
        setFeedbackTexts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["approvals-tasks"] });
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to process task");
      }
    } catch {
      toast.error("Failed to process task");
    } finally {
      setActionLoadingState(id, false);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Loading / Auth States
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => {
          queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-history"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-leaves"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-tasks"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-overdue-training"] });
        }}>
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

  const renderLeaveCard = (leave: LeaveRequest, showActions: boolean = true) => {
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
                  <Badge variant="secondary" className={`text-[10px] ${leaveTypeBadge[leave.type] || ""}`}>
                    {leave.type}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(leave.startDate).toLocaleDateString()} — {new Date(leave.endDate).toLocaleDateString()}
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

  const renderTaskCard = (task: TaskItem, showActions: boolean = true) => {
    const isAwaiting = task.status === "AWAITING_APPROVAL";
    return (
      <Card key={task.id} className={`border ${statusColors[task.status] || ""}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${priorityBadge[task.priority] || "bg-muted"}`}>
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">{safeText(task.title, "Untitled Task")}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="secondary" className={`text-[10px] ${priorityBadge[task.priority] || ""}`}>
                    {task.priority}
                  </Badge>
                  {task.assignedToName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{safeText(task.assignedToName, "")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={statusBadgeVariant[task.status] || "secondary"} className="text-xs">
                {task.status.replace(/_/g, " ")}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(task.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground">{safeText(task.description, "")}</p>
          )}

          {task.deadline && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Deadline: {new Date(task.deadline).toLocaleDateString()}</span>
            </div>
          )}

          {isAwaiting && showActions && (
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                placeholder="Feedback for rejection (optional)..."
                className="text-xs min-h-[44px]"
                rows={2}
                value={feedbackTexts[task.id] || ""}
                onChange={(e) => setFeedbackTexts((prev) => ({ ...prev, [task.id]: e.target.value }))}
                aria-label="Task feedback"
              />
              <div className="flex gap-2">
                <Button
                  className="bg-green-600 hover:bg-green-700 flex-1"
                  disabled={actionLoading[task.id]}
                  onClick={() => handleTaskAction(task.id, "approve")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="border-orange-400 text-orange-600 hover:bg-orange-50 flex-1"
                  disabled={actionLoading[task.id]}
                  onClick={() => handleTaskAction(task.id, "reject")}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Send Back
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
      return renderLeaveCard(item.raw as LeaveRequest, isAdminUser);
    }
    if (item.source === "TASK") {
      return renderTaskCard(item.raw as TaskItem, isAdminUser);
    }
    if (item.source === "OVERDUE_TRAINING") {
      return renderOverdueTrainingCard(item.raw as TrainingAssignment);
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Overdue Training Card
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const renderOverdueTrainingCard = (item: TrainingAssignment) => {
    const daysOverdue = item.dueDate
      ? Math.floor((Date.now() - new Date(item.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const lastAttempt = item.attempts && item.attempts.length > 0 ? item.attempts[0] : null;
    const severityColor = daysOverdue >= 7
      ? "border-red-400 bg-red-50/80 dark:border-red-600 dark:bg-red-900/20"
      : daysOverdue >= 3
        ? "border-orange-400 bg-orange-50/80 dark:border-orange-600 dark:bg-orange-900/20"
        : "border-yellow-400 bg-yellow-50/80 dark:border-yellow-600 dark:bg-yellow-900/20";
    const severityLabel = daysOverdue >= 7
      ? "Critical"
      : daysOverdue >= 3
        ? "Urgent"
        : "Overdue";
    const severityBg = daysOverdue >= 7
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : daysOverdue >= 3
        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";

    const statusProgress = (() => {
      switch (item.status) {
        case "ASSIGNED": return { label: "Not Started", icon: <BookOpen className="h-3.5 w-3.5" />, color: trainingStatusBadge.ASSIGNED };
        case "READ": return { label: "Material Read", icon: <BookOpen className="h-3.5 w-3.5" />, color: trainingStatusBadge.READ };
        case "TEST_STARTED": return { label: "Test In Progress", icon: <FileQuestion className="h-3.5 w-3.5" />, color: trainingStatusBadge.TEST_STARTED };
        case "FAILED": return { label: "Test Failed", icon: <XCircle className="h-3.5 w-3.5" />, color: trainingStatusBadge.FAILED };
        default: return { label: item.status, icon: <Clock className="h-3.5 w-3.5" />, color: trainingStatusBadge.ASSIGNED };
      }
    })();

    return (
      <Card key={item.id} className={`border ${severityColor}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                <GraduationCap className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{safeText(item.document?.topic, "Untitled Training")}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="secondary" className={`text-[10px] ${severityBg}`}>
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {severityLabel} — {daysOverdue}d overdue
                  </Badge>
                  <Badge variant="secondary" className={`text-[10px] ${testLevelBadge[item.testLevel] || ""}`}>
                    {item.testLevel} Level
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1">
                {statusProgress.icon}
                <Badge variant="secondary" className={`text-[10px] ${statusProgress.color}`}>
                  {statusProgress.label}
                </Badge>
              </div>
              {item.dueDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Due: {new Date(item.dueDate).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* Employee info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={item.employee?.avatar || undefined} alt={safeText(item.employee?.name, "")} />
              <AvatarFallback className="text-xs">{getInitials(safeText(item.employee?.name, "?"))}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{safeText(item.employee?.name, "Unknown Employee")}</p>
              <p className="text-xs text-muted-foreground truncate">{safeText(item.employee?.email, "")}</p>
            </div>
            {isAdminUser && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => router.push("/dashboard/training")}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Last attempt info (if any) */}
          {lastAttempt && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted rounded-lg p-2">
              <div className="flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" />
                <span>Last attempt: {lastAttempt.score}/{lastAttempt.total} ({lastAttempt.timeTaken ? `${Math.floor(lastAttempt.timeTaken / 60)}m ${lastAttempt.timeTaken % 60}s` : "No time"})</span>
              </div>
              <Badge variant={lastAttempt.passed ? "secondary" : "destructive"} className="text-[10px]">
                {lastAttempt.passed ? "Passed" : "Failed"}
              </Badge>
            </div>
          )}

          {/* Assigned by info */}
          {item.assigner && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Assigned by {safeText(item.assigner.name, "")}</span>
              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
          )}
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

  // History card (simplified, no actions)
  const renderHistoryCard = (item: Approval) => {
    const parsedData = safeJsonParse<Record<string, unknown>>(item.data, {});
    return (
      <Card key={item.id} className={`border ${statusColors[item.status] || ""}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${approvalTypeColors[item.type] || "bg-muted"}`}>
                {item.requesterType === "AI" ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-medium">{safeText(item.title, "Untitled")}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {item.type.replace(/_/g, " ")}
                  </Badge>
                  {item.agent && (
                    <span className="text-xs text-muted-foreground">{safeText(item.agent.name, "AI")}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={statusBadgeVariant[item.status] || "secondary"} className="text-xs">
                {item.status.replace(/_/g, " ")}
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
              {item.approvedBy && (
                <span className="ml-1">— {safeText(item.approvedBy.name, "")}</span>
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
      icon: <ShieldCheck className="h-5 w-5" />,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Leave Requests",
      value: counts.leaveRequests,
      icon: <Calendar className="h-5 w-5" />,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50 dark:bg-sky-900/20",
    },
    {
      label: "Overdue Training",
      value: overdueTrainingCount,
      icon: <GraduationCap className="h-5 w-5" />,
      color: overdueTrainingCount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400",
      bg: overdueTrainingCount > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20",
    },
  ] : [
    {
      label: "My Active Tasks",
      value: myActiveTasks.length,
      icon: <ClipboardList className="h-5 w-5" />,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Awaiting Approval",
      value: myPendingTasks.length,
      icon: <HourglassIcon className="h-5 w-5" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
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
      <PageHeader title="Approval Center" description={isAdminUser ? "Universal approval gateway for all system requests" : "Track your tasks, leave requests, and approvals"}>
        <Button variant="outline" size="sm" onClick={() => {
          queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-history"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-leaves"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-tasks"] });
          queryClient.invalidateQueries({ queryKey: ["approvals-overdue-training"] });
        }}>
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
            {isAdminUser ? "All Pending" : "My Pending"}
            {counts.total > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {counts.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            {isAdminUser ? "Task Approvals" : "My Tasks"}
            {(isAdminUser ? counts.tasksAwaitingApproval : myActiveTasks.length) > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {isAdminUser ? counts.tasksAwaitingApproval : myActiveTasks.length}
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

          {overdueTrainingCount > 0 && (
            <TabsTrigger value="overdue-training">
              Overdue Training
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {overdueTrainingCount}
              </Badge>
            </TabsTrigger>
          )}

          <TabsTrigger value="history">
            History
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: All Pending ── */}
        <TabsContent value="all-pending" className="mt-4">
          {loading ? (
            renderLoading()
          ) : unifiedPending.length === 0 ? (
            renderEmpty(isAdminUser ? "No pending approvals across the system." : "No pending items for you.")
          ) : (
            <div className="space-y-3">
              {unifiedPending.map((item) => renderUnifiedCard(item))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Task Approvals / My Tasks ── */}
        <TabsContent value="tasks" className="mt-4">
          {loading ? (
            renderLoading()
          ) : (isAdminUser ? pendingTasks : myActiveTasks).length === 0 ? (
            renderEmpty(isAdminUser ? "No tasks awaiting approval." : "No active tasks assigned to you.")
          ) : (
            <div className="space-y-3">
              {(isAdminUser ? pendingTasks : myActiveTasks).map((task) => renderTaskCard(task, isAdminUser))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Leave Requests / My Leaves ── */}
        <TabsContent value="leaves" className="mt-4">
          {loading ? (
            renderLoading()
          ) : (isAdminUser ? pendingLeaves : myLeaves).length === 0 ? (
            renderEmpty(isAdminUser ? "No pending leave requests." : "No leave requests found.")
          ) : (
            <div className="space-y-3">
              {(isAdminUser ? pendingLeaves : myLeaves).map((leave) => renderLeaveCard(leave, isAdminUser))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 4: Overdue Training ── */}
        <TabsContent value="overdue-training" className="mt-4">
          {loading ? (
            renderLoading()
          ) : overdueTraining.length === 0 ? (
            renderEmpty("No overdue training assignments.", <GraduationCap className="h-12 w-12 text-green-500" />)
          ) : (
            <div className="space-y-3">
              {overdueTraining.map((item) => renderOverdueTrainingCard(item))}
            </div>
          )}
        </TabsContent>


        {/* ── Tab: History ── */}
        <TabsContent value="history" className="mt-4">
          {loading ? (
            renderLoading()
          ) : historyItems.length === 0 ? (
            renderEmpty("No resolved items in history.", <Clock className="h-12 w-12 text-muted-foreground" />)
          ) : (
            <div className="space-y-2">
              {historyItems.map((item) => renderHistoryCard(item))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

