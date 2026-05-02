"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  User, Clock, Calendar, CheckCircle2, XCircle, Shield, Plus, Trash2, Bot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEVELOPER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CLIENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export default function TeamPage() {
  const [users, setUsers] = useState<unknown[]>([]);
  const [leaves, setLeaves] = useState<unknown[]>([]);
  const [attendance, setAttendance] = useState<unknown[]>([]);
  const [agentAccess, setAgentAccess] = useState<unknown[]>([]);
  const [agents, setAgents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"team" | "leaves" | "attendance" | "access">("team");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "DEVELOPER";
  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  // Leave form
  const [leaveForm, setLeaveForm] = useState({ userId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });

  // Access form
  const [accessForm, setAccessForm] = useState({ userId: "", agentId: "", canChat: true, canView: true, canApprove: false });

  // Add member form
  const [memberForm, setMemberForm] = useState({ name: "", email: "", role: "DEVELOPER", department: "Engineering", password: "" });

  const fetchData = useCallback(async () => {
    try {
      const [userRes, leaveRes, attendRes, accessRes, agentsRes] = await Promise.all([
        fetch("/api/team", { credentials: 'include' }),
        fetch("/api/team?type=leaves", { credentials: 'include' }),
        fetch("/api/team?type=attendance", { credentials: 'include' }),
        fetch("/api/team?type=agent-access", { credentials: 'include' }),
        fetch("/api/agents", { credentials: 'include' }),
      ]);
      if (userRes.ok) setUsers(await userRes.json());
      if (leaveRes.ok) setLeaves(await leaveRes.json());
      if (attendRes.ok) setAttendance(await attendRes.json());
      if (accessRes.ok) setAgentAccess(await accessRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLeaveAction = async (id: string, status: string, feedback?: string) => {
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ type: "leave", id, status, feedback }),
      });
      if (res.ok) {
        toast.success(`Leave ${status.toLowerCase()}`);
        fetchData();
      }
    } catch { toast.error("Failed to update leave"); }
  };

  const handleApplyLeave = async () => {
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ type: "leave", ...leaveForm }),
      });
      if (res.ok) {
        toast.success("Leave request submitted");
        setLeaveDialogOpen(false);
        setLeaveForm({ userId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to submit leave");
      }
    } catch { toast.error("Failed to submit leave"); }
  };

  const handleGrantAccess = async () => {
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ type: "agent-access", ...accessForm }),
      });
      if (res.ok) {
        toast.success("Agent access granted");
        setAccessDialogOpen(false);
        setAccessForm({ userId: "", agentId: "", canChat: true, canView: true, canApprove: false });
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to grant access");
      }
    } catch { toast.error("Failed to grant access"); }
  };

  const handleRemoveAccess = async (id: string) => {
    try {
      const res = await fetch(`/api/team?type=agent-access&id=${id}`, {
        method: "DELETE",
        credentials: 'include',
      });
      if (res.ok) {
        toast.success("Access removed");
        fetchData();
      }
    } catch { toast.error("Failed to remove access"); }
  };

  const handleAddMember = async () => {
    if (!memberForm.name || !memberForm.email || !memberForm.password) {
      toast.error("Name, email, and password are required");
      return;
    }
    setAddMemberLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "user",
          name: memberForm.name,
          email: memberForm.email,
          role: memberForm.role,
          department: memberForm.department,
          password: memberForm.password,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${memberForm.name} added to the team`);
        setAddMemberOpen(false);
        setMemberForm({ name: "", email: "", role: "DEVELOPER", department: "Engineering", password: "" });
        fetchData();
      } else {
        toast.error(data.error || "Failed to add member");
      }
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAddMemberLoading(false);
    }
  };

  // Role guard
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") { router.push("/dashboard"); return null; }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground text-sm">Manage team members, leave requests, and agent access</p>
        </div>
        <div className="flex gap-2">
          {tab === "team" && (
            <Button size="sm" onClick={() => setAddMemberOpen(true)} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-1" /> Add Member
            </Button>
          )}
          {tab === "leaves" && (
            <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Apply Leave
            </Button>
          )}
          {tab === "access" && (
            <Button size="sm" onClick={() => setAccessDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Grant Access
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["team", "leaves", "attendance", "access"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t === "team" ? "Team" : t === "leaves" ? "Leave Requests" : t === "attendance" ? "Attendance" : "Agent Access"}
          </Button>
        ))}
      </div>

      {tab === "team" && (
        <div className="grid gap-4 md:grid-cols-2">
          {(users as any[]).map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    {user.department && (
                      <p className="text-xs text-muted-foreground mt-0.5">{user.department}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${roleColors[user.role] || ""}`}>{user.role.replace("_", " ")}</Badge>
                    <Badge variant={user.isActive ? "default" : "secondary"} className="text-[10px]">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                {user.agentAccess && user.agentAccess.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {user.agentAccess.map((a: any) => (
                      <Badge key={a.id} variant="outline" className="text-[10px]">
                        <Bot className="h-2.5 w-2.5 mr-0.5" /> {a.agent?.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "leaves" && (
        <div className="space-y-3">
          {(leaves as any[]).map((leave) => (
            <Card key={leave.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{leave.user?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {leave.type} leave: {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                      </p>
                      {leave.reason && <p className="text-xs mt-1">{leave.reason}</p>}
                      {leave.feedback && (
                        <p className="text-xs mt-1 text-orange-600 dark:text-orange-400">
                          Feedback: {leave.feedback}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{leave.status}</Badge>
                    {leave.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-green-600" onClick={() => handleLeaveAction(leave.id, "APPROVED")}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleLeaveAction(leave.id, "REJECTED")}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(leaves as unknown[]).length === 0 && (
            <p className="text-center py-8 text-muted-foreground">No leave requests</p>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <div className="space-y-3">
          {(attendance as any[]).map((record) => (
            <Card key={record.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{record.user?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(record.date).toLocaleDateString()} •
                        Check-in: {record.checkIn ? new Date(record.checkIn).toLocaleTimeString() : "N/A"} •
                        Check-out: {record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : "N/A"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">{record.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "access" && (
        <div className="space-y-3">
          {(agentAccess as any[]).map((access) => (
            <Card key={access.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {access.user?.name} <span className="text-muted-foreground">→</span> {access.agent?.name}
                      </p>
                      <div className="flex gap-2 mt-1">
                        {access.canChat && <Badge variant="outline" className="text-[10px]">Chat</Badge>}
                        {access.canView && <Badge variant="outline" className="text-[10px]">View</Badge>}
                        {access.canApprove && <Badge variant="outline" className="text-[10px]">Approve</Badge>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleRemoveAccess(access.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(agentAccess as unknown[]).length === 0 && (
            <p className="text-center py-8 text-muted-foreground">No agent access mappings. Click "Grant Access" to add one.</p>
          )}
        </div>
      )}

      {/* Apply Leave Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm(p => ({ ...p, leaveType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASUAL">Casual Leave</SelectItem>
                  <SelectItem value="SICK">Sick Leave</SelectItem>
                  <SelectItem value="PAID">Paid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleApplyLeave} disabled={!leaveForm.startDate || !leaveForm.endDate}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Agent Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Member</Label>
              <Select value={accessForm.userId} onValueChange={(v) => setAccessForm(p => ({ ...p, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {(users as any[]).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>AI Agent</Label>
              <Select value={accessForm.agentId} onValueChange={(v) => setAccessForm(p => ({ ...p, agentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {(agents as any[]).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Can Chat</Label>
                <Switch checked={accessForm.canChat} onCheckedChange={(v) => setAccessForm(p => ({ ...p, canChat: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Can View</Label>
                <Switch checked={accessForm.canView} onCheckedChange={(v) => setAccessForm(p => ({ ...p, canView: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Can Approve</Label>
                <Switch checked={accessForm.canApprove} onCheckedChange={(v) => setAccessForm(p => ({ ...p, canApprove: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGrantAccess} disabled={!accessForm.userId || !accessForm.agentId}>Grant Access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Team Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input placeholder="e.g. John Smith" value={memberForm.name} onChange={(e) => setMemberForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" placeholder="e.g. john@trishulhub.com" value={memberForm.email} onChange={(e) => setMemberForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={memberForm.role} onValueChange={(v) => setMemberForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVELOPER">Developer</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={memberForm.department} onValueChange={(v) => setMemberForm(p => ({ ...p, department: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" placeholder="Minimum 6 characters" value={memberForm.password} onChange={(e) => setMemberForm(p => ({ ...p, password: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={!memberForm.name || !memberForm.email || !memberForm.password || addMemberLoading}>
              {addMemberLoading ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
