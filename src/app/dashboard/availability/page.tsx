"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { safeParseDate, safeArray } from "@/lib/utils";
import {
  Clock, Plus, Trash2, CalendarDays, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface AvailabilityEntry {
  id: string;
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email: string; role: string; avatar: string | null };
}

interface OverrideEntry {
  id: string;
  userId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAvailable: boolean;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email: string; avatar: string | null };
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AvailabilityPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [availabilities, setAvailabilities] = useState<AvailabilityEntry[]>([]);
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Availability form state
  const [formUserId, setFormUserId] = useState("");
  const [formDayOfWeek, setFormDayOfWeek] = useState("1");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("17:00");
  const [formIsAvailable, setFormIsAvailable] = useState(true);

  // Override form state
  const [formOverrideUserId, setFormOverrideUserId] = useState("");
  const [formOverrideDate, setFormOverrideDate] = useState("");
  const [formOverrideStartTime, setFormOverrideStartTime] = useState("");
  const [formOverrideEndTime, setFormOverrideEndTime] = useState("");
  const [formOverrideIsAvailable, setFormOverrideIsAvailable] = useState(false);
  const [formOverrideReason, setFormOverrideReason] = useState("");

  const userRole = session?.user?.role || "DEVELOPER";
  const isUserAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const isSessionLoading = status === "loading";

  const fetchData = useCallback(async () => {
    try {
      const [availRes, overrideRes, teamRes] = await Promise.all([
        fetch("/api/availability", { credentials: "include" }),
        fetch("/api/availability/overrides", { credentials: "include" }),
        fetch("/api/team?type=users", { credentials: "include" }),
      ]);
      if (availRes.status === 401 || overrideRes.status === 401 || teamRes.status === 401) {
        router.push("/login"); return;
      }
      if (availRes.ok) setAvailabilities(safeArray(await availRes.json()));
      if (overrideRes.ok) setOverrides(safeArray(await overrideRes.json()));
      if (teamRes.ok) setTeamUsers(safeArray(await teamRes.json()));
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isUserAdmin) {
      fetchData();
    }
  }, [fetchData, isUserAdmin]);

  const handleCreateAvailability = async () => {
    if (!formUserId || formDayOfWeek === undefined) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formStartTime >= formEndTime) {
      toast.error("Start time must be before end time");
      return;
    }
    setSubmitting(true);
    try {
      let res;
      if (editingAvailability) {
        res = await fetch(`/api/availability/${editingAvailability.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            dayOfWeek: parseInt(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            isAvailable: formIsAvailable,
          }),
        });
      } else {
        res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId: formUserId,
            dayOfWeek: parseInt(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            isAvailable: formIsAvailable,
          }),
        });
      }
      if (res.ok) {
        toast.success(editingAvailability ? "Availability updated" : "Availability added");
        setAvailDialogOpen(false);
        resetAvailForm();
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save availability");
      }
    } catch {
      toast.error("Failed to save availability");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOverride = async () => {
    if (!formOverrideUserId || !formOverrideDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    const overrideDate = new Date(formOverrideDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (overrideDate < today) {
      toast.error("Override date cannot be in the past");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/availability/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: formOverrideUserId,
          date: formOverrideDate,
          startTime: formOverrideStartTime || null,
          endTime: formOverrideEndTime || null,
          isAvailable: formOverrideIsAvailable,
          reason: formOverrideReason || null,
        }),
      });
      if (res.ok) {
        toast.success("Override added");
        setOverrideDialogOpen(false);
        resetOverrideForm();
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to add override");
      }
    } catch {
      toast.error("Failed to add override");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    try {
      const res = await fetch(`/api/availability/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Availability deleted");
        fetchData();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleDeleteOverride = async (id: string) => {
    try {
      const res = await fetch(`/api/availability/overrides/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Override deleted");
        fetchData();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const resetAvailForm = () => {
    setFormUserId("");
    setFormDayOfWeek("1");
    setFormStartTime("09:00");
    setFormEndTime("17:00");
    setFormIsAvailable(true);
    setEditingAvailability(null);
  };

  const resetOverrideForm = () => {
    setFormOverrideUserId("");
    setFormOverrideDate("");
    setFormOverrideStartTime("");
    setFormOverrideEndTime("");
    setFormOverrideIsAvailable(false);
    setFormOverrideReason("");
  };

  const openEditAvailability = (entry: AvailabilityEntry) => {
    setEditingAvailability(entry);
    setFormUserId(entry.userId);
    setFormDayOfWeek(entry.dayOfWeek.toString());
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormIsAvailable(entry.isAvailable);
    setAvailDialogOpen(true);
  };

  // Group availabilities by user for the grid view
  const userAvailabilityMap = useMemo(() => {
    const map: Record<string, Record<number, AvailabilityEntry[]>> = {};
    for (const avail of availabilities) {
      if (!map[avail.userId]) map[avail.userId] = {};
      if (!map[avail.userId][avail.dayOfWeek]) map[avail.userId][avail.dayOfWeek] = [];
      map[avail.userId][avail.dayOfWeek].push(avail);
    }
    return map;
  }, [availabilities]);

  // Filter upcoming overrides
  const upcomingOverrides = useMemo(
    () => overrides.filter((o) => safeParseDate(o.date) >= new Date(new Date().toDateString())),
    [overrides],
  );

  if (isSessionLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Availability Management</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!isUserAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">You don&apos;t have access to this page</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Availability Management</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
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
        <Button variant="outline" onClick={() => { setError(null); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Availability Management</h1>
          <p className="text-muted-foreground text-sm">Manage employee weekly schedules and availability overrides</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
            <CalendarDays className="h-4 w-4 mr-2" /> Add Override
          </Button>
          <Button onClick={() => { resetAvailForm(); setAvailDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Availability
          </Button>
        </div>
      </div>

      {/* Weekly Schedule Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Schedule</CardTitle>
          <CardDescription>Employee availability across the week</CardDescription>
        </CardHeader>
        <CardContent>
          {teamUsers.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
              <p className="text-sm text-muted-foreground">No team members found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10 min-w-[150px]">Employee</TableHead>
                    {dayNamesShort.map((day, i) => (
                      <TableHead key={i} className="text-center min-w-[120px]">{day}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamUsers.map((user) => {
                    const userAvail = userAvailabilityMap[user.id] || {};
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="sticky left-0 bg-card z-10 font-medium text-sm">
                          {user.name}
                        </TableCell>
                        {Array.from({ length: 7 }).map((_, dayIdx) => {
                          const slots = userAvail[dayIdx] || [];
                          const hasSlots = slots.length > 0;
                          return (
                            <TableCell key={dayIdx} className="text-center">
                              {hasSlots ? (
                                <div className="space-y-1">
                                  {slots.map((slot) => (
                                    <div key={slot.id} className="group relative">
                                      <Badge
                                        className={`text-[9px] cursor-pointer ${slot.isAvailable ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}
                                        onClick={() => openEditAvailability(slot)}
                                      >
                                        {slot.startTime}-{slot.endTime}
                                      </Badge>
                                      <div className="hidden group-hover:flex absolute -top-1 -right-1 gap-0.5 z-20">
                                        <button
                                          className="h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                                          onClick={(e) => { e.stopPropagation(); handleDeleteAvailability(slot.id); }}
                                          aria-label="Delete time slot"
                                          type="button"
                                        >
                                          <Trash2 className="h-2 w-2" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Not Set</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Availability Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Availability Overrides</CardTitle>
          <CardDescription>Specific date overrides for employee availability</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingOverrides.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
              <p className="text-sm text-muted-foreground">No upcoming overrides</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
                <Plus className="h-3 w-3 mr-1" /> Add Override
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingOverrides.map((override) => (
                    <TableRow key={override.id}>
                      <TableCell className="font-medium text-sm">{override.user?.name || "Unknown"}</TableCell>
                      <TableCell className="text-xs">{safeParseDate(override.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">{override.startTime && override.endTime ? `${override.startTime}-${override.endTime}` : "All Day"}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${override.isAvailable ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}>
                          {override.isAvailable ? "Available" : "Unavailable"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{override.reason || "-"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => handleDeleteOverride(override.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Availability Dialog */}
      <Dialog open={availDialogOpen} onOpenChange={setAvailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAvailability ? "Edit Availability" : "Add Availability"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingAvailability && (
              <div>
                <Label>Employee</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Day of Week</Label>
              <Select value={formDayOfWeek} onValueChange={setFormDayOfWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dayNames.map((name, i) => (
                    <SelectItem key={i} value={i.toString()}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Available</Label>
              <Switch checked={formIsAvailable} onCheckedChange={setFormIsAvailable} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvailDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAvailability} disabled={submitting}>
              {submitting ? "Saving..." : editingAvailability ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Availability Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={formOverrideUserId} onValueChange={setFormOverrideUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={formOverrideDate} onChange={(e) => setFormOverrideDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time (Optional)</Label>
                <Input type="time" value={formOverrideStartTime} onChange={(e) => setFormOverrideStartTime(e.target.value)} placeholder="All day if empty" />
              </div>
              <div>
                <Label>End Time (Optional)</Label>
                <Input type="time" value={formOverrideEndTime} onChange={(e) => setFormOverrideEndTime(e.target.value)} placeholder="All day if empty" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Available</Label>
                <p className="text-xs text-muted-foreground">Toggle on if available, off if unavailable</p>
              </div>
              <Switch checked={formOverrideIsAvailable} onCheckedChange={setFormOverrideIsAvailable} />
            </div>
            <div>
              <Label>Reason (Optional)</Label>
              <Textarea
                value={formOverrideReason}
                onChange={(e) => setFormOverrideReason(e.target.value)}
                placeholder="Reason for the override..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOverride} disabled={submitting}>
              {submitting ? "Saving..." : "Add Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
