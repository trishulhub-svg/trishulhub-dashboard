"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, MessageSquare, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ticketStatusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-200 text-gray-800",
};

export default function PortalSupportPage() {
  const [tickets, setTickets] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Record<string, unknown> | null>(null);
  const [replyText, setReplyText] = useState("");

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support", { credentials: 'include' });
      if (res.ok) setTickets(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      clientId: "portal", // Would be actual client ID from session
      subject: form.get("subject") as string,
      description: form.get("description") as string,
      priority: form.get("priority") as string || "MEDIUM",
      message: form.get("description") as string,
    };

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Ticket created");
        setAddOpen(false);
        fetchTickets();
      }
    } catch {
      toast.error("Failed to create ticket");
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    try {
      await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          id: selectedTicket.id,
          message: replyText,
          senderType: "HUMAN",
        }),
      });
      toast.success("Reply sent");
      setReplyText("");
      fetchTickets();
      // Refresh selected ticket
      const updated = (tickets as { id: string }[]).find((t) => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated as unknown as Record<string, unknown>);
    } catch {
      toast.error("Failed to send reply");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Support Ticket</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateTicket} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Subject *</Label>
                <Input name="subject" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description *</Label>
                <Textarea name="description" rows={4} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select name="priority" defaultValue="MEDIUM">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Submit Ticket</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Ticket List */}
        <div className="space-y-3">
          {(tickets as { id: string; subject: string; status: string; priority: string; createdAt: string }[]).length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-1">No Tickets</h3>
                <p className="text-muted-foreground">Create a ticket to get support.</p>
              </CardContent>
            </Card>
          ) : (
            (tickets as { id: string; subject: string; status: string; priority: string; createdAt: string }[]).map((ticket) => (
              <Card
                key={ticket.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${selectedTicket?.id === ticket.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedTicket(ticket as unknown as Record<string, unknown>)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{ticket.subject}</p>
                    <Badge className={`text-[10px] ${ticketStatusColors[ticket.status] || ""}`}>{ticket.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">{ticket.priority}</Badge>
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Ticket Detail */}
        <div>
          {selectedTicket ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <h3 className="font-semibold">{(selectedTicket as { subject: string }).subject}</h3>
                  <Badge className={`text-[10px] mt-1 ${ticketStatusColors[(selectedTicket as { status: string }).status] || ""}`}>
                    {(selectedTicket as { status: string }).status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{(selectedTicket as { description: string }).description}</p>

                {((selectedTicket as { messages: { message: string; senderType: string; createdAt: string }[] }).messages || []).map((msg, i) => (
                  <div key={i} className={`p-2 rounded-lg text-sm ${msg.senderType === "AI" ? "bg-muted" : "bg-primary/10"}`}>
                    <p className="text-xs font-medium mb-1">{msg.senderType === "AI" ? "Support Agent" : "You"}</p>
                    <p>{msg.message}</p>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                  />
                  <Button onClick={handleReply} disabled={!replyText.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                Select a ticket to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
