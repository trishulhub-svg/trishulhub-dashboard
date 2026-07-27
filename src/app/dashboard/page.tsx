"use client";

import { useEffect, useState, useCallback, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Rocket, DollarSign, FolderKanban, TrendingUp, AlertCircle,
  Clock, ArrowRight, Plus, Send, IndianRupee, Wallet, ChevronDown,
  Ticket, Users, CalendarDays, Star, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, safeArray, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";
import { toast } from "sonner";

type UserRole = "SUPER_ADMIN" | "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER" | string;

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  progress: number;
  deadline: string | null;
  client?: { name?: string } | null;
  _count?: { members?: number };
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate?: string | null;
  client?: { name?: string } | null;
};

type EarningsData = {
  totalINR: number;
  totalGBP: number;
  entries: Array<{ id: string; description: string; amount: number; date: string; paymentRef: string | null }>;
};

type DashboardStats = {
  totalRevenue: number;
  pendingAmount: number;
  overdueAmount: number;
  newLeadsCount: number;
  activeProjects: number;
  atRiskProjects: number;
  openTickets: number;
  totalClients: number;
  totalLeads: number;
  teamMembers: number;
};

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-info/15 text-info",
  PAID: "bg-success/15 text-success",
  OVERDUE: "bg-destructive/15 text-destructive",
};

