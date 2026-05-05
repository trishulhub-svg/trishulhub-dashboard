"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Video, Plus, Calendar, Clock, Users, ExternalLink, MapPin,
  Phone, Monitor, ChevronDown, ChevronUp, X, Check, UserPlus,
  CalendarDays, CalendarRange, List, Grid3X3, VideoIcon,
  StickyNote, Link2, Play, Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ━━ Types ━━
interface MeetingAttendee {
  id: string;
  meetingId: string;
  userId: string;
  rsvpStatus: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
}

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  organizerId: string;
  meetingType: string;
  meetingLink: string | null;
  projectId: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  organizer: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  project: { id: string; name: string } | null;
  attendees: MeetingAttendee[];
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
}

interface Project {
  id: string;
  name: string;
}

// ━━ Constants ━━
const meetingTypeConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
  VIRTUAL: { label: "Virtual", icon: Video, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  IN_PERSON: { label: "In Person", icon: MapPin, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-900/30" },
  PHONE: { label: "Phone", icon: Phone, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
};

const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  SCHEDULED: { label: "Scheduled", color: "text-blue-700 dark:text-blue-300", bgColor: "bg-blue-100 dark:bg-blue-900/30", borderColor: "border-l-blue-500" },
  IN_PROGRESS: { label: "In Progress", color: "text-yellow-700 dark:text-yellow-300", bgColor: "bg-yellow-100 dark:bg-yellow-900/30", borderColor: "border-l-yellow-500" },
  COMPLETED: { label: "Completed", color: "text-green-700 dark:text-green-300", bgColor: "bg-green-100 dark:bg-green-900/30", borderColor: "border-l-green-500" },
  CANCELLED: { label: "Cancelled", color: "text-red-700 dark:text-red-300", bgColor: "bg-red-100 dark:bg-red-900/30", borderColor: "border-l-red-500" },
};

const rsvpConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { label: "Pending", color: "text-yellow-700 dark:text-yellow-300", bgColor: "bg-yellow-100 dark:bg-yellow-900/30", icon: Clock },
  ACCEPTED: { label: "Accepted", color: "text-green-700 dark:text-green-300", bgColor: "bg-green-100 dark:bg-green-900/30", icon: Check },
  DECLINED: { label: "Declined", color: "text-red-700 dark:text-red-300", bgColor: "bg-red-100 dark:bg-red-900/30", icon: X },
};

// ━━ Helpers ━━
function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isTomorrow(dateStr: string): boolean {
  const date = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
}

function isThisWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return date >= startOfWeek && date < endOfWeek;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getDateLabel(dateStr: string): string {
  if (isToday(dateStr)) return "Today";
  if (isTomorrow(dateStr)) return "Tomorrow";
  if (isThisWeek(dateStr)) return "This Week";
  return "Later";
}

