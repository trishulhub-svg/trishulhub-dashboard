"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plug, Save, Trash2, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type RoleAccess = Record<string, boolean>;

export default function FilesSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"SERVICE_ACCOUNT" | "OAUTH">("SERVICE_ACCOUNT");
  const [impersonateEmail, setImpersonateEmail] = useState("info@trishulhub.in");
  const [rootFolderId, setRootFolderId] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [driveMeta, setDriveMeta] = useState<Record<string, unknown> | null>(null);
  const [roleAccess, setRoleAccess] = useState<RoleAccess>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [teamUsers, setTeamUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [overrideUserId, setOverrideUserId] = useState("");
  const [overrideMode, setOverrideMode] = useState<"ALLOW" | "DENY" | "CLEAR">("ALLOW");
  const [overrides, setOverrides] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "SUPER_ADMIN") {
      router.replace("/dashboard/files");
    }
  }, [session, status, router]);

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
      setMode(data.drive?.mode === "OAUTH" ? "OAUTH" : "SERVICE_ACCOUNT");
      setImpersonateEmail(data.drive?.impersonateEmail || "info@trishulhub.in");
      setRootFolderId(data.drive?.rootFolderId || "");
      setRoleAccess(data.roleAccess || {});
      setRoles(Array.isArray(data.roles) ? data.roles : []);

      const [ar, tr] = await Promise.all([
        fetch("/api/files/access", { credentials: "include" }),
        fetch("/api/team?type=users", { credentials: "include" }),
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
            .map((u: { id: string; name?: string; email: string }) => ({
              id: u.id,
              name: u.name || u.email,
              email: u.email,
            }))
        );
      }
    } catch {
      toast.error("Failed to load file settings");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const saveDrive = async () => {
    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        mode,
        impersonateEmail,
        rootFolderId: rootFolderId || null,
        serviceAccountJson: serviceAccountJson || null,
        oauthClientId: oauthClientId || null,
        oauthClientSecret: oauthClientSecret || null,
        refreshToken: refreshToken || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Save failed");
      return;
    }
    toast.success("Drive connection saved");
    setServiceAccountJson("");
    setOauthClientSecret("");
    setRefreshToken("");
    setDriveMeta(data.drive || null);
  };

  const testDrive = async () => {
    const res = await fetch("/api/files/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) toast.success(`Connected as ${data.email || "Drive"}`);
    else toast.error(data.error || "Connection failed");
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
      toast.error("Failed to save role access");
      return;
    }
    toast.success("Role access saved");
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

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading file settings…</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/files"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Files — Super Admin settings</h1>
          <p className="text-sm text-muted-foreground">
            Connect info@trishulhub.in Drive and control who can open Files.
          </p>
        </div>
      </div>

      {/* Drive connection */}
      <section className="rounded-xl border border-border/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Plug className="h-4 w-4 text-teal-600" /> Google Drive connection
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Recommended: Service account JSON + domain-wide delegation impersonating{" "}
          <strong>info@trishulhub.in</strong>. Full steps:{" "}
          <code className="text-[11px]">docs/FILE-DRIVE-SETUP.md</code>
        </p>
        {driveMeta && (
          <p className={cn("text-xs", driveMeta.connected ? "text-emerald-600" : "text-amber-600")}>
            Status: {driveMeta.connected ? "Connected" : "Not connected"}
            {driveMeta.clientEmail ? ` · SA ${String(driveMeta.clientEmail)}` : ""}
            {driveMeta.rootFolderId ? ` · root ${String(driveMeta.rootFolderId)}` : ""}
          </p>
        )}

        <div className="flex gap-2">
          {(["SERVICE_ACCOUNT", "OAUTH"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border",
                mode === m ? "bg-teal-600 text-white border-teal-600" : "bg-background"
              )}
            >
              {m === "SERVICE_ACCOUNT" ? "Service account" : "OAuth"}
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
            <div className="space-y-1">
              <Label className="text-xs">OAuth Client ID</Label>
              <Input value={oauthClientId} onChange={(e) => setOauthClientId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">OAuth Client Secret</Label>
              <Input
                type="password"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                placeholder={driveMeta?.hasOAuthClient ? "(saved — paste to replace)" : ""}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Refresh token</Label>
              <Input
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder={driveMeta?.hasRefreshToken ? "(saved — paste to replace)" : ""}
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => void saveDrive()}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save connection
          </Button>
          <Button size="sm" variant="outline" onClick={() => void testDrive()}>
            Test connection
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void deleteDrive()}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete credentials
          </Button>
        </div>
      </section>

      {/* Role access */}
      <section className="rounded-xl border border-border/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" /> Role access (default)
        </h2>
        <p className="text-xs text-muted-foreground">
          By default Files follows role toggles. Super Admin is always on.
        </p>
        <div className="space-y-2">
          {roles.filter((r) => r !== "SUPER_ADMIN").map((r) => (
            <label key={r} className="flex items-center justify-between gap-3 text-sm">
              <span>{r.replace(/_/g, " ")}</span>
              <input
                type="checkbox"
                checked={roleAccess[r] !== false}
                onChange={(e) => setRoleAccess((prev) => ({ ...prev, [r]: e.target.checked }))}
                className="h-4 w-4"
              />
            </label>
          ))}
        </div>
        <Button size="sm" onClick={() => void saveRoles()}>Save role access</Button>
      </section>

      {/* Custom user access */}
      <section className="rounded-xl border border-border/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Custom user access
        </h2>
        <p className="text-xs text-muted-foreground">
          Override a person when the team needs it — ALLOW / DENY / CLEAR (back to role default).
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          <select
            className="border rounded-md px-2 py-2 text-sm bg-background"
            value={overrideUserId}
            onChange={(e) => setOverrideUserId(e.target.value)}
          >
            <option value="">Select user</option>
            {teamUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
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
          <Button size="sm" className="h-9" onClick={() => void saveOverride()}>Apply</Button>
        </div>
        {overrides.length > 0 && (
          <ul className="text-xs space-y-1 text-muted-foreground">
            {overrides.map((o) => (
              <li key={String(o.id)}>
                {String(o.name || o.email || o.userId)} — {o.canRead === false || o.canRead === 0 ? "DENY" : "ALLOW"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
