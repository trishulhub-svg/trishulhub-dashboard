"use client";

import { useEffect, useState, useCallback } from "react";
import {
  User, Clock, Calendar, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"team" | "leaves" | "attendance">("team");

  const fetchData = useCallback(async () => {
    try {
      const [userRes, leaveRes, attendRes] = await Promise.all([
        fetch("/api/team", { credentials: 'include' }),
        fetch("/api/team?type=leaves", { credentials: 'include' }),
        fetch("/api/team?type=attendance", { credentials: 'include' }),
      ]);
      if (userRes.ok) setUsers(await userRes.json());
      if (leaveRes.ok) setLeaves(await leaveRes.json());
      if (attendRes.ok) setAttendance(await attendRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLeaveAction = async (id: string, status: string) => {
    try {
      await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ type: "leave", id, status }),
      });
      toast.success(`Leave ${status.toLowerCase()}`);
      fetchData();
    } catch {
      toast.error("Failed to update leave");
    }
  };

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
          <p className="text-muted-foreground text-sm">Manage team members, attendance, and leave requests</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(["team", "leaves", "attendance"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t === "team" ? "Team" : t === "leaves" ? "Leave Requests" : "Attendance"}
          </Button>
        ))}
      </div>

      {tab === "team" && (
        <div className="grid gap-4 md:grid-cols-2">
          {(users as {
            id: string; name: string; email: string; role: string; isActive: boolean;
            _count: { assignedTasks: number; leaveRequests: number };
          }[]).map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${roleColors[user.role] || ""}`}>{user.role.replace("_", " ")}</Badge>
                    <Badge variant={user.isActive ? "default" : "secondary"} className="text-[10px]">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <span>{user._count?.assignedTasks || 0} tasks</span>
                  <span>{user._count?.leaveRequests || 0} leave requests</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "leaves" && (
        <div className="space-y-3">
          {(leaves as {
            id: string; type: string; startDate: string; endDate: string;
            reason?: string; status: string; user: { name: string; role: string };
          }[]).map((leave) => (
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
          {(attendance as {
            id: string; date: string; checkIn?: string; checkOut?: string;
            status: string; user: { name: string; role: string };
          }[]).map((record) => (
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
    </div>
  );
}
