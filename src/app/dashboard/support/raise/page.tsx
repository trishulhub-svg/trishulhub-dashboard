"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, RefreshCw, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, safeText } from "@/lib/utils";
import { toast } from "sonner";

const FALLBACK_ISSUE_AREAS = [
  "Time Tracking",
  "Docx Sign",
  "Access Hub",
  "Projects / Work",
  "CRM / Clients",
  "Training / Learning",
  "Leaves / Attendance",
  "Finance",
  "Login / Account",
  "Other",
] as const;

interface MyTicket {
  id: string;
  ticketNumber: string;
  issueArea: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  resolution?: string | null;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  OPEN: "bg-primary/10 text-primary",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CLOSED: "bg-muted text-muted-foreground",
};

const priorityStyles: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-primary/10 text-primary",
  HIGH: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  URGENT: "bg-destructive/15 text-destructive",
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RaiseSupportPage() {
  const [issueAreas, setIssueAreas] = useState<string[]>([...FALLBACK_ISSUE_AREAS]);
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [issueArea, setIssueArea] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");

  const fetchMyTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support/team?mine=1", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      const data = await res.json();
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      if (Array.isArray(data.issueAreas) && data.issueAreas.length > 0) {
        setIssueAreas(data.issueAreas);
      }
    } catch {
      toast.error("Failed to load your tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyTickets();
  }, [fetchMyTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!issueArea) {
      toast.error("Select an issue area");
      return;
    }
    if (subject.trim().length < 3) {
      toast.error("Subject must be at least 3 characters");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Description must be at least 10 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/support/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          issueArea,
          subject: subject.trim(),
          description: description.trim(),
          priority,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to raise ticket");
      }
      const created = (await res.json()) as MyTicket;
      toast.success(`Ticket ${created.ticketNumber} submitted`);
      setSubject("");
      setDescription("");
      setIssueArea("");
      setPriority("MEDIUM");
      void fetchMyTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to raise ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 th-page-enter max-w-3xl">
      <PageHeader
        title="Raise Support Ticket"
        description="Report an issue with TrishulHub tools — you'll get a ticket number by email"
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoading(true);
            void fetchMyTickets();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </PageHeader>

      <form
        onSubmit={handleSubmit}
        className="border border-border rounded-lg bg-card p-4 sm:p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="issueArea">Issue area</Label>
          <Select value={issueArea} onValueChange={setIssueArea}>
            <SelectTrigger id="issueArea">
              <SelectValue placeholder="Select area…" />
            </SelectTrigger>
            <SelectContent>
              {issueAreas.map((area) => (
                <SelectItem key={area} value={area}>
                  {area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary of the issue"
            maxLength={200}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened, what you expected, and any steps to reproduce…"
            rows={5}
            className="resize-none"
            maxLength={5000}
            required
          />
        </div>

        <div className="space-y-1.5 max-w-[200px]">
          <Label htmlFor="priority">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" disabled={submitting}>
          <Send className="h-4 w-4 mr-1.5" />
          {submitting ? "Submitting…" : "Submit ticket"}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">My tickets</h2>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="border border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
            <LifeBuoy className="h-8 w-8 mx-auto mb-2 opacity-30" />
            You haven&apos;t raised any tickets yet
          </div>
        ) : (
          <ul className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="px-4 py-3 space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">
                      {safeText(ticket.ticketNumber)}
                    </p>
                    <p className="text-sm font-medium">{safeText(ticket.subject)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", priorityStyles[ticket.priority] || "")}
                    >
                      {ticket.priority}
                    </Badge>
                    <Badge className={cn("text-[10px]", statusStyles[ticket.status] || "")}>
                      {ticket.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {safeText(ticket.issueArea)} · {formatWhen(ticket.createdAt)}
                </p>
                {ticket.resolution && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Resolution: </span>
                    {safeText(ticket.resolution)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
