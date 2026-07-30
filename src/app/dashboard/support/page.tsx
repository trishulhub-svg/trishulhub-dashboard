"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy, RefreshCw, Send, AlertCircle, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface ClientSupportTicket {
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

interface TeamTicketUser {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
}

interface TeamSupportTicket {
  id: string;
  ticketNumber: string;
  issueArea: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: TeamTicketUser | null;
  messages?: TicketMessage[];
}

type InboxTab = "team" | "client";

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
  const [tab, setTab] = useState<InboxTab>("team");
  const [clientTickets, setClientTickets] = useState<ClientSupportTicket[]>([]);
  const [teamTickets, setTeamTickets] = useState<TeamSupportTicket[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientSupportTicket | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamSupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [replying, setReplying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [savingResolution, setSavingResolution] = useState(false);

  const fetchClientTickets = useCallback(async () => {
    const res = await fetch("/api/support?page=1&limit=50", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load client tickets");
    const data = await res.json();
    setClientTickets(unwrapResponse<ClientSupportTicket>(data));
  }, []);

  const fetchTeamTickets = useCallback(async () => {
    const res = await fetch("/api/support/team", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load team tickets");
    const data = await res.json();
    setTeamTickets(Array.isArray(data.tickets) ? data.tickets : []);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      await Promise.all([fetchTeamTickets(), fetchClientTickets()]);
    } catch {
      toast.error("Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, [fetchClientTickets, fetchTeamTickets]);

  const fetchClientDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/support?id=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load ticket");
      const ticket = (await res.json()) as ClientSupportTicket;
      setSelectedClient(ticket);
      setSelectedClientId(id);
    } catch {
      toast.error("Failed to load ticket thread");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchTeamDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/support/team?id=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load ticket");
      const ticket = (await res.json()) as TeamSupportTicket;
      setSelectedTeam(ticket);
      setSelectedTeamId(id);
      setResolutionText(ticket.resolution || "");
    } catch {
      toast.error("Failed to load ticket thread");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleTabChange = (value: string) => {
    setTab(value as InboxTab);
    setReplyText("");
  };

  const handleSelectClient = (ticket: ClientSupportTicket) => {
    setReplyText("");
    void fetchClientDetail(ticket.id);
  };

  const handleSelectTeam = (ticket: TeamSupportTicket) => {
    setReplyText("");
    void fetchTeamDetail(ticket.id);
  };

  const handleClientReply = async () => {
    if (!selectedClient || !replyText.trim() || replying) return;
    setReplying(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selectedClient.id, message: replyText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send reply");
      }
      const updated = (await res.json()) as ClientSupportTicket;
      setSelectedClient(updated);
      setReplyText("");
      toast.success("Reply sent");
      void fetchClientTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };

  const handleClientStatusChange = async (status: string) => {
    if (!selectedClient || statusUpdating) return;
    setStatusUpdating(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selectedClient.id, status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }
      const updated = (await res.json()) as ClientSupportTicket;
      setSelectedClient(updated);
      toast.success("Status updated");
      void fetchClientTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const patchTeamTicket = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/support/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update ticket");
    }
    return (await res.json()) as TeamSupportTicket;
  };

  const handleTeamReply = async () => {
    if (!selectedTeam || !replyText.trim() || replying) return;
    setReplying(true);
    try {
      const updated = await patchTeamTicket({
        id: selectedTeam.id,
        reply: replyText.trim(),
      });
      setSelectedTeam(updated);
      setReplyText("");
      toast.success("Reply sent");
      void fetchTeamTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };

  const handleTeamStatusChange = async (status: string) => {
    if (!selectedTeam || statusUpdating) return;
    setStatusUpdating(true);
    try {
      const payload: Record<string, unknown> = { id: selectedTeam.id, status };
      if (status === "RESOLVED" && resolutionText.trim()) {
        payload.resolution = resolutionText.trim();
      }
      const updated = await patchTeamTicket(payload);
      setSelectedTeam(updated);
      setResolutionText(updated.resolution || "");
      toast.success("Status updated");
      void fetchTeamTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSaveResolution = async () => {
    if (!selectedTeam || savingResolution) return;
    setSavingResolution(true);
    try {
      const updated = await patchTeamTicket({
        id: selectedTeam.id,
        resolution: resolutionText.trim() || null,
      });
      setSelectedTeam(updated);
      toast.success("Resolution saved");
      void fetchTeamTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save resolution");
    } finally {
      setSavingResolution(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
          <Skeleton className="h-[480px] rounded-lg" />
          <Skeleton className="h-[480px] rounded-lg" />
        </div>
      </div>
    );
  }

  const clientMessages = selectedClient?.messages ?? [];
  const teamMessages = selectedTeam?.messages ?? [];

  return (
    <div className="space-y-4 th-page-enter">
      <PageHeader
        title="Support Inbox"
        description="Team and client tickets — reply, resolve, and update status"
      >
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/support/raise">
              <Plus className="h-4 w-4 mr-1" /> Raise ticket
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              void fetchAll();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </PageHeader>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto h-auto flex-wrap justify-start">
          <TabsTrigger value="team" className="text-xs sm:text-sm">
            Team tickets
            {teamTickets.length > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">({teamTickets.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="client" className="text-xs sm:text-sm">
            Client tickets
            {clientTickets.length > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">({clientTickets.length})</span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "team" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] min-h-[520px]">
          <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Team tickets ({teamTickets.length})
              </p>
            </div>
            <ScrollArea className="flex-1 max-h-[560px] lg:max-h-none">
              {teamTickets.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <LifeBuoy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No team tickets yet
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {teamTickets.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectTeam(ticket)}
                        className={cn(
                          "w-full text-left px-3 py-3 hover:bg-muted/40 transition-colors",
                          selectedTeamId === ticket.id && "bg-primary/5 border-l-2 border-l-primary"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {safeText(ticket.ticketNumber)}
                            </p>
                            <p className="text-sm font-medium line-clamp-1">{safeText(ticket.subject)}</p>
                          </div>
                          <Badge className={cn("text-[10px] shrink-0", statusStyles[ticket.status] || "")}>
                            {ticket.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {safeText(ticket.issueArea)}
                          {ticket.user?.name ? ` · ${safeText(ticket.user.name)}` : ""}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", priorityStyles[ticket.priority] || "")}
                          >
                            {ticket.priority}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatWhen(ticket.createdAt)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col min-h-[320px]">
            {!selectedTeam ? (
              <div className="flex-1 flex items-center justify-center p-8 text-sm text-muted-foreground">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Select a team ticket to view the thread
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
                      <p className="text-xs font-mono text-muted-foreground mb-0.5">
                        {safeText(selectedTeam.ticketNumber)}
                      </p>
                      <h2 className="text-base font-semibold">{safeText(selectedTeam.subject)}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {safeText(selectedTeam.issueArea)}
                        {selectedTeam.user?.name ? ` · ${safeText(selectedTeam.user.name)}` : ""}
                        {selectedTeam.user?.email ? ` · ${safeText(selectedTeam.user.email)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", priorityStyles[selectedTeam.priority] || "")}
                      >
                        {selectedTeam.priority}
                      </Badge>
                      <Select
                        value={selectedTeam.status}
                        onValueChange={handleTeamStatusChange}
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
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {safeText(selectedTeam.description)}
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Resolution
                    </p>
                    <Textarea
                      placeholder="Add resolution notes…"
                      value={resolutionText}
                      onChange={(e) => setResolutionText(e.target.value)}
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleSaveResolution()}
                      disabled={savingResolution}
                    >
                      {savingResolution ? "Saving…" : "Save resolution"}
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1 px-4 py-3 max-h-[220px]">
                  <div className="space-y-3">
                    {teamMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No replies yet</p>
                    ) : (
                      teamMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "rounded-md px-3 py-2 text-sm",
                            msg.senderType === "STAFF" ? "bg-primary/10" : "bg-muted/60"
                          )}
                        >
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">
                            {msg.senderType === "STAFF" ? "Staff" : "Requester"}
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
                    placeholder="Reply to team member…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    className="resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleTeamReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="shrink-0 self-end"
                    onClick={() => void handleTeamReply()}
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
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] min-h-[520px]">
          <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Client tickets ({clientTickets.length})
              </p>
            </div>
            <ScrollArea className="flex-1 max-h-[560px] lg:max-h-none">
              {clientTickets.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <LifeBuoy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No support tickets yet
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {clientTickets.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectClient(ticket)}
                        className={cn(
                          "w-full text-left px-3 py-3 hover:bg-muted/40 transition-colors",
                          selectedClientId === ticket.id && "bg-primary/5 border-l-2 border-l-primary"
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
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", priorityStyles[ticket.priority] || "")}
                          >
                            {ticket.priority}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatWhen(ticket.createdAt)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col min-h-[320px]">
            {!selectedClient ? (
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
                      <h2 className="text-base font-semibold">{safeText(selectedClient.subject)}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {safeText(selectedClient.client?.name)}
                        {selectedClient.client?.company
                          ? ` · ${safeText(selectedClient.client.company)}`
                          : ""}
                        {selectedClient.client?.email
                          ? ` · ${safeText(selectedClient.client.email)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedClient.status}
                        onValueChange={handleClientStatusChange}
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
                  <p className="text-sm text-muted-foreground">{safeText(selectedClient.description)}</p>
                </div>

                <ScrollArea className="flex-1 px-4 py-3 max-h-[280px]">
                  <div className="space-y-3">
                    {clientMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No replies yet</p>
                    ) : (
                      clientMessages.map((msg) => (
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
                        void handleClientReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="shrink-0 self-end"
                    onClick={() => void handleClientReply()}
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
      )}
    </div>
  );
}
