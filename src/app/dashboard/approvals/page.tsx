"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CheckCircle2, XCircle, Clock, Bot, MessageSquare, RefreshCw, AlertTriangle, Filter, Trash2, User, AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

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

const typeColors: Record<string, string> = {
  TASK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  INVOICE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  EMAIL: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  QUOTATION: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  PROJECT_PLAN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  CODE_REVIEW: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  LEAD_OUTREACH: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  CONTENT_PIECE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  CHAT_DELETION: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  PENDING: "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10",
  APPROVED: "border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/10",
  REJECTED: "border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-900/10",
  NEEDS_IMPROVEMENT: "border-orange-300 bg-orange-50/50 dark:border-orange-700 dark:bg-orange-900/10",
};

export default function ApprovalsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackTexts, setFeedbackTexts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("PENDING");

  const fetchApprovals = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = status ? `/api/approvals?status=${status}` : "/api/approvals?status=PENDING";
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setApprovals(await res.json());
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals(activeTab === "ALL" ? undefined : activeTab);
  }, [activeTab, fetchApprovals]);

  // Role guard
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") { router.push("/dashboard"); return null; }

  const handleAction = async (id: string, action: "APPROVED" | "REJECTED" | "NEEDS_IMPROVEMENT") => {
    try {
      const feedback = feedbackTexts[id] || undefined;

      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id, status: action, feedback }),
      });

      if (res.ok) {
        const msgs: Record<string, string> = {
          APPROVED: "Approved successfully!",
          REJECTED: "Rejected - sent back to agent",
          NEEDS_IMPROVEMENT: "Marked as needs improvement - agent will revise",
        };
        toast.success(msgs[action]);
        fetchApprovals(activeTab === "ALL" ? undefined : activeTab);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to process approval");
      }
    } catch {
      toast.error("Failed to process approval");
    }
  };

  const pendingCount = approvals.filter(a => a.status === "PENDING").length;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchApprovals(activeTab === "ALL" ? undefined : activeTab); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approval Queue</h1>
          <p className="text-muted-foreground text-sm">Review and approve AI agent outputs. Provide feedback to guide improvements.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchApprovals(activeTab === "ALL" ? undefined : activeTab)}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="PENDING">
            Pending {pendingCount > 0 && <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-[10px]">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          <TabsTrigger value="NEEDS_IMPROVEMENT">Needs Work</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
            </div>
          ) : approvals.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-1">All caught up!</h3>
                <p className="text-muted-foreground">No items {activeTab.toLowerCase()} right now.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {approvals.map((item) => {
                let parsedData: any = {};
                try { parsedData = JSON.parse(item.data); } catch (err) { console.error("Failed to parse approval data:", err); }

                return (
                  <Card key={item.id} className={`border ${statusColors[item.status] || ""}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${typeColors[item.type] || "bg-muted"}`}>
                            {item.type === "CHAT_DELETION" ? <Trash2 className="h-5 w-5" /> : item.requesterType === "AI" ? <Bot className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{item.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px]">{item.type === "CHAT_DELETION" ? "Chat Deletion" : item.type}</Badge>
                              {item.agent && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Bot className="h-3 w-3" />
                                  <span>{item.agent.name}</span>
                                </div>
                              )}
                              {item.requesterType === "AI" && (
                                <Badge variant="outline" className="text-[10px]">AI Requested</Badge>
                              )}
                              {item.type === "CHAT_DELETION" && parsedData.requestedBy && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span>Requested by {parsedData.requestedBy}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={item.status === "PENDING" ? "default" : "secondary"} className="text-xs">
                            {item.status.replace("_", " ")}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      )}

                      {parsedData.output && (
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                            <MessageSquare className="h-3 w-3" /> Agent Output
                          </div>
                          <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">{parsedData.output}</p>
                        </div>
                      )}

                      {item.feedback && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                          <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300 mb-1">
                            <AlertTriangle className="h-3 w-3" /> Feedback
                          </div>
                          <p className="text-sm">{item.feedback}</p>
                          {item.approvedBy && (
                            <p className="text-xs text-muted-foreground mt-1">By {item.approvedBy.name}</p>
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
                              onClick={() => handleAction(item.id, "APPROVED")}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                            </Button>
                            <Button
                              variant="outline"
                              className="border-orange-400 text-orange-600 hover:bg-orange-50 flex-1"
                              onClick={() => handleAction(item.id, "NEEDS_IMPROVEMENT")}
                            >
                              <AlertTriangle className="h-4 w-4 mr-1" /> Needs Work
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleAction(item.id, "REJECTED")}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
