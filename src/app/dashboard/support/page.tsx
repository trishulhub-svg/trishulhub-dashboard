"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, RefreshCw, Send, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, safeText } from "@/lib/utils";
import { unwrapResponse } from "@/lib/api-helpers";
import { toast } from "sonner";

interface TicketClient {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
}

interface TicketMessage {
  id: string;
  message: string;
  senderType: string;
  senderId?: string | null;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  client?: TicketClient | null;
  messages?: TicketMessage[];
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

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
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function SupportInboxPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support?page=1&limit=50", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      const data = await res.json();
      setTickets(unwrapResponse<SupportTicket>(data));
    } catch {
      toast.error("Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTicketDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/support?id=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load ticket");
      const ticket = (await res.json()) as SupportTicket;
      setSelected(ticket);
      setSelectedId(id);
    } catch {
      toast.error("Failed to load ticket thread");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSelect = (ticket: SupportTicket) => {
    setReplyText("");
    void fetchTicketDetail(ticket.id);
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim() || replying) return;
    setReplying(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selected.id, message: replyText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send reply");
      }
      const updated = (await res.json()) as SupportTicket;
      setSelected(updated);
      setReplyText("");
      toast.success("Reply sent");
      fetchTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected || statusUpdating) return;
    setStatusUpdating(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selected.id, status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }
      const updated = (await res.json()) as SupportTicket;
      setSelected(updated);
      toast.success("Status updated");
      fetchTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
          <Skeleton className="h-[480px] rounded-lg" />
          <Skeleton className="h-[480px] rounded-lg" />
        </div>
      </div>
    );
  }

  const messages = selected?.messages ?? [];

  return (
    <div className="space-y-4 th-page-enter">
      <PageHeader
        title="Support Inbox"
        description="Client tickets — reply and update status"
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoading(true);
            fetchTickets();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] min-h-[520px]">
        {/* Ticket list */}
        <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tickets ({tickets.length})
            </p>
          </div>
          <ScrollArea className="flex-1 max-h-[560px] lg:max-h-none">
            {tickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <LifeBuoy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No support tickets yet
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(ticket)}
                      className={cn(
                        "w-full text-left px-3 py-3 hover:bg-muted/40 transition-colors",
                        selectedId === ticket.id && "bg-primary/5 border-l-2 border-l-primary"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium line-clamp-1">{safeText(ticket.subject)}</p>
                        <Badge className={cn("text-[10px] shrink-0", statusStyles[ticket.status] || "")}>
                          {ticket.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {safeText(ticket.client?.company || ticket.client?.name, "Client")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className={cn("text-[10px]", priorityStyles[ticket.priority] || "")}>
                          {ticket.priority}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{formatWhen(ticket.createdAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        {/* Detail panel */}
        <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col min-h-[320px]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-muted-foreground">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Select a ticket to view the thread
              </div>
            </div>
          ) : detailLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">{safeText(selected.subject)}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {safeText(selected.client?.name)}
                      {selected.client?.company ? ` · ${safeText(selected.client.company)}` : ""}
                      {selected.client?.email ? ` · ${safeText(selected.client.email)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selected.status}
                      onValueChange={handleStatusChange}
                      disabled={statusUpdating}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{safeText(selected.description)}</p>
              </div>

              <ScrollArea className="flex-1 px-4 py-3 max-h-[280px]">
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No replies yet</p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm",
                          msg.senderType === "AI"
                            ? "bg-muted"
                            : msg.senderId
                              ? "bg-primary/10"
                              : "bg-muted/60"
                        )}
                      >
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">
                          {msg.senderType === "AI" ? "System" : msg.senderId ? "Staff" : "Client"}
                          <span className="ml-2 font-normal">{formatWhen(msg.createdAt)}</span>
                        </p>
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <div className="px-4 py-3 border-t border-border flex gap-2">
                <Textarea
                  placeholder="Reply to client…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleReply();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="shrink-0 self-end"
                  onClick={() => void handleReply()}
                  disabled={!replyText.trim() || replying}
                  aria-label="Send reply"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
