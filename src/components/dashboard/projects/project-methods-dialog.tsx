"use client";

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Settings, Check, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn, safeText } from "@/lib/utils";

export function ProjectMethodsDialog({
  projectId,
  open,
  onOpenChange,
  canManageCatalog = true,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageCatalog?: boolean;
}) {
  const queryClient = useQueryClient();
  const [projectMethods, setProjectMethods] = useState<{ id: string; name: string }[]>([]);
  const [methodLoading, setMethodLoading] = useState(false);
  const [methodSaving, setMethodSaving] = useState(false);
  const [newMethodName, setNewMethodName] = useState("");
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editingMethodName, setEditingMethodName] = useState("");
  const [deleteMethodTarget, setDeleteMethodTarget] = useState<{ id: string; name: string } | null>(null);
  const [assignedMethodIds, setAssignedMethodIds] = useState<string[]>([]);
  const [methodAssignLoading, setMethodAssignLoading] = useState(false);

  const fetchProjectMethods = useCallback(async () => {
    setMethodLoading(true);
    try {
      const res = await fetch("/api/project-methods", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const methods: { id: string; name: string }[] = Array.isArray(data) ? data : [];
        setProjectMethods(methods);
        if (canManageCatalog && methods.length === 0) {
          const defaults = ["JAVA", "PHP", "HTML", "Other"];
          await Promise.all(defaults.map((name) =>
            fetch("/api/project-methods", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ name }),
            })
          ));
          const res2 = await fetch("/api/project-methods", { credentials: "include" });
          if (res2.ok) setProjectMethods(await res2.json());
        }
      }
    } catch { /* silent */ } finally { setMethodLoading(false); }
  }, [canManageCatalog]);

  const fetchProjectAssignedMethods = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/projects/${pid}/methods`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAssignedMethodIds(Array.isArray(data) ? data.map((m: { id: string }) => m.id) : []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!open || !projectId) return;
    fetchProjectMethods();
    fetchProjectAssignedMethods(projectId);
    setNewMethodName("");
    setEditingMethodId(null);
  }, [open, projectId, fetchProjectMethods, fetchProjectAssignedMethods]);

  const handleSaveNewMethod = useCallback(async () => {
    if (!newMethodName.trim() || methodSaving) return;
    setMethodSaving(true);
    try {
      const res = await fetch("/api/project-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newMethodName.trim() }),
      });
      if (res.ok) {
        setNewMethodName("");
        fetchProjectMethods();
        toast.success("Method added successfully");
      } else {
        const data = await res.json().catch(() => ({})) as Record<string, string>;
        const errMsg = data.error || "Failed to add method";
        console.error("[project-methods] Create failed:", errMsg, data.debug || "");
        toast.error(errMsg, { duration: 6000 });
      }
    } catch (err) {
      console.error("[project-methods] Network error:", err);
      toast.error("Failed to add method — network error");
    } finally { setMethodSaving(false); }
  }, [newMethodName, methodSaving, fetchProjectMethods]);

  const handleSaveEditMethod = useCallback(async (methodId: string, name: string) => {
    if (!name.trim() || methodSaving) return;
    setMethodSaving(true);
    try {
      const res = await fetch("/api/project-methods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: methodId, name: name.trim() }),
      });
      if (res.ok) {
        setEditingMethodId(null);
        fetchProjectMethods();
        toast.success("Method updated");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to update method");
      }
    } catch { toast.error("Failed to update method"); } finally { setMethodSaving(false); }
  }, [methodSaving, fetchProjectMethods]);

  const handleDeleteMethod = useCallback(async () => {
    if (!deleteMethodTarget) return;
    setMethodSaving(true);
    try {
      const res = await fetch(`/api/project-methods?id=${deleteMethodTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Method deleted");
        fetchProjectMethods();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to delete method");
      }
    } catch { toast.error("Failed to delete method"); } finally { setMethodSaving(false); setDeleteMethodTarget(null); }
  }, [deleteMethodTarget, fetchProjectMethods]);

  const handleSaveProjectMethods = useCallback(async () => {
    setMethodAssignLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/methods`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ methodIds: assignedMethodIds }),
      });
      if (res.ok) {
        toast.success("Project methods updated");
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to update project methods");
      }
    } catch {
      toast.error("Failed to update project methods");
    } finally {
      setMethodAssignLoading(false);
    }
  }, [projectId, assignedMethodIds, queryClient]);

  const toggleProjectMethod = useCallback((methodId: string) => {
    setAssignedMethodIds((prev) =>
      prev.includes(methodId)
        ? prev.filter((id) => id !== methodId)
        : [...prev, methodId]
    );
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Methods</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg liquid-glass border p-4 space-y-4">
            <div className={cn("space-y-3", canManageCatalog && "pb-4 border-b border-white/20 dark:border-white/10")}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Methods for this Project
              </h3>
              <p className="text-[11px] text-muted-foreground">Select which methods apply to this project.</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {methodLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-8 bg-muted/50 animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    {projectMethods.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No methods available. Add methods below first.</p>
                    )}
                    {projectMethods.map((pm) => (
                      <label
                        key={pm.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-all",
                          assignedMethodIds.includes(pm.id)
                            ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                            : "border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] hover:border-primary/20"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={assignedMethodIds.includes(pm.id)}
                          onChange={() => toggleProjectMethod(pm.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            assignedMethodIds.includes(pm.id) ? "bg-primary" : "bg-muted-foreground/40"
                          )} />
                          <span className="text-sm font-medium truncate">{pm.name}</span>
                        </div>
                      </label>
                    ))}
                  </>
                )}
              </div>
              <Button
                size="sm"
                disabled={methodAssignLoading}
                onClick={handleSaveProjectMethods}
                className="h-8 px-4"
              >
                {methodAssignLoading ? "Saving..." : "Save Methods"}
              </Button>
            </div>

            {canManageCatalog && (
              <>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Settings className="h-3.5 w-3.5" /> Manage Project Methods
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Add, edit, or remove project methods (e.g., JAVA, PHP, HTML). These are used when creating clients.</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="New method name..."
                    value={newMethodName}
                    onChange={(e) => setNewMethodName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleSaveNewMethod(); }
                    }}
                    className="h-9 text-sm flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newMethodName.trim() || methodSaving}
                    onClick={handleSaveNewMethod}
                    className="h-9 px-4"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span className="hidden sm:inline">Add</span>
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {methodLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-9 bg-muted/50 animate-pulse rounded-lg" />
                      ))}
                    </div>
                  ) : (
                    <>
                      {projectMethods.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">No methods defined yet. Add one above.</p>
                      )}
                      {projectMethods.map((pm) => (
                        <div key={pm.id} className="flex items-center gap-2 rounded-lg border border-white/20 dark:border-white/10 px-3 py-2.5 bg-white/40 dark:bg-white/[0.02]">
                          {editingMethodId === pm.id ? (
                            <>
                              <Input
                                className="h-8 text-sm flex-1"
                                value={editingMethodName}
                                onChange={(e) => setEditingMethodName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); handleSaveEditMethod(pm.id, editingMethodName); }
                                  if (e.key === "Escape") setEditingMethodId(null);
                                }}
                                autoFocus
                              />
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 shrink-0"
                                disabled={methodSaving}
                                onClick={() => handleSaveEditMethod(pm.id, editingMethodName)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 shrink-0"
                                onClick={() => setEditingMethodId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="h-2 w-2 rounded-full bg-primary/60 shrink-0" />
                                <span className="text-sm font-medium truncate">{pm.name}</span>
                              </div>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0"
                                onClick={() => { setEditingMethodId(pm.id); setEditingMethodName(pm.name); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 text-red-500"
                                onClick={() => setDeleteMethodTarget({ id: pm.id, name: pm.name })}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteMethodTarget} onOpenChange={(o) => { if (!o) setDeleteMethodTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project Method</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{safeText(deleteMethodTarget?.name)}&quot;? This action cannot be undone. Any clients using this method will have it removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={methodSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMethod} className="bg-red-600 hover:bg-red-700" disabled={methodSaving}>
              {methodSaving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
