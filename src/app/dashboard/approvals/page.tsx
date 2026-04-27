"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, Bot, MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (res.ok) setApprovals(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    try {
      const body: { id: string; action: string; reason?: string } = { id, action };
      if (action === "reject" && rejectReasons[id]) {
        body.reason = rejectReasons[id];
      }

      await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      toast.success(action === "approve" ? "Approved!" : "Rejected - sent back to agent");
      fetchApprovals();
    } catch {
      toast.error("Failed to process approval");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Approval Queue</h1>
        <p className="text-muted-foreground text-sm">Review and approve AI agent outputs before they&apos;re finalized</p>
      </div>

      {(approvals as {
        id: string; type: string; agentName: string; title: string;
        description: string; output: string; projectName: string; createdAt: string;
      }[]).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold mb-1">All caught up!</h3>
            <p className="text-muted-foreground">No items pending approval right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(approvals as {
            id: string; type: string; agentName: string; title: string;
            description: string; output: string; projectName: string; createdAt: string;
          }[]).map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Bot className="h-3 w-3" />
                          <span>{item.agentName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">• {item.projectName}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>

                {item.output && (
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <MessageSquare className="h-3 w-3" /> Agent Output
                    </div>
                    <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">{item.output}</p>
                  </div>
                )}

                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Rejection reason (optional)..."
                      className="text-xs min-h-[36px]"
                      rows={1}
                      value={rejectReasons[item.id] || ""}
                      onChange={(e) => setRejectReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleAction(item.id, "approve")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleAction(item.id, "reject")}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
