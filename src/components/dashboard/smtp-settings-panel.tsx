"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Server,
  TestTube,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { safeArray } from "@/lib/utils";

const APP_NAME = "TrishulHub";

interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
  isPrimary: boolean;
  isActive: boolean;
  passwordSet?: boolean;
}

const EMPTY_FORM = {
  host: "",
  port: 587,
  username: "",
  password: "",
  fromEmail: "",
  fromName: APP_NAME,
  secure: false,
  isPrimary: true,
};

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}

/** SUPER_ADMIN SMTP management panel (lives under System → SMTP). */
export function SmtpSettingsPanel() {
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [smtpEditId, setSmtpEditId] = useState<string | null>(null);
  const [smtpForm, setSmtpForm] = useState(EMPTY_FORM);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpDeleteConfirm, setSmtpDeleteConfirm] = useState<string | null>(null);
  const [smtpDeleteLoading, setSmtpDeleteLoading] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  const fetchSmtpConfigs = useCallback(async () => {
    setSmtpLoading(true);
    try {
      const res = await fetch("/api/smtp", { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSmtpConfigs(safeArray(data));
      } else {
        toast.error("Failed to load SMTP configurations");
      }
    } catch (err) {
      console.error("[smtp] Failed to fetch configs:", err);
    } finally {
      setSmtpLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSmtpConfigs();
  }, [fetchSmtpConfigs]);

  const openAdd = () => {
    setSmtpEditId(null);
    setSmtpForm(EMPTY_FORM);
    setShowSmtpPassword(false);
    setSmtpDialogOpen(true);
  };

  const handleEditSmtp = (config: SmtpConfig) => {
    setSmtpEditId(config.id);
    setShowSmtpPassword(false);
    setSmtpForm({
      host: config.host,
      port: config.port,
      username: config.username,
      password: "",
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      secure: config.secure,
      isPrimary: config.isPrimary,
    });
    setSmtpDialogOpen(true);
  };

  const handleSaveSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username || !smtpForm.fromEmail) {
      toast.error("Host, username, and from email are required");
      return;
    }
    if (!smtpEditId && !smtpForm.password) {
      toast.error("Password is required for new SMTP configurations");
      return;
    }
    setSmtpSaving(true);
    try {
      const method = smtpEditId ? "PATCH" : "POST";
      const body = smtpEditId ? { id: smtpEditId, ...smtpForm } : smtpForm;
      const res = await fetch("/api/smtp", {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(smtpEditId ? "SMTP config updated" : "SMTP config added");
        setSmtpDialogOpen(false);
        setSmtpEditId(null);
        setSmtpForm(EMPTY_FORM);
        void fetchSmtpConfigs();
      } else {
        toast.error(`${data.error || "Failed to save SMTP config"}`, { duration: 8000 });
      }
    } catch {
      toast.error("Network error saving SMTP. Try again.", { duration: 8000 });
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username) {
      toast.error("Host and username are required to test");
      return;
    }
    if (!smtpForm.password) {
      toast.error(
        smtpEditId
          ? "Enter the password to test (current password is not shown)"
          : "Password is required to test"
      );
      return;
    }
    setSmtpTesting(true);
    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(smtpForm),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) toast.success("SMTP connection successful!");
      else toast.error(data.error || "SMTP connection failed");
    } catch {
      toast.error("SMTP connection test failed");
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleDeleteSmtp = async (id: string) => {
    setSmtpDeleteLoading(true);
    try {
      const res = await fetch(`/api/smtp?id=${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("SMTP config deleted");
        setSmtpDeleteConfirm(null);
        void fetchSmtpConfigs();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete SMTP config");
    } finally {
      setSmtpDeleteLoading(false);
    }
  };

  return (
    <>
      <Card className="th-surface">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2 min-w-0">
              <Server className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <CardTitle className="text-base">SMTP Configuration</CardTitle>
                <CardDescription>
                  Configure email servers for OTP delivery. Max 2 servers (primary + failover).
                  Delivery logs are under System → Email Logs.
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full sm:w-auto shrink-0"
              onClick={openAdd}
              disabled={smtpConfigs.length >= 2}
            >
              <Plus className="h-4 w-4 mr-1" /> Add SMTP
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {smtpLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : smtpConfigs.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-xl">
              <Server className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
              <p className="text-sm text-muted-foreground">No SMTP servers configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a Brevo or other SMTP server to enable email verification
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {smtpConfigs.map((config) => (
                <div
                  key={config.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        config.isPrimary
                          ? "bg-emerald-100 dark:bg-emerald-900/30"
                          : "bg-sky-100 dark:bg-sky-900/30"
                      }`}
                    >
                      <Server
                        className={`h-4 w-4 ${
                          config.isPrimary ? "text-emerald-600" : "text-sky-600"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {config.host}:{config.port}
                        </span>
                        <Badge variant={config.isPrimary ? "default" : "secondary"} className="text-[10px]">
                          {config.isPrimary ? "Primary" : "Failover"}
                        </Badge>
                        {!config.isActive && (
                          <Badge variant="destructive" className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {config.username} · From: {config.fromEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleEditSmtp(config)}
                      aria-label="Edit SMTP config"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-600"
                      onClick={() => setSmtpDeleteConfirm(config.id)}
                      aria-label="Delete SMTP config"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={smtpDialogOpen} onOpenChange={setSmtpDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              {smtpEditId ? "Edit SMTP Configuration" : "Add SMTP Configuration"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-sky-700 dark:text-sky-300">Brevo SMTP Settings</p>
                  <p className="text-[11px] text-sky-600 dark:text-sky-400">
                    Host: smtp-relay.brevo.com · Port: 587 · SSL/TLS: OFF (STARTTLS) · Username: login
                    email · Password: SMTP key
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">SMTP Host *</Label>
                <Input
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                  placeholder="smtp-relay.brevo.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Port</Label>
                <Input
                  type="number"
                  value={smtpForm.port}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, port: parseInt(e.target.value, 10) || 587 })
                  }
                  placeholder="587"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Username *</Label>
                <Input
                  value={smtpForm.username}
                  onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                  placeholder="your-email@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {smtpEditId ? "New Password (leave blank to keep)" : "Password *"}
                </Label>
                <div className="relative">
                  <Input
                    type={showSmtpPassword ? "text" : "password"}
                    value={smtpForm.password}
                    onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                    placeholder={smtpEditId ? "Leave blank to keep current" : "SMTP key/password"}
                    className="pr-10"
                  />
                  <PasswordToggle
                    visible={showSmtpPassword}
                    onToggle={() => setShowSmtpPassword(!showSmtpPassword)}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">From Email *</Label>
                <Input
                  type="email"
                  value={smtpForm.fromEmail}
                  onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                  placeholder="noreply@yourdomain.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From Name</Label>
                <Input
                  value={smtpForm.fromName}
                  onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                  placeholder={APP_NAME}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={smtpForm.secure}
                  onCheckedChange={(val) =>
                    setSmtpForm({ ...smtpForm, secure: val, port: val ? 465 : 587 })
                  }
                />
                <div>
                  <Label className="text-xs">SSL/TLS (Implicit)</Label>
                  <p className="text-[10px] text-muted-foreground">
                    {smtpForm.secure ? "Port 465 - Direct SSL" : "Port 587 - STARTTLS"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={smtpForm.isPrimary}
                  onCheckedChange={(val) => setSmtpForm({ ...smtpForm, isPrimary: val })}
                />
                <Label className="text-xs">Primary Server</Label>
              </div>
            </div>
          </div>
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              <strong>Tip:</strong> Click &quot;Test&quot; first to verify before saving.
            </p>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => void handleTestSmtp()}
              disabled={smtpTesting}
            >
              {smtpTesting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-1" />
              )}
              Test
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setSmtpDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void handleSaveSmtp()}
              disabled={smtpSaving}
            >
              {smtpSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              {smtpEditId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!smtpDeleteConfirm}
        onOpenChange={(open) => !open && setSmtpDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete SMTP Configuration</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete this SMTP server? Emails using it will fail until another is configured.
          </p>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setSmtpDeleteConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => smtpDeleteConfirm && void handleDeleteSmtp(smtpDeleteConfirm)}
              disabled={smtpDeleteLoading}
            >
              {smtpDeleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
