"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plug, Save, Trash2, Shield, Users, Building2, Lock, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn, safeText } from "@/lib/utils";
import { DesktopOnlyGate } from "@/components/dashboard/files/desktop-only-gate";

type RoleAccess = Record<string, boolean>;
type Dept = { id: string; name: string; isPrivate?: boolean; hasDrive?: boolean };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HR: "HR",
  PROJECT_MANAGER: "Project Manager",
  DEVELOPER: "Developer",
};

export default function FilesSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settingsTab, setSettingsTab] = useState("drive");

  // Drive
  const [mode, setMode] = useState<"SERVICE_ACCOUNT" | "OAUTH">("OAUTH");
  const [impersonateEmail, setImpersonateEmail] = useState("info@trishulhub.in");
  const [rootFolderId, setRootFolderId] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [driveMeta, setDriveMeta] = useState<Record<string, unknown> | null>(null);

  // Access
  const [roleAccess, setRoleAccess] = useState<RoleAccess>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [roleDepartments, setRoleDepartments] = useState<Record<string, string[]>>({});
  const [selectedRole, setSelectedRole] = useState("PROJECT_MANAGER");
  const [savingRoleDepts, setSavingRoleDepts] = useState(false);
  const [teamUsers, setTeamUsers] = useState<Array<{ id: string; name: string; email: string; role?: string }>>([]);
  const [overrideUserId, setOverrideUserId] = useState("");
  const [overrideMode, setOverrideMode] = useState<"ALLOW" | "DENY" | "CLEAR">("ALLOW");
  const [overrides, setOverrides] = useState<Array<Record<string, unknown>>>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [grantDeptId, setGrantDeptId] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [deptGrants, setDeptGrants] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "SUPER_ADMIN") {
      router.replace("/dashboard/files");
    }
  }, [session, status, router]);

  const grantableDepartments = useMemo(
    () => departments.filter((d) => !d.isPrivate),
    [departments]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files/settings", { credentials: "include" });
      if (res.status === 403) {
        router.replace("/dashboard/files");
        return;
      }
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      setDriveMeta(data.drive || null);
      setMode(data.drive?.mode === "SERVICE_ACCOUNT" ? "SERVICE_ACCOUNT" : "OAUTH");
      setImpersonateEmail(data.drive?.impersonateEmail || "info@trishulhub.in");
      setRootFolderId(data.drive?.rootFolderId || "");
      setRoleAccess(data.roleAccess || {});
      const roleList: string[] = Array.isArray(data.roles) ? data.roles : [];
      setRoles(roleList);
      if (roleList.includes("PROJECT_MANAGER")) setSelectedRole("PROJECT_MANAGER");
      else if (roleList.find((r) => r !== "SUPER_ADMIN" && r !== "ADMIN")) {
        setSelectedRole(roleList.find((r) => r !== "SUPER_ADMIN" && r !== "ADMIN") || "DEVELOPER");
      }

      const [ar, tr, rd, dep] = await Promise.all([
        fetch("/api/files/access", { credentials: "include" }),
        fetch("/api/team?type=users", { credentials: "include" }),
        fetch("/api/files/access?roleDepts=1", { credentials: "include" }),
        fetch("/api/files/access?departments=1", { credentials: "include" }),
      ]);
      if (ar.ok) {
        const ad = await ar.json();
        setOverrides(Array.isArray(ad.overrides) ? ad.overrides : []);
      }
      if (tr.ok) {
        const td = await tr.json();
        const arr = Array.isArray(td) ? td : td?.data || [];
        setTeamUsers(
          arr
            .filter((u: { id?: string; email?: string }) => u?.id && u?.email)
            .map((u: { id: string; name?: string; email: string; role?: string }) => ({
              id: u.id,
              name: u.name || u.email,
              email: u.email,
              role: u.role,
            }))
        );
      }
      if (rd.ok) {
        const rdd = await rd.json();
        setRoleDepartments(rdd.roleDepartments || {});
      }
      if (dep.ok) {
        const dd = await dep.json();
        setDepartments(Array.isArray(dd.departments) ? dd.departments : []);
      } else {
        // Fallback: nodes API (non-private only)
        const dr = await fetch("/api/files/nodes", { credentials: "include" });
        if (dr.ok) {
          const dd = await dr.json();
          const nodes = Array.isArray(dd.nodes) ? dd.nodes : [];
          setDepartments(
            nodes
              .filter((n: { kind?: string; id?: string }) => n.kind === "DEPARTMENT" && n.id)
              .map((n: { id: string; name: string; isPrivate?: boolean | number }) => ({
                id: n.id,
                name: n.name,
                isPrivate: n.isPrivate === true || n.isPrivate === 1,
              }))
          );
        }
      }
    } catch {
      toast.error("Failed to load file settings");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadDeptGrants = useCallback(async (nodeId: string) => {
    if (!nodeId) {
      setDeptGrants([]);
      return;
    }
    const res = await fetch(`/api/files/access?nodeId=${encodeURIComponent(nodeId)}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    setDeptGrants(Array.isArray(data.grants) ? data.grants : []);
  }, []);

  useEffect(() => {
    void loadDeptGrants(grantDeptId);
  }, [grantDeptId, loadDeptGrants]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDrive = async () => {
    if (mode === "OAUTH") {
      const cid = oauthClientId.trim();
      if (cid) {
        if (cid.includes("@") || !/\.apps\.googleusercontent\.com$/i.test(cid)) {
          toast.error(
            "Client ID must end with .apps.googleusercontent.com — do not paste your email (browser autofill often fills this wrong)."
          );
          return;
        }
      }
      const rotating = Boolean(cid || oauthClientSecret.trim() || refreshToken.trim());
      if (rotating || !driveMeta?.connected) {
        if (!cid || !oauthClientSecret.trim() || !refreshToken.trim()) {
          toast.error(
            "Paste Client ID + Client Secret + NEW Refresh token together (all three from the same Google OAuth client)."
          );
          return;
        }
      }
    } else if (!serviceAccountJson.trim() && !driveMeta?.hasServiceAccountJson) {
      toast.error("Paste service account JSON, or switch to OAuth mode");
      return;
    }

    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        mode,
        impersonateEmail,
        rootFolderId: rootFolderId || null,
        serviceAccountJson: mode === "SERVICE_ACCOUNT" ? serviceAccountJson || null : null,
        oauthClientId: mode === "OAUTH" ? oauthClientId || null : null,
        oauthClientSecret: mode === "OAUTH" ? oauthClientSecret || null : null,
        refreshToken: mode === "OAUTH" ? refreshToken || null : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Save failed");
      return;
    }
    toast.success(
      data.drive?.connected
        ? "Drive connection saved — click Test connection"
        : "Saved (complete missing OAuth fields if status is still disconnected)"
    );
    setServiceAccountJson("");
    setOauthClientId("");
    setOauthClientSecret("");
    setRefreshToken("");
    setDriveMeta(data.drive || null);
  };

  const testDrive = async () => {
    if (!driveMeta?.connected) {
      toast.error("Save OAuth (or service account) credentials first, then Test.");
      return;
    }
    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      toast.success(`Connected as ${data.email || "Drive"}`);
      if (data.rootFolderUrl) {
        toast.message('Look under Drive folder “Trishulhub Files”', {
          action: {
            label: "Open root",
            onClick: () => window.open(String(data.rootFolderUrl), "_blank", "noopener,noreferrer"),
          },
        });
      }
    } else toast.error(data.error || "Connection failed");
    void load();
  };

  const repairDrive = async () => {
    if (!driveMeta?.connected) {
      toast.error("Connect Drive first, then Repair.");
      return;
    }
    if (
      !confirm(
        "Repair will recreate any missing Drive folders so Trishulhub paths match Google Drive under “Trishulhub Files”. Continue?"
      )
    ) {
      return;
    }
    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repair" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Repair failed");
      return;
    }
    toast.success(
      `Drive folders checked ${data.checked || 0} · repaired ${data.repaired || 0}${
        data.failed ? ` · failed ${data.failed}` : ""
      }`
    );
    if (data.rootFolderUrl) {
      window.open(String(data.rootFolderUrl), "_blank", "noopener,noreferrer");
    }
    void load();
  };

  const deleteDrive = async () => {
    if (!confirm("Remove saved Drive credentials?")) return;
    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Drive credentials removed");
    void load();
  };

  const saveRoles = async () => {
    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "roles", roleAccess }),
    });
    if (!res.ok) {
      toast.error("Failed to save role module access");
      return;
    }
    toast.success("Role module access saved");
  };

  const toggleRoleDept = (deptId: string) => {
    setRoleDepartments((prev) => {
      const current = new Set(prev[selectedRole] || []);
      if (current.has(deptId)) current.delete(deptId);
      else current.add(deptId);
      return { ...prev, [selectedRole]: [...current] };
    });
  };

  const saveRoleDepartments = async () => {
    setSavingRoleDepts(true);
    try {
      const res = await fetch("/api/files/access", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ROLE_DEPARTMENTS",
          role: selectedRole,
          nodeIds: roleDepartments[selectedRole] || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save role departments");
        return;
      }
      toast.success(
        `${ROLE_LABELS[selectedRole] || selectedRole}: departments saved (+${data.added || 0}/-${data.removed || 0}) · Drive synced for current users`
      );
      if (Array.isArray(data.driveWarnings) && data.driveWarnings.length) {
        toast.warning(String(data.driveWarnings[0]));
      }
      void load();
    } finally {
      setSavingRoleDepts(false);
    }
  };

  const saveOverride = async () => {
    if (!overrideUserId) return;
    const res = await fetch("/api/files/access", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "USER_MODULE",
        userId: overrideUserId,
        mode: overrideMode,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to save custom access");
      return;
    }
    toast.success("Custom access updated");
    void load();
  };

  const grantDepartmentUser = async () => {
    if (!grantDeptId || !grantUserId) return;
    const res = await fetch("/api/files/access", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "NODE_USER",
        nodeId: grantDeptId,
        userId: grantUserId,
        canRead: true,
        canWrite: true,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error || "Failed to grant department access");
      return;
    }
    if (d.warning) {
      toast.warning(`Granted in Trishulhub. Drive: ${d.warning}`);
    } else {
      toast.success("Department access granted in Trishulhub + Google Drive");
    }
    void loadDeptGrants(grantDeptId);
  };

  const removeDeptGrant = async (removeId: string) => {
    if (!grantDeptId) return;
    const grant = deptGrants.find((g) => String(g.id) === removeId);
    const res = await fetch("/api/files/access", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: grant?.scope === "NODE_ROLE" ? "NODE_ROLE" : "NODE_USER",
        nodeId: grantDeptId,
        removeId,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to remove grant");
      return;
    }
    toast.success("Grant removed (Drive unshared)");
    void loadDeptGrants(grantDeptId);
  };

  const selectableRoles = roles.filter((r) => r !== "SUPER_ADMIN" && r !== "ADMIN");
  const selectedDeptIds = new Set(roleDepartments[selectedRole] || []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading file settings…</div>;
  }

  return (
    <DesktopOnlyGate>
      <div className="space-y-4 p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/files">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Files settings</h1>
            <p className="text-sm text-muted-foreground">
              Drive connection and access control are separate — manage each independently.
            </p>
          </div>
        </div>

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 h-11">
            <TabsTrigger value="drive" className="gap-1.5 text-sm">
              <Plug className="h-3.5 w-3.5" /> Drive connection
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-1.5 text-sm">
              <Shield className="h-3.5 w-3.5" /> Access control
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ DRIVE TAB ═══════════ */}
          <TabsContent value="drive" className="mt-0">
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Plug className="h-4 w-4 text-teal-600" /> Google Drive connection
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>OAuth works without a service account JSON key</strong> (use this if Google blocks SA keys).
                Authorize once as <strong>info@trishulhub.in</strong>, then paste Client ID, Secret, and Refresh token.
              </p>
              {driveMeta && (
                <p className={cn("text-xs", driveMeta.connected ? "text-emerald-600" : "text-amber-600")}>
                  Status: {driveMeta.connected ? "Connected" : "Not connected"}
                  {driveMeta.mode ? ` · mode ${String(driveMeta.mode)}` : ""}
                  {driveMeta.clientEmail ? ` · SA ${String(driveMeta.clientEmail)}` : ""}
                  {driveMeta.rootFolderId ? ` · root ${String(driveMeta.rootFolderId)}` : ""}
                  {driveMeta.encryptionReady === false ? " · encryption not ready on server" : ""}
                </p>
              )}
              {driveMeta?.encryptionReady === false && (
                <p className="text-xs text-amber-700 dark:text-amber-300 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  Server encryption is not ready. Set <code>ENCRYPTION_KEY</code> (64 hex chars) on Vercel and redeploy,
                  then Save again.
                </p>
              )}

              <div className="flex gap-2">
                {(["OAUTH", "SERVICE_ACCOUNT"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-md border",
                      mode === m ? "bg-teal-600 text-white border-teal-600" : "bg-background"
                    )}
                  >
                    {m === "SERVICE_ACCOUNT" ? "Service account" : "OAuth (no SA key)"}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Impersonate email (Workspace)</Label>
                <Input value={impersonateEmail} onChange={(e) => setImpersonateEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Root folder ID (optional)</Label>
                <Input
                  value={rootFolderId}
                  onChange={(e) => setRootFolderId(e.target.value)}
                  placeholder="Leave blank to auto-create Trishulhub Files"
                />
              </div>

              {mode === "SERVICE_ACCOUNT" ? (
                <div className="space-y-1">
                  <Label className="text-xs">Service account JSON key</Label>
                  <Textarea
                    rows={6}
                    value={serviceAccountJson}
                    onChange={(e) => setServiceAccountJson(e.target.value)}
                    placeholder={driveMeta?.hasServiceAccountJson ? "(saved — paste to replace)" : "Paste full JSON key"}
                    className="font-mono text-xs"
                  />
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    No service account JSON needed. Create a Web OAuth client in Google Cloud, get a refresh token
                    from OAuth Playground while signed in as <strong>info@trishulhub.in</strong>, paste all three below,
                    Save, then Test.
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs">OAuth Client ID</Label>
                    <Input
                      name="drive-oauth-client-id"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder={
                        driveMeta?.hasOAuthClient
                          ? "(saved — paste to replace)"
                          : "123456789-xxxx.apps.googleusercontent.com"
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">OAuth Client Secret</Label>
                    <Input
                      name="drive-oauth-client-secret"
                      type="password"
                      autoComplete="new-password"
                      value={oauthClientSecret}
                      onChange={(e) => setOauthClientSecret(e.target.value)}
                      placeholder={driveMeta?.hasOAuthClient ? "(saved — paste to replace)" : "GOCSPX-…"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Refresh token</Label>
                    <Input
                      name="drive-oauth-refresh-token"
                      type="password"
                      autoComplete="new-password"
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                      placeholder={driveMeta?.hasRefreshToken ? "(saved — paste to replace)" : "1//…"}
                    />
                  </div>
                </>
              )}

              {typeof driveMeta?.rootFolderUrl === "string" && driveMeta.rootFolderUrl && (
                <p className="text-xs text-muted-foreground">
                  All Files content mirrors under{" "}
                  <a
                    href={String(driveMeta.rootFolderUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 dark:text-teal-300 hover:underline font-medium"
                  >
                    Trishulhub Files
                  </a>{" "}
                  in the connected Drive.
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => void saveDrive()}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save connection
                </Button>
                <Button size="sm" variant="outline" onClick={() => void testDrive()}>
                  Test connection
                </Button>
                <Button size="sm" variant="outline" onClick={() => void repairDrive()}>
                  Repair Drive folders
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void deleteDrive()}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete credentials
                </Button>
              </div>
            </section>
          </TabsContent>

          {/* ═══════════ ACCESS TAB ═══════════ */}
          <TabsContent value="access" className="mt-0 space-y-4">
            <p className="text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              Access here controls Trishulhub Files <strong>and</strong> Google Drive folder permissions for each
              person’s Personal Gmail (Team profile). Changing email or role on Team updates Drive access immediately.
              Private departments stay Admin / Super Admin only.
            </p>

            {/* 1. Role module + departments */}
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-teal-600" /> Role access
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Turn Files on/off per role, then choose which departments that role can see. Applies to{" "}
                  <strong>all current and future users</strong> with that role (e.g. every Project Manager).
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Module on/off</Label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {roles
                    .filter((r) => r !== "SUPER_ADMIN")
                    .map((r) => (
                      <label
                        key={r}
                        className="flex items-center justify-between gap-3 text-sm rounded-lg border border-border/50 px-3 py-2.5 bg-background/60"
                      >
                        <span className="font-medium">{ROLE_LABELS[r] || r.replace(/_/g, " ")}</span>
                        <input
                          type="checkbox"
                          checked={roleAccess[r] !== false}
                          onChange={(e) => setRoleAccess((prev) => ({ ...prev, [r]: e.target.checked }))}
                          className="h-4 w-4"
                          disabled={r === "ADMIN"}
                        />
                      </label>
                    ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => void saveRoles()}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save module toggles
                </Button>
              </div>

              <div className="border-t border-border/40 pt-4 space-y-3">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Departments for role
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {selectableRoles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRole(r)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                        selectedRole === r
                          ? "bg-teal-600 text-white border-teal-600"
                          : "bg-background hover:bg-muted/50"
                      )}
                    >
                      {ROLE_LABELS[r] || r.replace(/_/g, " ")}
                      <span className="ml-1.5 opacity-70">
                        ({(roleDepartments[r] || []).length})
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Select departments for <strong>{ROLE_LABELS[selectedRole] || selectedRole}</strong>. New users with
                  this role get the same access automatically (Trishulhub + Drive).
                </p>
                {grantableDepartments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No departments yet. Create departments in Files first.
                  </p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto rounded-lg border border-border/40 p-2">
                    {grantableDepartments.map((d) => {
                      const on = selectedDeptIds.has(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleRoleDept(d.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                            on ? "bg-teal-500/15 text-teal-900 dark:text-teal-100" : "hover:bg-muted/40"
                          )}
                        >
                          <span
                            className={cn(
                              "h-5 w-5 rounded border flex items-center justify-center shrink-0",
                              on ? "bg-teal-600 border-teal-600 text-white" : "border-border"
                            )}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium">{safeText(d.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {departments.some((d) => d.isPrivate) && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Private departments are hidden here — Admin / Super Admin only.
                  </p>
                )}
                <Button size="sm" disabled={savingRoleDepts} onClick={() => void saveRoleDepartments()}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {savingRoleDepts ? "Saving…" : `Save ${ROLE_LABELS[selectedRole] || selectedRole} departments`}
                </Button>
              </div>
            </section>

            {/* 2. Custom user */}
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-600" /> Custom user access
              </h2>
              <p className="text-xs text-muted-foreground">
                Override one person for the whole Files module — ALLOW / DENY / CLEAR (back to role default).
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                <select
                  className="border rounded-md px-2 py-2 text-sm bg-background"
                  value={overrideUserId}
                  onChange={(e) => setOverrideUserId(e.target.value)}
                >
                  <option value="">Select user</option>
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded-md px-2 py-2 text-sm bg-background"
                  value={overrideMode}
                  onChange={(e) => setOverrideMode(e.target.value as "ALLOW" | "DENY" | "CLEAR")}
                >
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                  <option value="CLEAR">CLEAR</option>
                </select>
                <Button size="sm" className="h-9" onClick={() => void saveOverride()}>
                  Apply
                </Button>
              </div>
              {overrides.length > 0 && (
                <ul className="text-xs space-y-1 text-muted-foreground border-t border-border/40 pt-2">
                  {overrides.map((o) => (
                    <li key={String(o.id)}>
                      {String(o.name || o.email || o.userId)} —{" "}
                      {o.canRead === false || o.canRead === 0 ? "DENY" : "ALLOW"}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 3. Department access (per user) */}
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-violet-600" /> Department access (per user)
              </h2>
              <p className="text-xs text-muted-foreground">
                Grant one person a whole department in Trishulhub <strong>and</strong> share that Drive folder with
                their Personal Gmail. All departments are listed below (Private = Admin only, not grantable).
              </p>

              {departments.length > 0 && (
                <div className="rounded-lg border border-border/40 divide-y divide-border/30 max-h-40 overflow-y-auto">
                  {departments.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={d.isPrivate}
                      onClick={() => setGrantDeptId(d.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm",
                        d.isPrivate && "opacity-60 cursor-not-allowed",
                        grantDeptId === d.id && !d.isPrivate && "bg-teal-500/10"
                      )}
                    >
                      {d.isPrivate ? (
                        <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium truncate flex-1">{safeText(d.name)}</span>
                      {d.isPrivate && (
                        <span className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-300">
                          Private
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-2">
                <select
                  className="border rounded-md px-2 py-2 text-sm bg-background"
                  value={grantDeptId}
                  onChange={(e) => setGrantDeptId(e.target.value)}
                >
                  <option value="">Department</option>
                  {grantableDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded-md px-2 py-2 text-sm bg-background"
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                >
                  <option value="">User</option>
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" className="h-9" onClick={() => void grantDepartmentUser()}>
                  Grant + Drive share
                </Button>
              </div>
              {deptGrants.length > 0 && (
                <ul className="text-xs space-y-1.5 border-t border-border/40 pt-2">
                  {deptGrants.map((g) => (
                    <li
                      key={String(g.id)}
                      className="flex items-center justify-between gap-2 text-muted-foreground"
                    >
                      <span>
                        {g.scope === "NODE_ROLE"
                          ? `Role ${ROLE_LABELS[String(g.role)] || g.role}`
                          : safeText(String(g.name || g.email || g.userId))}
                        {" · "}
                        {g.canWrite ? "write" : "read"}
                      </span>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => void removeDeptGrant(String(g.id))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </DesktopOnlyGate>
  );
}
