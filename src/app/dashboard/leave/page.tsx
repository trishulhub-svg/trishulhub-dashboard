"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Calendar, Plus, CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";

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
  user?: { id: string; name: string; email: string };
  approver?: { id: string; name: string } | null;
}

const leaveTypeColors: Record<string, string> = {
  CASUAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  SICK: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const leaveStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function LeavePage() {
  const { data: session } = useSession();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formType, setFormType] = useState("CASUAL");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");

  const userRole = (session?.user as { role?: string })?.role || "DEVELOPER";
  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const fetchLeaves = useCallback(async () => {
    try {
      const res = await fetch("/api/leave", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLeaves(data);
      }
    } catch (err) {
      console.error("Failed to fetch leaves:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const handleSubmit = async () => {
    if (!formStartDate || !formEndDate) {
      toast.error("Please select start and end dates");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: formType,
          startDate: formStartDate,
          endDate: formEndDate,
          reason: formReason,
        }),
      });
      if (res.ok) {
        toast.success("Leave request submitted");
        setDialogOpen(false);
        setFormType("CASUAL");
        setFormStartDate("");
        setFormEndDate("");
        setFormReason("");
        fetchLeaves();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to submit leave request");
      }
    } catch {
      toast.error("Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproval = async (leaveId: string, status: "APPROVED" | "REJECTED", feedback?: string) => {
    try {
      const res = await fetch("/api/leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: leaveId, status, feedback }),
      });
      if (res.ok) {
        toast.success(`Leave ${status.toLowerCase()}`);
        fetchLeaves();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update leave");
      }
    } catch {
      toast.error("Failed to update leave");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const pendingLeaves = leaves.filter((l) => l.status === "PENDING");
  const myLeaves = leaves.filter((l) => l.userId === (session?.user as any)?.id);
  const approvedThisMonth = leaves.filter(
    (l) => l.status === "APPROVED" && new Date(l.createdAt).getMonth() === new Date().getMonth()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground text-sm">Apply for leave and manage team absences</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Apply for Leave
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <span className="text-3xl font-bold">{pendingLeaves.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My Leaves</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-blue-500" />
              <span className="text-3xl font-bold">{myLeaves.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved This Month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <span className="text-3xl font-bold">{approvedThisMonth.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals (Admin only) */}
      {isAdmin && pendingLeaves.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Pending Approvals
            </CardTitle>
            <CardDescription>Review and approve or reject leave requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingLeaves.map((leave) => (
              <div key={leave.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{leave.user?.name || "Unknown"}</span>
                    <Badge className={`text-[10px] ${leaveTypeColors[leave.type] || ""}`}>{leave.type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                    {" "} ({Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} days)
                  </p>
                  {leave.reason && <p className="text-xs text-muted-foreground mt-1">Reason: {leave.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleApproval(leave.id, "APPROVED")}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleApproval(leave.id, "REJECTED")}>
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Leave Requests */}
      <Card>
        <CardHeader>
          <CardTitle>All Leave Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {leaves.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
              <p className="text-sm text-muted-foreground">No leave requests yet</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Apply for Leave
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {leaves.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{leave.user?.name || "You"}</span>
                      <Badge className={`text-[10px] ${leaveTypeColors[leave.type] || ""}`}>{leave.type}</Badge>
                      <Badge className={`text-[10px] ${leaveStatusColors[leave.status] || ""}`}>{leave.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                    </p>
                    {leave.reason && <p className="text-xs text-muted-foreground mt-0.5">{leave.reason}</p>}
                    {leave.feedback && <p className="text-xs text-orange-600 mt-0.5">Feedback: {leave.feedback}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(leave.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apply for Leave Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASUAL">Casual Leave</SelectItem>
                  <SelectItem value="SICK">Sick Leave</SelectItem>
                  <SelectItem value="PAID">Paid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason (Optional)</Label>
              <Textarea
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Brief reason for your leave request..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
