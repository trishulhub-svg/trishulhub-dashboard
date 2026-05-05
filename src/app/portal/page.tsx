"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, FileText, HeadphonesIcon, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ projects: 0, invoices: 0, tickets: 0, pendingAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, invRes, ticketRes] = await Promise.all([
        fetch("/api/projects", { credentials: 'include' }),
        fetch("/api/invoices", { credentials: 'include' }),
        fetch("/api/support", { credentials: 'include' }),
      ]);
      const projects = projRes.ok ? await projRes.json() : [];
      const invoices = invRes.ok ? await invRes.json() : [];
      const tickets = ticketRes.ok ? await ticketRes.json() : [];

      const pending = (invoices as { status: string; total: number }[])
        .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
        .reduce((sum, i) => sum + i.total, 0);

      setStats({
        projects: projects.length,
        invoices: invoices.length,
        tickets: (tickets as unknown[]).length,
        pendingAmount: pending,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Client Portal</h1>
        <p className="text-muted-foreground text-sm">Welcome! View your projects, invoices, and support tickets.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/portal/projects")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-2xl font-bold">{stats.projects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/portal/invoices")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="text-2xl font-bold">₹{stats.pendingAmount.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/portal/invoices")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Invoices</p>
                <p className="text-2xl font-bold">{stats.invoices}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/portal/support")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <HeadphonesIcon className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Support Tickets</p>
                <p className="text-2xl font-bold">{stats.tickets}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