// ━━ Main Component ━━
export default function MeetingsPage() {
  const { data: session } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ Today: true, Tomorrow: true, "This Week": true, Later: true });

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("");
  const [formMeetingType, setFormMeetingType] = useState("VIRTUAL");
  const [formMeetingLink, setFormMeetingLink] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [formAttendeeIds, setFormAttendeeIds] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState("");

  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch {
      console.error("Failed to fetch meetings");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeamAndProjects = useCallback(async () => {
    try {
      const [teamRes, projectsRes] = await Promise.all([
        fetch("/api/team", { credentials: "include" }),
        fetch("/api/projects", { credentials: "include" }),
      ]);
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeamMembers(teamData.filter((u: TeamMember) => u.id !== userId));
      }
      if (projectsRes.ok) {
        const projectData = await projectsRes.json();
        setProjects(projectData);
      }
    } catch (err) {
      console.error("Failed to fetch team and projects:", err);
    }
  }, [userId]);

  useEffect(() => {
    fetchMeetings();
    fetchTeamAndProjects();
  }, [fetchMeetings, fetchTeamAndProjects]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const upcoming = meetings.filter((m) => m.status === "SCHEDULED" && new Date(m.date) >= today).length;
    const todayCount = meetings.filter((m) => isToday(m.date) && m.status !== "CANCELLED").length;
    const thisWeek = meetings.filter((m) => {
      const d = new Date(m.date);
      return d >= today && d < weekEnd && m.status !== "CANCELLED";
    }).length;

    return { upcoming, todayCount, thisWeek };
  }, [meetings]);

  // Group meetings
  const groupedMeetings = useMemo(() => {
    const groups: Record<string, Meeting[]> = { Today: [], Tomorrow: [], "This Week": [], Later: [] };

    const sortedMeetings = [...meetings]
      .filter((m) => m.status !== "CANCELLED")
      .sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.startTime.localeCompare(b.startTime);
      });

    for (const meeting of sortedMeetings) {
      const label = getDateLabel(meeting.date);
      groups[label].push(meeting);
    }

    return groups;
  }, [meetings]);

  const cancelledMeetings = useMemo(() => meetings.filter((m) => m.status === "CANCELLED"), [meetings]);

  // Calendar days for the current month
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { day: number; meetings: Meeting[]; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, meetings: [], isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = new Date(year, month, d).toISOString();
      const dayMeetings = meetings.filter((m) => {
        const mDate = new Date(m.date);
        return mDate.getFullYear() === year && mDate.getMonth() === month && mDate.getDate() === d && m.status !== "CANCELLED";
      });
      days.push({ day: d, meetings: dayMeetings, isCurrentMonth: true });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, meetings: [], isCurrentMonth: false });
    }

    return days;
  }, [calendarDate, meetings]);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormDate("");
    setFormStartTime("09:00");
    setFormEndTime("");
    setFormMeetingType("VIRTUAL");
    setFormMeetingLink("");
    setFormProjectId("");
    setFormAttendeeIds([]);
    setFormNotes("");
    setEditMode(false);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (meeting: Meeting) => {
    setFormTitle(meeting.title);
    setFormDescription(meeting.description || "");
    setFormDate(new Date(meeting.date).toISOString().split("T")[0]);
    setFormStartTime(meeting.startTime);
    setFormEndTime(meeting.endTime || "");
    setFormMeetingType(meeting.meetingType);
    setFormMeetingLink(meeting.meetingLink || "");
    setFormProjectId(meeting.projectId || "");
    setFormAttendeeIds(meeting.attendees.map((a) => a.userId));
    setFormNotes(meeting.notes || "");
    setEditMode(true);
    setDetailOpen(false);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formTitle || !formDate || !formStartTime) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const url = editMode ? `/api/meetings/${selectedMeeting?.id}` : "/api/meetings";
      const method = editMode ? "PATCH" : "POST";
      const body: any = {
        title: formTitle,
        description: formDescription || undefined,
        date: formDate,
        startTime: formStartTime,
        endTime: formEndTime || undefined,
        meetingType: formMeetingType,
        meetingLink: formMeetingLink || undefined,
        projectId: formProjectId === "none" ? undefined : (formProjectId || undefined),
        attendeeIds: formAttendeeIds,
        notes: formNotes || undefined,
      };

      if (editMode) {
        body.id = selectedMeeting?.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editMode ? "Meeting updated" : "Meeting scheduled");
        setDialogOpen(false);
        resetForm();
        fetchMeetings();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save meeting");
      }
    } catch {
      toast.error("Failed to save meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (meetingId: string) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Meeting cancelled");
        setDetailOpen(false);
        fetchMeetings();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to cancel meeting");
      }
    } catch {
      toast.error("Failed to cancel meeting");
    }
  };

  const handleRsvp = async (meetingId: string, rsvpStatus: "ACCEPTED" | "DECLINED") => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rsvpStatus }),
      });
      if (res.ok) {
        toast.success(rsvpStatus === "ACCEPTED" ? "Meeting accepted" : "Meeting declined");
        fetchMeetings();
        // Update detail view if open
        if (selectedMeeting?.id === meetingId) {
          setSelectedMeeting((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              attendees: prev.attendees.map((a) =>
                a.userId === userId ? { ...a, rsvpStatus } : a
              ),
            };
          });
        }
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update RSVP");
      }
    } catch {
      toast.error("Failed to update RSVP");
    }
  };

  const toggleAttendee = (memberId: string) => {
    setFormAttendeeIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const getUserRsvp = (meeting: Meeting): string | null => {
    const attendee = meeting.attendees.find((a) => a.userId === userId);
    return attendee?.rsvpStatus || null;
  };

  const isOrganizer = (meeting: Meeting): boolean => meeting.organizerId === userId;

  const openDetail = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setDetailOpen(true);
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // ━━ Loading State ━━
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded mt-2" />
          </div>
          <div className="h-10 w-40 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ━━ Header ━━ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="h-7 w-7 text-primary" />
            Meetings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Schedule and manage team meetings</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none h-9 px-3"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4 mr-1" /> List
            </Button>
            <Button
              variant={viewMode === "calendar" ? "default" : "ghost"}
              size="sm"
              className="rounded-none h-9 px-3"
              onClick={() => setViewMode("calendar")}
            >
              <Grid3X3 className="h-4 w-4 mr-1" /> Calendar
            </Button>
          </div>
          {isAdmin && (
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" /> Schedule Meeting
            </Button>
          )}
        </div>
      </div>

      {/* ━━ Stats Cards ━━ */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-blue-500" />
              Upcoming Meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold">{stats.upcoming}</span>
              <span className="text-xs text-muted-foreground">scheduled</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-green-500" />
              Today&apos;s Meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold">{stats.todayCount}</span>
              <span className="text-xs text-muted-foreground">today</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              This Week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold">{stats.thisWeek}</span>
              <span className="text-xs text-muted-foreground">meetings</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ━━ Main Content ━━ */}
      {viewMode === "list" ? (
        <div className="space-y-4">
          {meetings.filter((m) => m.status !== "CANCELLED").length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Video className="h-16 w-16 mx-auto text-muted-foreground opacity-30 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">No meetings scheduled</h3>
                  <p className="text-sm text-muted-foreground mt-1">Start by scheduling a new meeting</p>
                  {isAdmin && (
                    <Button className="mt-4" onClick={openCreateDialog}>
                      <Plus className="h-4 w-4 mr-2" /> Schedule Meeting
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedMeetings).map(([group, groupMeetings]) => {
              if (groupMeetings.length === 0) return null;
              const isExpanded = expandedGroups[group] !== false;
              return (
                <div key={group}>
                  <button
                    onClick={() => toggleGroup(group)}
                    className="flex items-center gap-2 w-full text-left mb-3 group"
                    type="button"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {group}
                    </h2>
                    <Badge variant="secondary" className="text-xs">
                      {groupMeetings.length}
                    </Badge>
                  </button>
                  {isExpanded && (
                    <div className="space-y-3">
                      {groupMeetings.map((meeting) => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          userId={userId}
                          isAdmin={isAdmin}
                          onOpenDetail={openDetail}
                          onRsvp={handleRsvp}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Cancelled meetings */}
          {cancelledMeetings.length > 0 && (
            <div>
              <button
                onClick={() => toggleGroup("Cancelled")}
                className="flex items-center gap-2 w-full text-left mb-3 group"
                type="button"
              >
                {expandedGroups["Cancelled"] !== false ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Cancelled
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {cancelledMeetings.length}
                </Badge>
              </button>
              {expandedGroups["Cancelled"] !== false && (
                <div className="space-y-3 opacity-60">
                  {cancelledMeetings.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      userId={userId}
                      isAdmin={isAdmin}
                      onOpenDetail={openDetail}
                      onRsvp={handleRsvp}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ━━ Calendar View ━━ */
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {calendarDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setMonth(d.getMonth() - 1);
                  setCalendarDate(d);
                }}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCalendarDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setMonth(d.getMonth() + 1);
                  setCalendarDate(d);
                }}>
                  Next
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Calendar Header */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-t-lg overflow-hidden">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="bg-muted px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden">
              {calendarDays.map((dayInfo, idx) => {
                const isCurrentDay = dayInfo.isCurrentMonth &&
                  dayInfo.day === new Date().getDate() &&
                  calendarDate.getMonth() === new Date().getMonth() &&
                  calendarDate.getFullYear() === new Date().getFullYear();

                return (
                  <div
                    key={idx}
                    className={cn(
                      "bg-card min-h-[100px] p-1.5 relative",
                      !dayInfo.isCurrentMonth && "bg-muted/30",
                      isCurrentDay && "bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full",
                        isCurrentDay && "bg-primary text-primary-foreground",
                        !dayInfo.isCurrentMonth && "text-muted-foreground/50"
                      )}
                    >
                      {dayInfo.day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayInfo.meetings.slice(0, 3).map((m) => {
                        const typeConf = meetingTypeConfig[m.meetingType] || meetingTypeConfig.VIRTUAL;
                        return (
                          <button
                            key={m.id}
                            onClick={() => openDetail(m)}
                            className="w-full text-left"
                            type="button"
                          >
                            <div className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded truncate font-medium",
                              typeConf.bgColor,
                              typeConf.color
                            )}>
                              {m.startTime} {m.title}
                            </div>
                          </button>
                        );
                      })}
                      {dayInfo.meetings.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">
                          +{dayInfo.meetings.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ━━ Schedule/Edit Meeting Dialog ━━ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              {editMode ? "Edit Meeting" : "Schedule Meeting"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Title */}
            <div>
              <Label>Title *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Meeting title"
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief meeting description..."
                rows={3}
                className="mt-1"
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start *</Label>
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Meeting Type */}
            <div>
              <Label>Meeting Type</Label>
              <Select value={formMeetingType} onValueChange={setFormMeetingType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIRTUAL">
                    <span className="flex items-center gap-2">
                      <Video className="h-4 w-4" /> Virtual Meeting
                    </span>
                  </SelectItem>
                  <SelectItem value="IN_PERSON">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> In Person
                    </span>
                  </SelectItem>
                  <SelectItem value="PHONE">
                    <span className="flex items-center gap-2">
                      <Phone className="h-4 w-4" /> Phone Call
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Google Meet Link */}
            {formMeetingType === "VIRTUAL" && (
              <div>
                <Label className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5" />
                  Meeting Link
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={formMeetingLink}
                    onChange={(e) => setFormMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/xxx-xxxx-xxx"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => window.open("https://meet.google.com", "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Open Meet
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Create a Google Meet at meet.google.com and paste the link here
                </p>
              </div>
            )}

            {/* Project */}
            <div>
              <Label>Project</Label>
              <Select value={formProjectId} onValueChange={setFormProjectId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Attendees */}
            <div>
              <Label className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                Attendees
              </Label>
              <div className="mt-2 border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                {teamMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No team members available</p>
                ) : (
                  teamMembers.map((member) => (
                    <label
                      key={member.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                        formAttendeeIds.includes(member.id)
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-accent"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={formAttendeeIds.includes(member.id)}
                        onChange={() => toggleAttendee(member.id)}
                        className="rounded"
                      />
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-[10px] text-muted-foreground">{member.role}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {formAttendeeIds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formAttendeeIds.length} attendee{formAttendeeIds.length > 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional notes for this meeting..."
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : editMode ? "Update Meeting" : "Schedule Meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ━━ Meeting Detail Sheet ━━ */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedMeeting && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-xl pr-6">{selectedMeeting.title}</SheetTitle>
              </SheetHeader>

              {/* Status & Type Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("text-xs", statusConfig[selectedMeeting.status]?.bgColor, statusConfig[selectedMeeting.status]?.color)}>
                  {statusConfig[selectedMeeting.status]?.label}
                </Badge>
                <Badge variant="outline" className={cn("text-xs", meetingTypeConfig[selectedMeeting.meetingType]?.color)}>
                  {(() => {
                    const Icon = meetingTypeConfig[selectedMeeting.meetingType]?.icon || Video;
                    return <Icon className="h-3 w-3 mr-1" />;
                  })()}
                  {meetingTypeConfig[selectedMeeting.meetingType]?.label}
                </Badge>
              </div>

              {/* Join Meeting Button */}
              {selectedMeeting.meetingType === "VIRTUAL" && selectedMeeting.meetingLink && (
                <a
                  href={selectedMeeting.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full" size="lg">
                    <Video className="h-5 w-5 mr-2" />
                    Join with Google Meet
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </a>
              )}

              <Separator />

              {/* Meeting Details */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{formatDate(selectedMeeting.date)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatTime(selectedMeeting.startTime)}
                      {selectedMeeting.endTime && ` — ${formatTime(selectedMeeting.endTime)}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Organizer</p>
                    <p className="text-sm text-muted-foreground">{selectedMeeting.organizer.name}</p>
                  </div>
                </div>

                {selectedMeeting.project && (
                  <div className="flex items-start gap-3">
                    <Monitor className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Project</p>
                      <p className="text-sm text-muted-foreground">{selectedMeeting.project.name}</p>
                    </div>
                  </div>
                )}

                {selectedMeeting.meetingLink && (
                  <div className="flex items-start gap-3">
                    <Link2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Meeting Link</p>
                      <a
                        href={selectedMeeting.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                      >
                        {selectedMeeting.meetingLink}
                      </a>
                    </div>
                  </div>
                )}

                {selectedMeeting.description && (
                  <div className="flex items-start gap-3">
                    <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Description</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedMeeting.description}</p>
                    </div>
                  </div>
                )}

                {selectedMeeting.notes && (
                  <div className="flex items-start gap-3">
                    <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Notes</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedMeeting.notes}</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Attendees */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Attendees ({selectedMeeting.attendees.length})
                </h3>
                <div className="space-y-2">
                  {selectedMeeting.attendees.map((attendee) => {
                    const rsvp = rsvpConfig[attendee.rsvpStatus] || rsvpConfig.PENDING;
                    const RsvpIcon = rsvp.icon;
                    return (
                      <div key={attendee.id} className="flex items-center justify-between p-2 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(attendee.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{attendee.user.name}</p>
                            <p className="text-[10px] text-muted-foreground">{attendee.user.email}</p>
                          </div>
                        </div>
                        <Badge className={cn("text-[10px]", rsvp.bgColor, rsvp.color)}>
                          <RsvpIcon className="h-3 w-3 mr-1" />
                          {rsvp.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RSVP for current user */}
              {!isOrganizer(selectedMeeting) && getUserRsvp(selectedMeeting) && selectedMeeting.status !== "CANCELLED" && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Your RSVP</h3>
                    <div className="flex gap-2">
                      <Button
                        variant={getUserRsvp(selectedMeeting) === "ACCEPTED" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => handleRsvp(selectedMeeting.id, "ACCEPTED")}
                      >
                        <Check className="h-4 w-4 mr-1" /> Accept
                      </Button>
                      <Button
                        variant={getUserRsvp(selectedMeeting) === "DECLINED" ? "destructive" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => handleRsvp(selectedMeeting.id, "DECLINED")}
                      >
                        <X className="h-4 w-4 mr-1" /> Decline
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Actions */}
              {(isOrganizer(selectedMeeting) || isAdmin) && selectedMeeting.status !== "CANCELLED" && (
                <>
                  <Separator />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditDialog(selectedMeeting)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleCancel(selectedMeeting.id)}>
                      Cancel Meeting
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ━━ Meeting Card Component ━━
function MeetingCard({
  meeting,
  userId,
  isAdmin,
  onOpenDetail,
  onRsvp,
}: {
  meeting: Meeting;
  userId: string;
  isAdmin: boolean;
  onOpenDetail: (m: Meeting) => void;
  onRsvp: (meetingId: string, rsvpStatus: "ACCEPTED" | "DECLINED") => void;
}) {
  const typeConf = meetingTypeConfig[meeting.meetingType] || meetingTypeConfig.VIRTUAL;
  const statusConf = statusConfig[meeting.status] || statusConfig.SCHEDULED;
  const TypeIcon = typeConf.icon;
  const userRsvp = meeting.attendees.find((a) => a.userId === userId)?.rsvpStatus;
  const isOrganizer = meeting.organizerId === userId;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md border-l-4",
        statusConf.borderColor,
        meeting.status === "CANCELLED" && "opacity-60"
      )}
      onClick={() => onOpenDetail(meeting)}
    >
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* Time Column */}
          <div className="sm:w-24 shrink-0 text-center sm:text-left">
            <p className="text-lg font-bold">{formatTime(meeting.startTime)}</p>
            {meeting.endTime && (
              <p className="text-xs text-muted-foreground">{formatTime(meeting.endTime)}</p>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h3 className="font-semibold text-sm truncate">{meeting.title}</h3>
              <Badge className={cn("text-[10px]", typeConf.bgColor, typeConf.color)}>
                <TypeIcon className="h-3 w-3 mr-1" />
                {typeConf.label}
              </Badge>
              {meeting.status !== "SCHEDULED" && (
                <Badge className={cn("text-[10px]", statusConf.bgColor, statusConf.color)}>
                  {statusConf.label}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(meeting.date)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {meeting.organizer.name}
              </span>
              {meeting.project && (
                <span className="flex items-center gap-1">
                  <Monitor className="h-3 w-3" />
                  {meeting.project.name}
                </span>
              )}
            </div>

            {/* Attendee Avatars */}
            {meeting.attendees.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <div className="flex -space-x-2">
                  {meeting.attendees.slice(0, 3).map((attendee) => (
                    <TooltipProvider key={attendee.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Avatar className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                              {getInitials(attendee.user.name)}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {attendee.user.name}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
                {meeting.attendees.length > 3 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    +{meeting.attendees.length - 3} more
                  </span>
                )}
              </div>
            )}

            {/* RSVP Status / Actions for current user */}
            {userRsvp && !isOrganizer && meeting.status !== "CANCELLED" && (
              <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                {userRsvp === "PENDING" ? (
                  <>
                    <span className="text-xs text-muted-foreground">RSVP:</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onRsvp(meeting.id, "ACCEPTED")}>
                      <Check className="h-3 w-3 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => onRsvp(meeting.id, "DECLINED")}>
                      <X className="h-3 w-3 mr-1" /> Decline
                    </Button>
                  </>
                ) : (
                  <Badge className={cn("text-[10px]", rsvpConfig[userRsvp]?.bgColor, rsvpConfig[userRsvp]?.color)}>
                    {(() => {
                      const RsvpIcon = rsvpConfig[userRsvp]?.icon || Clock;
                      return <RsvpIcon className="h-3 w-3 mr-1" />;
                    })()}
                    {rsvpConfig[userRsvp]?.label}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Google Meet Join Button */}
          {meeting.meetingType === "VIRTUAL" && meeting.meetingLink && meeting.status !== "CANCELLED" && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <a href={meeting.meetingLink} target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Video className="h-4 w-4 mr-1.5" />
                  Join
                </Button>
              </a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
