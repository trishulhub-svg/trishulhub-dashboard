"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Pause,
  Play,
  CreditCard,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { emitFinanceChanged, useFinanceLiveRefresh } from "@/lib/finance-events";
import { handleFetchError } from "@/lib/fetch-utils";
import { deepSanitize, safeText, safeNumber } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { SubscriptionExpiryBadge } from "@/components/dashboard/finance/subscription-expiry-badge";
import { SubscriptionExpiryChecker } from "@/components/dashboard/finance/subscription-expiry-checker";
import { CATEGORY_BADGE_COLORS } from "@/lib/format";

const DEFAULT_EXCHANGE_RATES: Record<string, number> = { INR: 1, USD: 83.5, GBP: 105.5 };
const SUB_FREQUENCY_COLORS: Record<string, string> = {
  MONTHLY: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  YEARLY: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ONE_TIME: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

interface Subscription {
  id: string;
  service: string;
  amount: number;
  currency: string;
  exchangeRate?: number | null;
  frequency: string;
  status: string;
  category?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  notes?: string | null;
  monthlyINR?: number;
  createdAt?: string;
}

export default function SubscriptionsPage() {
  const router = useRouter();
  const { status } = useSession();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [subTotalMonthly, setSubTotalMonthly] = useState(0);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [subSearchDebounced, setSubSearchDebounced] = useState("");
  const subSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [liveRates, setLiveRates] = useState<Record<string, number>>(DEFAULT_EXCHANGE_RATES);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({
    service: "",
    amount: "",
    currency: "GBP",
    exchangeRate: "1",
    frequency: "MONTHLY",
    status: "ACTIVE",
    category: "",
    projectId: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  const getRateForCurrency = useCallback((currency: string) => {
    return liveRates[currency] || DEFAULT_EXCHANGE_RATES[currency] || 1;
  }, [liveRates]);

  const resetSubForm = useCallback(() => {
    setSubForm({
      service: "",
      amount: "",
      currency: "GBP",
      exchangeRate: "1",
      frequency: "MONTHLY",
      status: "ACTIVE",
      category: "",
      projectId: "",
      startDate: "",
      endDate: "",
      notes: "",
    });
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setSubLoading(true);
      const params = new URLSearchParams();
      if (subSearchDebounced) params.set("search", subSearchDebounced);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("limit", "200");
      const res = await fetch(`/api/subscriptions?${params.toString()}`, { credentials: "include" });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const raw = await res.json();
        const json = deepSanitize<{ subscriptions?: Subscription[]; totalMonthlyCost?: number }>(raw);
        setSubscriptions(json.subscriptions || []);
        setSubTotalMonthly(json.totalMonthlyCost || 0);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to load subscriptions");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    } finally {
      setSubLoading(false);
    }
  }, [router, subSearchDebounced, startDate, endDate]);

  useFinanceLiveRefresh(() => void fetchSubscriptions());

  const loadRates = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange-rates", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data?.rates) {
          setLiveRates((prev) => ({ ...DEFAULT_EXCHANGE_RATES, ...data.rates }));
          setRatesLoaded(true);
        }
      }
    } catch {
      /* keep defaults */
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?page=1&limit=200", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.projects || data.data || []);
        setProjects(
          arr
            .filter((p: { id?: string; name?: string }) => p?.id && p?.name)
            .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (subSearchTimerRef.current) clearTimeout(subSearchTimerRef.current);
    subSearchTimerRef.current = setTimeout(() => setSubSearchDebounced(subSearch), 300);
    return () => {
      if (subSearchTimerRef.current) clearTimeout(subSearchTimerRef.current);
    };
  }, [subSearch]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // Standard data-loading effect on mount (matches app-wide pattern)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSubscriptions();
    void loadRates();
    void loadProjects();
  }, [status]);

  const openSubDialog = (sub?: Subscription | null) => {
    if (sub) {
      setEditingSub(sub);
      setSubForm({
        service: sub.service || "",
        amount: String(sub.amount) || "",
        currency: sub.currency || "GBP",
        exchangeRate: String(sub.exchangeRate || getRateForCurrency(sub.currency || "GBP")),
        frequency: sub.frequency || "MONTHLY",
        status: sub.status || "ACTIVE",
        category: sub.category || "",
        projectId: sub.projectId || "",
        startDate: sub.startDate ? new Date(sub.startDate).toISOString().split("T")[0] : "",
        endDate: sub.endDate ? new Date(sub.endDate).toISOString().split("T")[0] : "",
        notes: sub.notes || "",
      });
    } else {
      setEditingSub(null);
      resetSubForm();
    }
    setSubDialogOpen(true);
  };

  const handleSaveSubscription = async () => {
    if (!subForm.service.trim() || !subForm.amount) {
      toast.error("Service name and amount are required");
      return;
    }
    const payload: Record<string, unknown> = {
      service: subForm.service,
      amount: parseFloat(subForm.amount) || 0,
      currency: subForm.currency || "GBP",
      exchangeRate: parseFloat(subForm.exchangeRate) || getRateForCurrency(subForm.currency) || 1,
      frequency: subForm.frequency || "MONTHLY",
      status: subForm.status,
      category: subForm.category || undefined,
      projectId: (subForm.projectId && subForm.projectId !== "NONE") ? subForm.projectId : undefined,
      startDate: subForm.startDate || undefined,
      endDate: subForm.endDate || undefined,
      notes: subForm.notes || undefined,
    };
    try {
      const res = editingSub
        ? await fetch(`/api/subscriptions/${editingSub.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          })
        : await fetch("/api/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
      if (res.ok) {
        toast.success(editingSub ? "Subscription updated" : "Subscription added");
        emitFinanceChanged();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to save subscription");
        return;
      }
      setSubDialogOpen(false);
      setEditingSub(null);
      void fetchSubscriptions();
    } catch {
      toast.error("Something went wrong");
    }
  };

  const handleToggleSubscription = async (sub: Subscription) => {
    if (sub.status === "COMPLETED") return;
    const newStatus = sub.status === "ACTIVE" ? "STOPPED" : "ACTIVE";
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Subscription ${newStatus === "ACTIVE" ? "resumed" : "paused"}`);
        emitFinanceChanged();
        void fetchSubscriptions();
      } else {
        toast.error("Failed to update subscription status");
      }
    } catch {
      toast.error("Failed to update subscription");
    }
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/subscriptions/${pendingDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Subscription deleted");
        emitFinanceChanged();
        void fetchSubscriptions();
      } else {
        toast.error("Failed to delete subscription");
      }
    } catch {
      toast.error("Failed to delete subscription");
    } finally {
      setPendingDelete(null);
    }
  };

  const sortedSubscriptions = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
      return String(a.service || "").localeCompare(String(b.service || ""));
    });
  }, [subscriptions]);

  if (status === "loading") {
    return (
      <div className="space-y-4 max-w-6xl">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Subscriptions"
        description="Track recurring software, hosting and service costs"
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void fetchSubscriptions(); void loadRates(); }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => openSubDialog(null)}>
            <Plus className="h-4 w-4 mr-1" /> Add Subscription
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label className="text-xs mb-1 block">Search Subscriptions</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by service, category, project, notes..."
                  className="pl-8"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  aria-label="Search subscriptions"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Subscription start date filter" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Subscription end date filter" />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSubSearch(""); setStartDate(""); setEndDate(""); }}
              >
                Clear All Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {subscriptions.filter((s) => s.status === "ACTIVE").length} active of {subscriptions.length} shown
          {(subSearchDebounced || startDate || endDate) && <span className="ml-1 text-xs">(filtered)</span>}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {subLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : sortedSubscriptions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>{(subSearchDebounced || startDate || endDate) ? "No subscriptions match your filters" : "No subscriptions yet"}</p>
              <p className="text-xs mt-1">
                {(subSearchDebounced || startDate || endDate)
                  ? "Try different keywords or clear the date filters"
                  : "Add your first recurring subscription to track monthly costs"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Rate (to INR)</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">INR</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSubscriptions.map((sub) => {
                    const monthlyInr = sub.monthlyINR;
                    return (
                      <TableRow key={sub.id} className={`${sub.status !== "ACTIVE" ? "opacity-60" : ""} transition-colors hover:bg-muted/50`}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{safeText(sub.service, "")}</p>
                            {sub.category && (
                              <Badge className={`text-[10px] mr-1 ${CATEGORY_BADGE_COLORS[sub.category] || ""}`}>
                                {safeText(sub.category, "").replace("_", " ")}
                              </Badge>
                            )}
                            {sub.project && <p className="text-xs text-muted-foreground mt-0.5">{safeText(sub.project.name, "")}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{formatCurrency(safeNumber(sub.amount), sub.currency || "GBP")}</span>
                          <span className="text-[10px] text-muted-foreground block">{sub.currency}</span>
                        </TableCell>
                        <TableCell className="text-sm hidden sm:table-cell">
                          <span className="font-medium">1 {sub.currency} = ₹{(sub.exchangeRate || liveRates[sub.currency || "GBP"] || DEFAULT_EXCHANGE_RATES[sub.currency || "GBP"] || 1).toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${SUB_FREQUENCY_COLORS[sub.frequency] || ""}`}>
                            {safeText(sub.frequency, "")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <SubscriptionExpiryBadge endDate={sub.endDate} status={sub.status} startDate={sub.startDate} frequency={sub.frequency} />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">{formatCurrency(safeNumber(monthlyInr))}</span>
                          {sub.frequency !== "ONE_TIME" && <span className="text-[10px] text-muted-foreground block">/mo</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSubDialog(sub)} aria-label="Edit subscription">
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void handleToggleSubscription(sub)}
                              title={sub.status === "ACTIVE" ? "Pause" : "Resume"}
                              aria-label={sub.status === "ACTIVE" ? "Pause subscription" : "Resume subscription"}
                            >
                              {sub.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500"
                              onClick={() => setPendingDelete(sub.id)}
                              aria-label="Delete subscription"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SubscriptionExpiryChecker subscriptions={subscriptions} />
      {subscriptions.length > 0 && (
        <Card className="liquid-glass-card border-border border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Total Active Monthly Cost</p>
                <p className="text-xs text-muted-foreground">
                  Based on {subscriptions.filter((s) => s.status === "ACTIVE").length} active subscriptions
                </p>
              </div>
              <p className="text-xl font-bold tracking-tight">
                {formatCurrency(safeNumber(subTotalMonthly))}<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={(open) => { setSubDialogOpen(open); if (!open) setEditingSub(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[92dvh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
            <DialogTitle>{editingSub ? "Edit Subscription" : "Add Subscription"}</DialogTitle>
            <DialogDescription>Track a recurring or one-time service cost.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 px-5 pb-5">
            <div className="space-y-1">
              <Label className="text-xs">Service Name *</Label>
              <Input
                value={subForm.service}
                onChange={(e) => setSubForm((f) => ({ ...f, service: e.target.value }))}
                placeholder="e.g., ChatGPT Subscription"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount *</Label>
                <Input type="number" step="0.01" value={subForm.amount} onChange={(e) => setSubForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g., 10" />
                <p className="text-[9px] text-muted-foreground mt-0.5">Actual cost in selected currency</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={subForm.currency} onValueChange={(v) => setSubForm((f) => ({ ...f, currency: v, exchangeRate: String(getRateForCurrency(v)) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR ₹</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                    <SelectItem value="GBP">GBP £</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate (to INR)</Label>
                <Input type="number" step="0.01" value={subForm.exchangeRate} onChange={(e) => setSubForm((f) => ({ ...f, exchangeRate: e.target.value }))} placeholder="1" />
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  1 {subForm.currency} = ₹{parseFloat(subForm.exchangeRate) || getRateForCurrency(subForm.currency)}
                  {subForm.currency !== "INR" && (
                    <button
                      type="button"
                      className="ml-1 text-primary underline hover:no-underline"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/exchange-rates", { credentials: "include" });
                          if (res.ok) {
                            const data = await res.json();
                            if (data?.rates?.[subForm.currency]) {
                              setLiveRates(data.rates);
                              setSubForm((f) => ({ ...f, exchangeRate: String(data.rates[f.currency]) }));
                              return;
                            }
                          }
                        } catch { /* fallback */ }
                        setSubForm((f) => ({ ...f, exchangeRate: String(getRateForCurrency(f.currency)) }));
                      }}
                    >
                      {ratesLoaded ? "Reset to Today's Rate" : "Reset"}
                    </button>
                  )}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={subForm.status} onValueChange={(v) => setSubForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="STOPPED">Stopped</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frequency</Label>
                <Select value={subForm.frequency} onValueChange={(v) => setSubForm((f) => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="YEARLY">Yearly</SelectItem>
                    <SelectItem value="ONE_TIME">One Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={subForm.category} onValueChange={(v) => setSubForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOFTWARE">Software</SelectItem>
                    <SelectItem value="HOSTING">Hosting</SelectItem>
                    <SelectItem value="DOMAINS">Domains</SelectItem>
                    <SelectItem value="API_COSTS">API Costs</SelectItem>
                    <SelectItem value="TOOLS">Tools</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="SALARY">Salary</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={subForm.projectId} onValueChange={(v) => setSubForm((f) => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={subForm.startDate} onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={subForm.endDate} onChange={(e) => setSubForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={subForm.notes} onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => { setSubDialogOpen(false); setEditingSub(null); }}>Cancel</Button>
              <Button type="button" onClick={() => void handleSaveSubscription()}>{editingSub ? "Update" : "Add"} Subscription</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subscription?</AlertDialogTitle>
            <AlertDialogDescription>This subscription will be permanently deleted. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeDelete()} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
