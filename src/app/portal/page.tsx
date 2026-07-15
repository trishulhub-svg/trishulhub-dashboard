"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FolderKanban, FileText, HeadphonesIcon, DollarSign, AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapResponse } from "@/lib/api-helpers";
import { safeText } from "@/lib/utils";

export default function PortalDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [stats, setStats] = useState({ projects: 0, invoices: 0, tickets: 0, pendingAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, invRes, ticketRes] = await Promise.all([
        fetch("/api/projects?page=1&limit=20", { credentials: 'include' }),
        fetch("/api/invoices?page=1&limit=20", { credentials: 'include' }),
        fetch("/api/support?page=1&limit=20", { credentials: 'include' }),
      ]);
      const projRaw = projRes.ok ? await projRes.json() : [];
      const invRaw = invRes.ok ? await invRes.json() : [];
      const ticketRaw = ticketRes.ok ? await ticketRes.json() : [];

      const projects = unwrapResponse(projRaw);
      const invoices = unwrapResponse(invRaw);
      const tickets = unwrapResponse(ticketRaw);

      const pending = (invoices as { status: string; total: number }[])
        .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
        .reduce((sum, i) => sum + i.total, 0);

      setStats({
        projects: projects.length,
        invoices: invoices.length,
        tickets: tickets.length,
        pendingAmount: pending,
      });
    } catch (err) {
      console.error("[portal/dashboard] Failed to load data:", err);
      setError("Failed to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCardKeyDown = (e: React.KeyboardEvent, path: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(path);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
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

  const firstName = safeText(session?.user?.name, "there").split(/\s+/)[0] || "there";
  const nextAction =
    stats.pendingAmount > 0
      ? { label: "Review pending invoices", path: "/portal/invoices", hint: `₹${stats.pendingAmount.toLocaleString("en-IN")} awaiting payment` }
      : stats.tickets > 0
        ? { label: "Check support tickets", path: "/portal/support", hint: `${stats.tickets} ticket${stats.tickets === 1 ? "" : "s"} on file` }
        : stats.projects > 0
          ? { label: "View your projects", path: "/portal/projects", hint: `${stats.projects} project${stats.projects === 1 ? "" : "s"} in progress` }
          : { label: "Explore your portal", path: "/portal/projects", hint: "Projects, invoices, and support in one place" };

  return (
    <div className="th-page-enter space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0 border-l-[2.5px] border-primary pl-3">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Welcome, {firstName}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 leading-relaxed">
            Your projects, invoices, and support — ready when you are.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => router.push(nextAction.path)}>
          {nextAction.label}
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <Card className="liquid-glass-card border-border">
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Next step</p>
            <p className="text-sm font-medium mt-0.5">{nextAction.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{nextAction.hint}</p>
          </div>
          <Button size="sm" onClick={() => router.push(nextAction.path)}>
            Continue <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow liquid-glass-card border-border"
          tabIndex={0}
          role="button"
          onClick={() => router.push("/portal/projects")}
          onKeyDown={(e) => handleCardKeyDown(e, "/portal/projects")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="th-stat-icon">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-2xl font-bold tracking-tight">{stats.projects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow liquid-glass-card border-border"
          tabIndex={0}
          role="button"
          onClick={() => router.push("/portal/invoices")}
          onKeyDown={(e) => handleCardKeyDown(e, "/portal/invoices")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="th-stat-icon">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="text-2xl font-bold tracking-tight">₹{stats.pendingAmount.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow liquid-glass-card border-border"
          tabIndex={0}
          role="button"
          onClick={() => router.push("/portal/invoices")}
          onKeyDown={(e) => handleCardKeyDown(e, "/portal/invoices")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="th-stat-icon">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Invoices</p>
                <p className="text-2xl font-bold tracking-tight">{stats.invoices}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow liquid-glass-card border-border"
          tabIndex={0}
          role="button"
          onClick={() => router.push("/portal/support")}
          onKeyDown={(e) => handleCardKeyDown(e, "/portal/support")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="th-stat-icon">
                <HeadphonesIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Support Tickets</p>
                <p className="text-2xl font-bold tracking-tight">{stats.tickets}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="liquid-glass-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => router.push("/portal/projects")}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
          >
            <div className="th-stat-icon shrink-0">
              <FolderKanban className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Projects</p>
              <p className="text-xs text-muted-foreground">{stats.projects} total</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => router.push("/portal/invoices")}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
          >
            <div className="th-stat-icon shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Invoices</p>
              <p className="text-xs text-muted-foreground">{stats.invoices} on file</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => router.push("/portal/support")}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
          >
            <div className="th-stat-icon shrink-0">
              <HeadphonesIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Support</p>
              <p className="text-xs text-muted-foreground">{stats.tickets} ticket{stats.tickets === 1 ? "" : "s"}</p>
            </div>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
