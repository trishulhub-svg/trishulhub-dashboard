"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Plus, Trash2, Loader2, Radio, CircleSlash, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { safeText } from "@/lib/utils";

type GpuUrl = { id: string; name: string; url: string; enabled: boolean };

const MAX_URLS = 3;

export function GpuMonitorSettings() {
  const [urls, setUrls] = useState<GpuUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/gpu", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUrls(
          Array.isArray(data?.config?.urls)
            ? data.config.urls.map((u: GpuUrl) => ({ id: u.id, name: u.name || "", url: u.url, enabled: !!u.enabled }))
            : []
        );
      }
    } catch {
      toast.error("Failed to load GPU monitor config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Standard data-loading effect on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const update = (index: number, patch: Partial<GpuUrl>) => {
    setUrls((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  };

  const addUrl = () => {
    if (urls.length >= MAX_URLS) return;
    setUrls((prev) => [
      ...prev,
      { id: `new_${Date.now()}`, name: "", url: "", enabled: false },
    ]);
  };

  const removeUrl = (index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/system/gpu", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save GPU monitor");
        return;
      }
      setUrls(
        Array.isArray(data?.config?.urls)
          ? data.config.urls.map((u: GpuUrl) => ({ id: u.id, name: u.name || "", url: u.url, enabled: !!u.enabled }))
          : []
      );
      toast.success("GPU monitor updated");
    } catch {
      toast.error("Failed to save GPU monitor");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Trishul Cloud Process — GPU & performance monitor</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add up to 3 URLs (e.g. a Cloudflare tunnel) that emit live GPU/performance JSON.
            Toggle one on and the Workspace page will poll it every ~3s and show live visuals.
            When all toggles are off, the Workspace keeps its normal view.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {urls.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
            No GPU URLs configured yet — add one to start monitoring.
          </p>
        )}
        {urls.map((u, i) => (
          <div key={u.id || i} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-[10px] shrink-0">
                  URL {i + 1}
                </Badge>
                {u.enabled ? (
                  <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    <Radio className="h-2.5 w-2.5 mr-1" /> Live
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    <CircleSlash className="h-2.5 w-2.5 mr-1" /> Off
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={u.enabled}
                  onCheckedChange={(v) => update(i, { enabled: v })}
                  aria-label={`Toggle URL ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500"
                  onClick={() => removeUrl(i)}
                  aria-label="Remove URL"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
              <Input
                value={u.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Name (e.g. Render Node 1)"
                aria-label={`URL ${i + 1} name`}
              />
              <Input
                value={u.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://your-gpu-tunnel.trycloudflare.com"
                aria-label={`URL ${i + 1} address`}
              />
            </div>
            {u.url && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                <span className="truncate">{safeText(u.url)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addUrl} disabled={urls.length >= MAX_URLS}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add URL
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The URL should return JSON (e.g. GPU usage, temperature, memory, FPS). Only Super Admins
        can configure this; all staff can see the live view on the Workspace page.
      </p>
    </div>
  );
}
