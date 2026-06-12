"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bird, Link2, Unlink, UserCheck, Loader2, Zap,
  CheckCircle2, XCircle, AlertCircle, Search, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface LarkUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  larkMapped: boolean;
  larkOpenId: string | null;
  larkName: string | null;
  larkEmail: string | null;
  matchedBy: string | null;
  autoMatchAvailable: boolean;
}

export default function LarkUserMappingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<LarkUser[]>([]);
  const [totalLarkUsers, setTotalLarkUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autoMatching, setAutoMatching] = useState(false);
  const [search, setSearch] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/lark/users", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalLarkUsers(data.totalLarkUsers || 0);
        if (data.larkError) {
          setSyncResult(data.larkError);
          setTimeout(() => setSyncResult(null), 10000);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user?.role || "")) {
      router.push("/dashboard");
      return;
    }
    fetchUsers();
  }, [session, status, router, fetchUsers]);

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const res = await fetch("/api/lark/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ autoMatch: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setSyncResult(`Auto-matched ${data.matched} users out of ${data.total}`);
        await fetchUsers();
      }
    } catch {
      // silent
    } finally {
      setAutoMatching(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const handleUnmap = async (userId: string) => {
    try {
      await fetch(`/api/lark/users?userId=${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchUsers();
    } catch {
      // silent
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const mappedCount = users.filter((u) => u.larkMapped).length;
  const unmatchedWithAuto = users.filter((u) => !u.larkMapped && u.autoMatchAvailable).length;

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/access-hub")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Bird className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Lark User Mapping</h1>
            <p className="text-xs text-muted-foreground">Map TrishulHub users to Lark users for task assignment sync</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleAutoMatch}
            disabled={autoMatching || unmatchedWithAuto === 0}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
          >
            {autoMatching ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Zap className="h-3 w-3 mr-1.5" />}
            Auto-Match{unmatchedWithAuto > 0 ? ` (${unmatchedWithAuto})` : ""}
          </Button>
        </div>
      </div>

      {syncResult && (
        <div className={cn(
          "flex items-center gap-2 p-3 rounded-lg text-sm",
          syncResult.includes("scope") || syncResult.includes("contact:")
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
        )}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          {syncResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl">
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">TrishulHub Users</p>
            <p className="text-xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl">
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Lark Users Found</p>
            <p className="text-xl font-bold">{totalLarkUsers}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl">
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Mapped</p>
            <p className="text-xl font-bold text-emerald-600">{mappedCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl">
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Unmapped</p>
            <p className="text-xl font-bold text-amber-600">{users.length - mappedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* User List */}
      <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Mappings
          </CardTitle>
          <CardDescription className="text-[11px]">
            Users are matched by email. Use Auto-Match to link users with the same email in both systems.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No users found
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {user.name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <Badge variant="secondary" className="text-[10px] h-4">{user.role.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user.larkMapped ? (
                    <>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10">
                        <Link2 className="h-3 w-3 text-emerald-600" />
                        <div className="text-right">
                          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{user.larkName}</p>
                          <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">{user.matchedBy === "email_auto" ? "Email" : user.matchedBy === "name_auto" ? "Name" : "Manual"}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => handleUnmap(user.id)}
                        title="Unmap"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : user.autoMatchAvailable ? (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                      <Zap className="h-2.5 w-2.5 mr-1" />
                      {user.matchMethod === "name_auto" ? "Name match" : "Can auto-match"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                      <XCircle className="h-2.5 w-2.5 mr-1" />
                      No match
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}