"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import {
  Plus, Mail, Phone, Globe, Building2, Star, X, Send, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { LEAD_COLUMNS } from "@/lib/types";
import type { LeadStatus } from "@/lib/types";

interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  website?: string;
  phone?: string;
  source: string;
  score: number;
  status: LeadStatus;
  notes?: string;
  createdAt: string;
}

const columnColors: Record<LeadStatus, string> = {
  NEW: "bg-blue-100 dark:bg-blue-900/30",
  CONTACTED: "bg-cyan-100 dark:bg-cyan-900/30",
  INTERESTED: "bg-green-100 dark:bg-green-900/30",
  PROPOSAL: "bg-yellow-100 dark:bg-yellow-900/30",
  NEGOTIATING: "bg-orange-100 dark:bg-orange-900/30",
  WON: "bg-emerald-100 dark:bg-emerald-900/30",
  LOST: "bg-red-100 dark:bg-red-900/30",
};

function DroppableColumn({ status, leads, onLeadClick }: { status: LeadStatus; leads: Lead[]; onLeadClick: (lead: Lead) => void }) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] lg:w-[260px]">
      <div className={`rounded-t-lg px-3 py-2 ${columnColors[status]}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{status}</h3>
          <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 space-y-2 p-2 bg-muted/30 rounded-b-lg min-h-[200px] max-h-[calc(100vh-16rem)] overflow-y-auto custom-scrollbar"
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No leads</p>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow text-left"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{lead.name}</p>
            {lead.company && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {lead.company}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 text-yellow-500" />
            <span className="text-xs font-medium">{lead.score}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary" className="text-[10px]">{lead.source}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CRMPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "DEVELOPER";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads", { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const newStatus = over.id as LeadStatus;

    if (!LEAD_COLUMNS.includes(newStatus)) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));

    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: leadId, status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update lead");
        fetchLeads(); // Rollback by refetching
        return;
      }
      toast.success(`Lead moved to ${newStatus}`);
    } catch {
      toast.error("Failed to move lead");
      fetchLeads();
    }
  };

  const handleAddLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      name: form.get("name") as string,
      email: form.get("email") as string,
      company: form.get("company") as string,
      phone: form.get("phone") as string,
      website: form.get("website") as string,
      source: form.get("source") as string || "MANUAL",
      score: parseInt(form.get("score") as string) || 0,
      notes: form.get("notes") as string,
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Lead added");
        setAddOpen(false);
        fetchLeads();
      }
    } catch {
      toast.error("Failed to add lead");
    }
  };

  const handleUpdateLead = async (data: Record<string, unknown>) => {
    if (!selectedLead) return;
    try {
      await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: selectedLead.id, ...data }),
      });
      toast.success("Lead updated");
      fetchLeads();
      setSelectedLead(null);
    } catch {
      toast.error("Failed to update lead");
    }
  };

  const filteredLeads = search
    ? leads.filter(
        (l) =>
          l.name.toLowerCase().includes(search.toLowerCase()) ||
          l.email.toLowerCase().includes(search.toLowerCase()) ||
          (l.company || "").toLowerCase().includes(search.toLowerCase())
      )
    : leads;

  // Role guard
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") { router.push("/dashboard"); return null; }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="flex gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-96 w-[260px] rounded-lg shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM Pipeline</h1>
          <p className="text-muted-foreground text-sm">Manage your leads and sales pipeline</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-48"
            />
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddLead} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input name="name" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input name="email" type="email" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company</Label>
                    <Input name="company" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input name="phone" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Website</Label>
                    <Input name="website" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Score</Label>
                    <Input name="score" type="number" defaultValue="0" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select name="source" defaultValue="MANUAL">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANUAL">Manual</SelectItem>
                      <SelectItem value="AI_FOUND">AI Found</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="SOCIAL_MEDIA">Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea name="notes" rows={2} />
                </div>
                <Button type="submit" className="w-full">Add Lead</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {LEAD_COLUMNS.map((status) => (
            <DroppableColumn
              key={status}
              status={status}
              leads={filteredLeads.filter((l) => l.status === status)}
              onLeadClick={setSelectedLead}
            />
          ))}
        </div>
        <DragOverlay>
          {activeId ? (
            <LeadCard lead={leads.find((l) => l.id === activeId)!} onClick={() => {}} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Lead Detail Panel */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSelectedLead(null)}>
          <div
            className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{selectedLead.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setSelectedLead(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedLead.email}</span>
                </div>
                {selectedLead.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedLead.phone}</span>
                  </div>
                )}
                {selectedLead.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedLead.company}</span>
                  </div>
                )}
                {selectedLead.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-primary hover:underline">{selectedLead.website}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Score: {selectedLead.score}</Badge>
                <Badge variant="secondary">{selectedLead.source}</Badge>
              </div>
              {selectedLead.notes && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedLead.notes}</p>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-2">
                <Label className="text-xs">Move to Stage</Label>
                <Select
                  value={selectedLead.status}
                  onValueChange={(value) => handleUpdateLead({ status: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_COLUMNS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Quick Email</Label>
                <Input placeholder="Subject" />
                <Textarea placeholder="Write your email..." rows={3} />
                <Button size="sm" className="w-full">
                  <Send className="h-3 w-3 mr-1" /> Send Email
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