const CLOSED_STATUSES = new Set(["COMPLETED", "DEPLOYED"]);

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Shorter for tight mobile tiles (ponytail: avoid layout overlap). */
function formatCompactInr(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 1)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1)}L`;
  return formatCurrency(n);
}

function isProjectAtRisk(project: ProjectRow): boolean {
  if (CLOSED_STATUSES.has(safeText(project.status, ""))) return false;
  const deadline = project.deadline ? new Date(project.deadline) : null;
  if (!deadline || Number.isNaN(deadline.getTime())) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return deadline.getTime() <= endOfToday.getTime();
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function roleSubtitle(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "Command center — projects, pipeline, and cash flow.";
    case "PROJECT_MANAGER":
      return "Delivery focus — keep projects moving and the team unblocked.";
    case "DEVELOPER":
      return "Work focus — track time, ship progress, stay on your projects.";
    default:
      return "Here's your workspace overview for today.";
  }
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  accent?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-card/40 p-3 text-left transition-colors sm:p-4",
        onClick && "cursor-pointer hover:bg-muted/40",
        accent && "border-destructive/40 bg-destructive/[0.04]"
      )}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p>
          <p
            className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl"
            title={String(value)}
          >
            {value}
          </p>
          {hint ? (
            <div className="mt-1.5 break-words text-[11px] leading-snug text-muted-foreground">{hint}</div>
          ) : null}
        </div>
        <div className={cn("th-stat-icon shrink-0", accent && "bg-destructive/10 text-destructive")}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Comp>
  );
}

function SectionShell({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card/30", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-4">
        <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-w-0 p-3 sm:p-4">{children}</div>
    </section>
  );
}

function ProjectList({
  projects,
  emptyLabel,
  showMembers,
  onOpen,
}: {
  projects: ProjectRow[];
  emptyLabel: string;
  showMembers?: boolean;
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="th-stat-icon">
          <FolderKanban className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground max-w-xs">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
      {projects.map((project) => {
        const progress = safeNumber(project.progress);
        const atRisk = isProjectAtRisk(project);
        const clientName = project.client ? safeText(project.client.name, "") : "";
        const members = safeNumber(project._count?.members);
        return (
          <button
            key={safeText(project.id, "")}
            type="button"
            onClick={() => onOpen(safeText(project.id, ""))}
            className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/50"
          >
            <div className={cn("th-stat-icon shrink-0 !h-8 !w-8", atRisk && "bg-destructive/10 text-destructive")}>
              <FolderKanban className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{safeText(project.name, "Untitled")}</p>
                {atRisk && (
                  <Badge variant="outline" className="shrink-0 border-destructive/40 text-[10px] text-destructive">
                    At risk
                  </Badge>
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {clientName || safeText(project.status, "").replace(/_/g, " ")}
                {showMembers && members > 0 ? ` · ${members} members` : ""}
                {project.deadline ? ` · due ${safeDate(project.deadline)}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium tabular-nums">{progress}%</p>
              <Progress value={progress} className="mt-1 h-1.5 w-14" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CompactEarnings({
  earnings,
  showEarningsDetail,
  setShowEarningsDetail,
}: {
  earnings: EarningsData;
  showEarningsDetail: boolean;
  setShowEarningsDetail: (v: boolean) => void;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="th-stat-icon !h-8 !w-8 shrink-0">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">My earnings</p>
            <p className="text-sm font-semibold tabular-nums">
              ₹{earnings.totalINR.toLocaleString("en-IN")}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                ≈ £{earnings.totalGBP.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEarningsDetail(!showEarningsDetail)}
          className="h-7 shrink-0 text-xs gap-1"
        >
          {showEarningsDetail ? "Hide" : "Details"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", showEarningsDetail && "rotate-180")} />
        </Button>
      </div>
      {showEarningsDetail && earnings.entries.length > 0 && (
        <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
          {earnings.entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-xs">{safeText(entry.description, "Salary")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {safeDate(entry.date)}
                  {entry.paymentRef ? ` · ${safeText(entry.paymentRef, "")}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-xs font-semibold tabular-nums">
                ₹{safeNumber(entry.amount).toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type FavPage = { title: string; href: string };

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [showEarningsDetail, setShowEarningsDetail] = useState(false);
  const [weekHours, setWeekHours] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [allowedFavPages, setAllowedFavPages] = useState<FavPage[]>([]);
  const [favPickerSlot, setFavPickerSlot] = useState<0 | 1 | null>(null);
  const [favSaving, setFavSaving] = useState(false);

  const userRole: UserRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const isPm = userRole === "PROJECT_MANAGER";
  const isDeveloper = userRole === "DEVELOPER";
  const isAuthenticated = sessionStatus === "authenticated";

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/user-favorites", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      setFavorites(Array.isArray(json.favorites) ? json.favorites.slice(0, 2) : []);
      setAllowedFavPages(Array.isArray(json.allowedPages) ? json.allowedPages : []);
    } catch {
      /* non-blocking */
    }
  }, []);

  const saveFavorites = useCallback(
    async (next: string[]) => {
      setFavSaving(true);
      try {
        const res = await fetch("/api/user-favorites", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: next.slice(0, 2) }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          toast.error(d?.error || "Could not save favorites");
          return;
        }
        const json = await res.json();
        setFavorites(Array.isArray(json.favorites) ? json.favorites.slice(0, 2) : next.slice(0, 2));
        setFavPickerSlot(null);
        toast.success("Favorites saved");
      } catch {
        toast.error("Could not save favorites");
      } finally {
        setFavSaving(false);
      }
    },
    []
  );

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/bootstrap/home", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json.dashboard) {
          setData(deepSanitize<Record<string, unknown>>(json.dashboard));
        }
        if (json.earnings) setEarnings(json.earnings);
        if (typeof json.weekHours === "number") setWeekHours(safeNumber(json.weekHours));
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // One bootstrap: dashboard + earnings + week hours (developers) — single auth check.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/bootstrap/home", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.dashboard) {
            setData(deepSanitize<Record<string, unknown>>(json.dashboard));
          }
          if (!cancelled && json.earnings) setEarnings(json.earnings);
          if (!cancelled && typeof json.weekHours === "number") {
            setWeekHours(safeNumber(json.weekHours));
          }
        } else if (!cancelled) {
          setError(true);
        }
      } catch (err) {
        console.error("Dashboard bootstrap error:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loadFavorites]);

  // Only block on session while it's still resolving — once authenticated, wait on data only.
  const waitingOnSession = sessionStatus === "loading" && !isAuthenticated;
  if (waitingOnSession || loading || (!data && !error)) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary"
          style={{ animationDuration: "0.6s" }}
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-4" style={{ animation: "fade-in 0.2s ease-out both" }}>
        <div className="rounded-xl border border-destructive/40 bg-destructive/[0.04] p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-7 w-7 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load dashboard data</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setError(false);
              setLoading(true);
              void fetchDashboard();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const rawStats = (data.stats || {}) as Record<string, unknown>;
  const stats: DashboardStats = {
    totalRevenue: safeNumber(rawStats.totalRevenue),
    pendingAmount: safeNumber(rawStats.pendingAmount),
    overdueAmount: safeNumber(rawStats.overdueAmount),
    newLeadsCount: safeNumber(rawStats.newLeadsCount),
    activeProjects: safeNumber(rawStats.activeProjects),
    atRiskProjects: safeNumber(rawStats.atRiskProjects),
    openTickets: safeNumber(rawStats.openTickets),
    totalClients: safeNumber(rawStats.totalClients),
    totalLeads: safeNumber(rawStats.totalLeads),
    teamMembers: safeNumber(rawStats.teamMembers),
  };

  const projects = safeArray<ProjectRow>(data.projects);
  const invoices = safeArray<InvoiceRow>(data.invoices);
  const activeProjectRows = projects.filter((p) => !CLOSED_STATUSES.has(safeText(p.status, "")));

  const firstName = safeText(session?.user?.name, "there").split(/\s+/)[0] || "there";
  const greeting = greetingForHour(new Date().getHours());

  const openProject = (id: string) => {
    if (id) router.push(`/dashboard/projects/${id}`);
  };

  return (
    <div
      className="w-full max-w-full space-y-5 overflow-x-hidden sm:space-y-6"
      style={{ animation: "fade-in 0.2s ease-out both" }}
    >
      {/* Welcome band */}
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 border-l-[2.5px] border-primary pl-3">
          <h1 className="break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {greeting}, {firstName}
          </h1>
          <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {roleSubtitle(userRole)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {isAdminUser && (
            <Button size="sm" onClick={() => router.push("/dashboard/projects")}>
              <Plus className="mr-1 h-4 w-4" /> New Project
            </Button>
          )}
          {(isAdminUser || isPm || isDeveloper) && (
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/workspace")}>
              <Rocket className="mr-1 h-4 w-4" /> Open Workspace
            </Button>
          )}
          {isAdminUser && (
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
              <Send className="mr-1 h-4 w-4" /> Send Invoice
            </Button>
          )}
        </div>
      </header>

      {/* Favorite pages — up to 2 role-allowed shortcuts */}
      <section className="rounded-xl border border-border/70 bg-card/30 px-3 py-3 sm:px-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold tracking-tight">Favorite pages</h2>
          </div>
          <p className="text-[10px] text-muted-foreground">Up to 2 · synced to your account</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((slot) => {
            const href = favorites[slot];
            const page = href
              ? allowedFavPages.find((p) => p.href === href) || { title: href.replace("/dashboard/", ""), href }
              : null;
            if (page) {
              return (
                <div
                  key={slot}
                  className="group relative flex min-h-[3.25rem] items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => router.push(page.href)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium">{page.title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{page.href}</p>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove favorite"
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100"
                    onClick={() => {
                      const next = favorites.filter((_, i) => i !== slot);
                      void saveFavorites(next);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }
            return (
              <button
                key={slot}
                type="button"
                onClick={() => setFavPickerSlot(slot as 0 | 1)}
                className="flex min-h-[3.25rem] items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs font-medium">Add page</span>
              </button>
            );
          })}
        </div>
      </section>

      <Dialog open={favPickerSlot !== null} onOpenChange={(o) => !o && setFavPickerSlot(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Choose a favorite page</DialogTitle>
            <DialogDescription className="text-xs">
              Only pages you are allowed to open are listed. Max 2 favorites.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto custom-scrollbar pr-1">
            {allowedFavPages.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No pages available for your role.</p>
            ) : (
              allowedFavPages.map((p) => {
                const already = favorites.includes(p.href);
                return (
                  <button
                    key={p.href}
                    type="button"
                    disabled={already || favSaving}
                    onClick={() => {
                      if (favPickerSlot === null) return;
                      const next = [...favorites];
                      next[favPickerSlot] = p.href;
                      void saveFavorites(next.filter(Boolean).slice(0, 2));
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      already
                        ? "cursor-not-allowed opacity-40"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className="text-[10px] text-muted-foreground">{already ? "Already added" : p.href}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ADMIN / SUPER_ADMIN ── */}
      {isAdminUser && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Active Projects"
              value={stats.activeProjects}
              hint={
                stats.totalClients > 0
                  ? `${stats.totalClients} clients`
                  : stats.atRiskProjects > 0
                    ? `${stats.atRiskProjects} at risk`
                    : "Across workspace"
              }
              icon={FolderKanban}
              onClick={() => router.push("/dashboard/projects")}
            />
            <StatTile
              label="New Leads"
              value={stats.newLeadsCount}
              hint={`${stats.totalLeads} total leads`}
              icon={TrendingUp}
              onClick={() => router.push("/dashboard/crm")}
            />
            <StatTile
              label="Revenue"
              value={formatCompactInr(stats.totalRevenue)}
              hint={
                <span className="flex flex-col gap-0.5">
                  <span className="truncate">Pending {formatCompactInr(stats.pendingAmount)}</span>
                  {stats.overdueAmount > 0 && (
                    <span className="truncate text-destructive">
                      Overdue {formatCompactInr(stats.overdueAmount)}
                    </span>
                  )}
                </span>
              }
              icon={DollarSign}
              onClick={() => router.push("/dashboard/finance")}
            />
            <StatTile
              label="Open Tickets"
              value={stats.openTickets}
              hint="Support queue"
              icon={Ticket}
              accent={stats.openTickets > 0}
            />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SectionShell
              title="Active & at-risk projects"
              action={
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/dashboard/projects")}>
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              }
            >
              <ProjectList
                projects={activeProjectRows.length ? activeProjectRows : projects}
                emptyLabel="No active projects"
                showMembers
                onOpen={openProject}
              />
              {stats.atRiskProjects > 0 && (
                <p className="mt-2 text-[11px] text-destructive">
                  {stats.atRiskProjects} project{stats.atRiskProjects === 1 ? "" : "s"} past deadline
                </p>
              )}
            </SectionShell>

            <SectionShell
              title="Recent invoices"
              action={
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/dashboard/finance/invoices")}>
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              }
            >
              {invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <div className="th-stat-icon">
                    <IndianRupee className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                  <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
                    <Send className="mr-1 h-4 w-4" /> Create invoice
                  </Button>
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                  {invoices.slice(0, 5).map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => router.push("/dashboard/finance/invoices")}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/50 sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{safeText(inv.invoiceNumber, "")}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {inv.client ? safeText(inv.client.name, "") : ""}
                          {inv.dueDate ? ` · due ${safeDate(inv.dueDate)}` : ""}
                        </p>
                      </div>
                      <div className="flex min-w-0 shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <span className="max-w-[7.5rem] truncate text-sm font-medium tabular-nums sm:max-w-none" title={formatCurrency(safeNumber(inv.total))}>
                          {formatCurrency(safeNumber(inv.total))}
                        </span>
                        <Badge className={cn("max-w-full truncate text-[10px]", invoiceStatusColors[inv.status] || "")}>
                          {safeText(inv.status, "")}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionShell>
          </div>

          {earnings && (
            <CompactEarnings
              earnings={earnings}
              showEarningsDetail={showEarningsDetail}
              setShowEarningsDetail={setShowEarningsDetail}
            />
          )}
        </>
      )}

      {/* ── PROJECT MANAGER ── */}
      {isPm && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Active Projects"
              value={stats.activeProjects}
              hint={stats.atRiskProjects > 0 ? `${stats.atRiskProjects} past deadline` : "Delivery in flight"}
              icon={FolderKanban}
              onClick={() => router.push("/dashboard/projects")}
              accent={stats.atRiskProjects > 0}
            />
            <StatTile
              label="Team seats"
              value={stats.teamMembers}
              hint="Members across projects"
              icon={Users}
              onClick={() => router.push("/dashboard/projects")}
            />
            <StatTile
              label="Projects listed"
              value={projects.length}
              hint="Recent updates"
              icon={TrendingUp}
              onClick={() => router.push("/dashboard/projects")}
            />
          </div>

          <SectionShell
            title="Projects"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/dashboard/projects")}>
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            }
          >
            <ProjectList
              projects={projects}
              emptyLabel="No projects yet. Create one to start delivery."
              showMembers
              onOpen={openProject}
            />
          </SectionShell>

          <SectionShell title="Quick actions">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { href: "/dashboard/workspace", icon: Rocket, title: "Workspace", desc: "Launch delivery workspace" },
                { href: "/dashboard/time-tracking", icon: Clock, title: "Time Tracking", desc: "Review logged hours" },
                { href: "/dashboard/projects", icon: FolderKanban, title: "Projects", desc: "Manage delivery board" },
              ].map((action) => (
                <button
                  key={action.href}
                  type="button"
                  onClick={() => router.push(action.href)}
                  className="flex items-center gap-3 rounded-lg border border-border/70 p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="th-stat-icon shrink-0">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="text-[11px] text-muted-foreground">{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </SectionShell>
        </>
      )}

      {/* ── DEVELOPER ── */}
      {isDeveloper && (
        <>
          <section className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.07] via-card/40 to-transparent p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-primary/80">Today&apos;s work</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Start tracking and ship progress</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {weekHours !== null
                    ? `${weekHours.toFixed(1)} hrs logged this week · keep momentum going.`
                    : "Log time on your assignments and open the AI workspace when you need focus."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button size="sm" onClick={() => router.push("/dashboard/time-tracking?action=start")}>
                  <Clock className="mr-1 h-4 w-4" /> Start timer
                </Button>
                <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/workspace")}>
                  <Rocket className="mr-1 h-4 w-4" /> Open Workspace
                </Button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <StatTile
              label="My projects"
              value={stats.activeProjects}
              hint="Assigned & active"
              icon={FolderKanban}
            />
            <StatTile
              label="This week"
              value={weekHours !== null ? `${weekHours.toFixed(1)}h` : "—"}
              hint="Completed time entries"
              icon={Clock}
              onClick={() => router.push("/dashboard/time-tracking")}
            />
          </div>

          <SectionShell title="My projects">
            <ProjectList
              projects={projects}
              emptyLabel="No projects assigned yet. Contact your admin to get assigned."
              onOpen={openProject}
            />
          </SectionShell>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => router.push("/dashboard/leaves")}
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Request leave
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {earnings && earnings.totalINR > 0 && (
            <CompactEarnings
              earnings={earnings}
              showEarningsDetail={showEarningsDetail}
              setShowEarningsDetail={setShowEarningsDetail}
            />
          )}
        </>
      )}

      {/* Fallback for unexpected roles */}
      {!isAdminUser && !isPm && !isDeveloper && (
        <SectionShell title="Projects">
          <ProjectList
            projects={projects}
            emptyLabel="No projects available."
            onOpen={openProject}
          />
        </SectionShell>
      )}
    </div>
  );
}
