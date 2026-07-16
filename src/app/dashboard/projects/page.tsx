"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Search, FolderKanban, Pencil, Trash2, MoreHorizontal,
  Key, Eye, EyeOff, Copy, X, Activity, CheckCircle2,
  LayoutGrid, ClipboardCheck, List, ArrowUpDown, CircleDot, ExternalLink, Globe,
  Settings, Check, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { cn, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// TODO: Make configurable per project/client
const CURRENCY_SYMBOL = "₹";

// URL sanitizer: blocks javascript: and data: schemes to prevent XSS
const safeUrl = (url: string) => {
  if (!url) return '#';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {}
  return '#';
};

const statusColors: Record<string, string> = {
  PLANNING: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const statusDotColors: Record<string, string> = {
  PLANNING: "bg-gray-400",
  IN_PROGRESS: "bg-blue-400",
  REVIEW: "bg-yellow-400",
  APPROVAL: "bg-orange-400",
  DEPLOYED: "bg-green-400",
  COMPLETED: "bg-emerald-400",
};

const VALID_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"];

// ━━ Kanban column configuration ━━
const KANBAN_COLUMNS = [
  { key: "PLANNING",   label: "Planning",    dot: "bg-gray-400",    glowColor: "hover:shadow-gray-500/5 dark:hover:shadow-gray-400/10", accentBar: "bg-gray-400", accentRing: "ring-gray-400/20" },
  { key: "IN_PROGRESS", label: "In Progress",  dot: "bg-blue-400",    glowColor: "hover:shadow-blue-500/5 dark:hover:shadow-blue-400/10", accentBar: "bg-blue-400", accentRing: "ring-blue-400/20" },
  { key: "REVIEW",     label: "Review",      dot: "bg-yellow-400",  glowColor: "hover:shadow-yellow-500/5 dark:hover:shadow-yellow-400/10", accentBar: "bg-yellow-400", accentRing: "ring-yellow-400/20" },
  { key: "APPROVAL",   label: "Approval",    dot: "bg-orange-400",  glowColor: "hover:shadow-orange-500/5 dark:hover:shadow-orange-400/10", accentBar: "bg-orange-400", accentRing: "ring-orange-400/20" },
  { key: "DEPLOYED",   label: "Deployed",    dot: "bg-green-400",   glowColor: "hover:shadow-green-500/5 dark:hover:shadow-green-400/10", accentBar: "bg-green-400", accentRing: "ring-green-400/20" },
  { key: "COMPLETED",  label: "Completed",   dot: "bg-emerald-400", glowColor: "hover:shadow-emerald-500/5 dark:hover:shadow-emerald-400/10", accentBar: "bg-emerald-400", accentRing: "ring-emerald-400/20" },
] as const;

// Column display order: IN_PROGRESS first, PLANNING middle, COMPLETED last
const COLUMN_DISPLAY_ORDER: Record<string, number> = {
  IN_PROGRESS: 0,
  REVIEW: 1,
  APPROVAL: 2,
  DEPLOYED: 3,
  PLANNING: 4,
  COMPLETED: 5,
};

// ━━ Credential form type ━━
interface CredentialForm {
  title: string;
  username: string;
  password: string;
}


function getProgressColor(progress: number) {
  if (progress < 30) return "[&>div]:bg-red-500 [&>div]:shadow-red-500/30";
  if (progress < 70) return "[&>div]:bg-amber-500 [&>div]:shadow-amber-500/30";
  return "[&>div]:bg-emerald-500 [&>div]:shadow-emerald-500/30";
}

// ━━ Kanban Project Card (visual only — used in both sortable cards and DragOverlay) ━━
function KanbanProjectCard({
  project,
  onClick,
  isAdminUser,
  onEdit,
  onDelete,
  isDragging,
  onHover,
  pendingCount,
  onPendingClick,
}: {
  project: Record<string, unknown>;
  onClick: () => void;
  isAdminUser: boolean;
  onEdit?: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete?: (projectId: string, e: React.MouseEvent) => void;
  isDragging?: boolean;
  onHover?: () => void;
  pendingCount?: number;
  onPendingClick?: () => void;
}) {
  const client = project.client as Record<string, unknown> | undefined;
  const pName = safeText(project.name, "Untitled");
  const pStatus = safeText(project.status, "");
  const pClientName = client ? safeText(client.name, "Client") : "Client";
  const pProgress = safeNumber(project.progress);
  const pDeadline = project.deadline as string | null | undefined;
  const pWebsites = Array.isArray(project.websites) ? project.websites as Record<string, unknown>[] : [];

  return (
    <div
      className={cn(
        "group/card relative rounded-lg border-l-[3px] p-3 cursor-pointer transition-all duration-200",
        "bg-white/70 dark:bg-white/[0.05] backdrop-blur-sm",
        "border border-gray-200/60 dark:border-gray-700/40 border-l-gray-300 dark:border-l-gray-600",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:shadow-md hover:shadow-black/[0.04] dark:hover:shadow-black/20",
        !isDragging && "hover:-translate-y-0.5",
        isDragging && "shadow-xl shadow-black/10 dark:shadow-black/40 ring-2 ring-primary/20 scale-105",
        pStatus === "IN_PROGRESS" && "border-l-blue-400 dark:border-l-blue-500",
        pStatus === "REVIEW" && "border-l-yellow-400 dark:border-l-yellow-500",
        pStatus === "APPROVAL" && "border-l-orange-400 dark:border-l-orange-500",
        pStatus === "DEPLOYED" && "border-l-green-400 dark:border-l-green-500",
        pStatus === "COMPLETED" && "border-l-emerald-400 dark:border-l-emerald-500",
        pStatus === "PLANNING" && "border-l-gray-400 dark:border-l-gray-500",
      )}
      onClick={onClick}
      onMouseEnter={onHover}
      style={isDragging ? { pointerEvents: "none" as const } : undefined}
    >
      {/* Admin: 3-dot menu — absolutely positioned to prevent overflow */}
      {isAdminUser && onEdit && onDelete && !isDragging && (
        <div
          className="absolute top-2 right-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e) => onEdit(project, e)} className="gap-2 cursor-pointer">
                <Pencil className="h-3.5 w-3.5" /> Edit Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => onDelete(safeText(project.id, ""), e)} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Project Title + Status Dot */}
      <div className="flex items-start gap-2 pr-7">
        <span className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", statusDotColors[pStatus] || "bg-gray-400", statusDotColors[pStatus] && statusDotColors[pStatus].replace("bg-", "ring-"))} />
        <div className="flex-1 min-w-0">
          <h4
            className="text-[13px] font-semibold leading-snug line-clamp-2"
            title={pName}
          >
            {pName}
          </h4>
        </div>
      </div>

      {/* Status Badge + Client Name */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Badge className={`text-[10px] px-1.5 py-0 leading-4 font-medium ${statusColors[pStatus] || ""}`}>
          {pStatus.replace("_", " ")}
        </Badge>
        {/* Task 7 (Phase 4): demo projects no longer appear on this page, so
            the per-card DEMO badge has been removed. Demo view still renders
            its header-level DEMO badge via the isDemoView branch below. */}
        <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
          {pClientName}
        </span>
      </div>

      {/* Method badges */}
      {Array.isArray(project.methods) && (project.methods as Array<{name: string}>).length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {(project.methods as Array<{name: string}>).map((m, i) => (
            <Badge key={i} className="text-[9px] px-1.5 py-0 leading-3 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/40">
              {m.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Pending Tasks Badge — clickable */}
      {typeof pendingCount === "number" && pendingCount > 0 && !isDragging && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 dark:border-amber-500/10 shadow-sm transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onPendingClick?.();
          }}
          title={`${pendingCount} pending task${pendingCount > 1 ? "s" : ""}`}
        >
          <ClipboardCheck className="h-2.5 w-2.5" />
          {pendingCount} Pending
        </button>
      )}

      {/* Progress Bar */}
      <div className="mt-2.5 space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Progress</span>
          <span className={cn("font-bold tabular-nums", pProgress < 30 ? "text-red-600 dark:text-red-400" : pProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>{pProgress}%</span>
        </div>
        <Progress value={pProgress} className={cn("h-1.5 rounded-full shadow-sm", getProgressColor(pProgress))} />
      </div>

      {/* Deadline */}
      {pDeadline && (
        <p className="text-[11px] text-muted-foreground/70 mt-2 flex items-center gap-1">
          <span className="font-medium text-muted-foreground">Deadline:</span>
          {safeDate(pDeadline, "No date")}
        </p>
      )}

      {/* Live button for admin when websites exist */}
      {isAdminUser && pWebsites.length > 0 && !isDragging && (
        <div
          className="absolute bottom-2 left-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {pWebsites.length === 1 ? (
            <a
              href={safeUrl(safeText(pWebsites[0].url, ""))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
            >
              <Globe className="h-2.5 w-2.5" />
              Live
            </a>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                >
                  <Globe className="h-2.5 w-2.5" />
                  Live
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {pWebsites.map((w, i) => {
                  const wUrl = safeText(w.url, "");
                  const wLabel = safeText(w.label, "");
                  return (
                    <DropdownMenuItem key={safeText(w.id, String(i))} asChild>
                      <a href={safeUrl(wUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <ExternalLink className="h-3 w-3 text-emerald-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium truncate">{wLabel || `Site ${i + 1}`}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{wUrl}</p>
                        </div>
                      </a>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}

// ━━ SortableProjectCard — wraps KanbanProjectCard with useSortable ━━
function SortableProjectCard({
  project,
  onCardClick,
  isAdminUser,
  onEdit,
  onDelete,
  onHover,
  pendingCount,
  onPendingClick,
}: {
  project: Record<string, unknown>;
  onCardClick: () => void;
  isAdminUser: boolean;
  onEdit: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete: (projectId: string, e: React.MouseEvent) => void;
  onHover?: () => void;
  pendingCount?: number;
  onPendingClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: safeText(project.id, ""),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanProjectCard
        project={project}
        onClick={onCardClick}
        isAdminUser={isAdminUser}
        onEdit={onEdit}
        onDelete={onDelete}
        isDragging={false}
        onHover={onHover}
        pendingCount={pendingCount}
        onPendingClick={onPendingClick}
      />
    </div>
  );
}

// ━━ DroppableKanbanColumn — wraps column card list with useDroppable + SortableContext ━━
function DroppableKanbanColumn({
  col,
  projects,
  isAdminUser,
  onCardClick,
  onEdit,
  onDelete,
  isDimmed,
  activeId,
  onHover,
}: {
  col: typeof KANBAN_COLUMNS[number];
  projects: Record<string, unknown>[];
  isAdminUser: boolean;
  onCardClick: (project: Record<string, unknown>) => void;
  onEdit: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete: (projectId: string, e: React.MouseEvent) => void;
  isDimmed: boolean;
  activeId: string | null;
  onHover?: (pid: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div
      className={cn(
        "flex-shrink-0 w-[260px] sm:w-[280px] rounded-xl border transition-all duration-300 snap-start relative overflow-hidden",
        "bg-gradient-to-b from-white/80 to-white/50 dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl",
        "border-gray-200/80 dark:border-gray-700/50",
        "hover:border-gray-300 dark:hover:border-gray-600",
        col.glowColor,
        isDimmed && "opacity-40 pointer-events-none",
        isOver && !isDimmed && `ring-2 ${col.accentRing} border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.08] shadow-lg`
      )}
      style={{ minHeight: "calc(100vh - 300px)" }}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", col.accentBar, isOver && !isDimmed ? "opacity-100" : "opacity-60")} />

      {/* Column Header */}
      <div className="px-3 py-2.5 border-b border-gray-200/50 dark:border-gray-700/40 pl-4">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", col.dot, col.dot.replace("bg-", "ring-"))} />
          <h3 className="font-bold text-[12px] tracking-tight">{col.label}</h3>
          <Badge
            variant="secondary"
            className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] font-bold justify-center bg-muted/80"
          >
            {projects.length}
          </Badge>
        </div>
      </div>

      {/* Card List — Droppable zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "p-2 space-y-2 overflow-y-auto transition-all duration-300 pl-4",
          isOver && !isDimmed && "bg-primary/[0.03] dark:bg-primary/[0.05]"
        )}
        style={{ maxHeight: "calc(100vh - 380px)" }}
      >
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center mb-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground/30" />
            </div>
            <p className="text-[11px] text-muted-foreground/50 font-medium">No projects</p>
          </div>
        )}
        <SortableContext items={projects.map((p) => safeText(p.id, ""))} strategy={verticalListSortingStrategy}>
          {projects.map((project) => {
            const pId = safeText(project.id, "");
            // Don't render the actively dragged card in the list
            if (activeId === pId) return null;
            return (
              <SortableProjectCard
                key={pId}
                project={project}
                onCardClick={() => onCardClick(project)}
                isAdminUser={isAdminUser}
                onEdit={onEdit}
                onDelete={onDelete}
                onHover={() => onHover && onHover(pId)}
                onPendingClick={() => onCardClick(project)}
              />
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}

// ━━ List View Row ━━
function ListViewRow({
  project,
  isAdminUser,
  onView,
  onEdit,
  onDelete,
  pendingCount,
  onPendingClick,
}: {
  project: Record<string, unknown>;
  isAdminUser: boolean;
  onView: () => void;
  onEdit?: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete?: (projectId: string, e: React.MouseEvent) => void;
  pendingCount?: number;
  onPendingClick?: () => void;
}) {
  const client = project.client as Record<string, unknown> | undefined;
  const pName = safeText(project.name, "Untitled");
  const pStatus = safeText(project.status, "");
  const pClientName = client ? safeText(client.name, "Client") : "Client";
  const pProgress = safeNumber(project.progress);
  const pDeadline = project.deadline as string | null | undefined;

  return (
    <div
      className={cn(
        "group/row flex items-center gap-4 p-3 rounded-lg border transition-all duration-150",
        "bg-white/70 dark:bg-white/[0.04] backdrop-blur-sm",
        "border-gray-200/60 dark:border-gray-700/40",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:bg-white/90 dark:hover:bg-white/[0.07]",
        "hover:shadow-sm cursor-pointer",
      )}
      onClick={onView}
    >
      {/* Status dot + Name */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", statusDotColors[pStatus] || "bg-gray-400", statusDotColors[pStatus] && statusDotColors[pStatus].replace("bg-", "ring-"))} />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold truncate" title={pName}>{pName}</h4>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[11px] text-muted-foreground">{pClientName}</span>
            {Array.isArray(project.methods) && (project.methods as Array<{name: string}>).length > 0 && (
              <span className="flex items-center gap-0.5">
                {(project.methods as Array<{name: string}>).map((m, i) => (
                  <Badge key={i} className="text-[9px] px-1.5 py-0 leading-3 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/40">
                    {m.name}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Badge className={`text-[10px] px-2 py-0.5 font-medium ${statusColors[pStatus] || ""}`}>
          {pStatus.replace("_", " ")}
        </Badge>
        {/* Task 7 (Phase 4): per-card DEMO badge removed — demos no longer
            surface in the main projects list. The demo view shows a single
            header-level DEMO badge instead. */}
      </div>

      {/* Pending Tasks Badge */}
      <div className="hidden sm:flex items-center shrink-0">
        {typeof pendingCount === "number" && pendingCount > 0 ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 dark:border-amber-500/10 shadow-sm transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPendingClick?.();
            }}
            title={`${pendingCount} pending task${pendingCount > 1 ? "s" : ""}`}
          >
            <ClipboardCheck className="h-2.5 w-2.5" />
            {pendingCount}
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground/40 w-6 text-center">—</span>
        )}
      </div>

      {/* Progress */}
      <div className="hidden md:flex items-center gap-2 min-w-[140px] shrink-0">
        <Progress value={pProgress} className={cn("h-1.5 rounded-full flex-1", getProgressColor(pProgress))} />
        <span className={cn("text-[11px] font-bold tabular-nums w-8 text-right", pProgress < 30 ? "text-red-600 dark:text-red-400" : pProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
          {pProgress}%
        </span>
      </div>

      {/* Deadline */}
      <div className="hidden lg:block shrink-0 min-w-[90px]">
        {pDeadline ? (
          <p className="text-[12px] text-muted-foreground">{safeDate(pDeadline, "No date")}</p>
        ) : (
          <p className="text-[12px] text-muted-foreground/50">—</p>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="sm" className="h-7 w-7" onClick={onView} title="View" aria-label="View project">
          <ArrowUpDown className="h-3.5 w-3.5" />
        </Button>
        {isAdminUser && onEdit && onDelete && (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7" onClick={(e) => onEdit(project, e)} title="Edit" aria-label="Edit project">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={(e) => onDelete(safeText(project.id, ""), e)} title="Delete" aria-label="Delete project">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ━━ Searchable Client Select (Combobox) ━━
// Shows "No Client" option + 10 most recent clients by default.
// Typing in the search box filters the full client list.
function ClientSearchSelect({
  name,
  defaultValue,
  clients,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  clients: Array<{ id: string; name: string; company?: string }>;
  required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultValue || "");
  const ref = useRef<HTMLDivElement>(null);

  // Sync when parent prefills from ?clientId=
  useEffect(() => {
    if (defaultValue !== undefined) setSelectedId(defaultValue || "");
  }, [defaultValue]);

  // Display name for currently selected client
  const selectedClient = selectedId
    ? clients.find((c) => c.id === selectedId)
    : null;
  const displayValue = selectedClient
    ? selectedClient.company || selectedClient.name
    : selectedId === "__none__"
      ? "No Client (Internal)"
      : "";

  // Filter: "No Client" always shows first, then 10 recent by default, or search results
  const filtered = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q))
      );
    }
    // Default: show 10 most recent
    return clients.slice(0, 10);
  }, [clients, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Hidden input to store the value for form submission */}
      <input type="hidden" name={name} value={selectedId} />

      {/* Trigger button — shows selected value or placeholder */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm bg-background transition-colors",
          "hover:bg-accent hover:border-accent-foreground/20",
          open && "ring-2 ring-ring",
          !selectedId && "text-muted-foreground"
        )}
      >
        <span className="truncate">{displayValue || "Select client..."}</span>
        <Search className="h-3.5 w-3.5 shrink-0 ml-2 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-[240px] overflow-hidden">
          {/* Search input */}
          <div className="p-1.5 border-b">
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 rounded border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-[170px] p-1">
            {/* "No Client" option */}
            <button
              type="button"
              className={cn(
                "w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors",
                selectedId === "__none__"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-accent"
              )}
              onClick={() => {
                setSelectedId("__none__");
                setOpen(false);
                setSearch("");
              }}
            >
              <span className="text-muted-foreground italic">No Client (Internal)</span>
            </button>

            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground text-center">
                {search ? "No clients found" : "No clients registered"}
              </p>
            )}

            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors",
                  selectedId === c.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-accent"
                )}
                onClick={() => {
                  setSelectedId(c.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="font-medium">{c.company || c.name}</span>
                {c.company && c.name !== c.company && (
                  <span className="text-muted-foreground ml-1.5 text-xs">({c.name})</span>
                )}
              </button>
            ))}

            {!search && clients.length > 10 && (
              <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground text-center border-t mt-1">
                Showing 10 recent — type to search all {clients.length} clients
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ━━ Helper: Calculate and format period between two dates ━━
function calcProjectPeriod(startDate: string, deadline: string): string | null {
  if (!startDate || !deadline) return null;
  const start = new Date(startDate);
  const end = new Date(deadline);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return "Start date is after deadline";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "Same day";
  const months = Math.floor(days / 30);
  const remainDays = days % 30;
  if (months > 0 && remainDays > 0) return `${months}m ${remainDays}d (${days} days)`;
  if (months > 0) return `${months}m (${days} days)`;
  return `${days} days`;
}

// ━━ Create Project Form with Start Date + Total Period ━━
function CreateProjectForm({ onSubmit, clients, defaultClientId }: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  clients: { id: string; name: string; company?: string }[];
  defaultClientId?: string;
}) {
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const period = useMemo(() => calcProjectPeriod(startDate, deadline), [startDate, deadline]);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Project Name *</Label>
        <Input name="name" required />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea name="description" rows={2} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Client</Label>
        <ClientSearchSelect name="clientId" clients={clients} defaultValue={defaultClientId} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input name="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Deadline</Label>
          <Input name="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>
      {period && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">Total Period: {period}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Budget ({CURRENCY_SYMBOL})</Label>
          <Input name="budget" type="number" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Live URL</Label>
          <Input name="liveUrl" type="url" placeholder="https://example.com" />
        </div>
      </div>
      <Button type="submit" className="w-full">Create Project</Button>
    </form>
  );
}

export default function ProjectsPage() {
  return <ProjectsBoard />;
}

// ━━ ProjectsBoard ━━
// Shared board implementation used by both /dashboard/projects (isDemoView=false)
// and /dashboard/demo (isDemoView=true). Demo view filters to isDemo projects,
// shows a DEMO badge in the header, and defaults new projects to isDemo=true.
export function ProjectsBoard({ isDemoView = false }: { isDemoView?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [prefillClientId, setPrefillClientId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const isMobile = useIsMobile();
  // Force "list" view on mobile; respect user preference on desktop.
  const effectiveView: "board" | "list" = isMobile ? "list" : viewMode;

  // Read saved view mode from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem("project-view-mode");
    if (saved === "board" || saved === "list") setViewMode(saved);
  }, []);

  const handleViewModeChange = useCallback((mode: "board" | "list") => {
    setViewMode(mode);
    localStorage.setItem("project-view-mode", mode);
  }, []);

  // ━━ React Query — cached fetch with stale-while-revalidate ━━
  // Query key includes isDemoView so the two views maintain independent caches;
  // mutations invalidate with the root ["projects"] key to refresh both.
  const projectsQueryKey = useMemo(
    () => ["projects", { demo: isDemoView }] as const,
    [isDemoView]
  );
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery({
    queryKey: projectsQueryKey,
    queryFn: async () => {
      // Task 7 (Phase 4): main projects page excludes demo projects — they
      // live exclusively on /dashboard/demo. Explicit ?isDemo=false mirrors
      // the new API default and keeps the intent obvious at the call site.
      const url = isDemoView ? "/api/projects?isDemo=true" : "/api/projects?isDemo=false";
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      return deepSanitize(raw) as unknown[];
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: clientsData = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const projects = projectsData;
  const clients = clientsData;

  // PROJECT_MANAGER has the same project-management capabilities as ADMIN
  // per requirements ("Projects: ✅ Full (like admin) — Can manage all projects").
  const isAdminUser = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN" || session?.user?.role === "PROJECT_MANAGER";

  // Deep-link from Clients: /dashboard/projects?clientId=xxx → open create with client prefilled
  useEffect(() => {
    if (!isAdminUser || isDemoView) return;
    const clientId = searchParams.get("clientId");
    if (!clientId) return;
    setPrefillClientId(clientId);
    setAddOpen(true);
    // Clear query so refresh doesn't re-open forever
    router.replace("/dashboard/projects", { scroll: false });
  }, [isAdminUser, isDemoView, searchParams, router]);

  // Feature 3: Credentials state
  const [credentials, setCredentials] = useState<{ id: string; title: string; username: string; hasPassword?: boolean }[]>([]);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [newCred, setNewCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [editingCred, setEditingCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [deleteCredId, setDeleteCredId] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  // Feature 4: Project Methods management state
  const [projectMethods, setProjectMethods] = useState<{ id: string; name: string }[]>([]);
  const [methodLoading, setMethodLoading] = useState(false);
  const [methodSaving, setMethodSaving] = useState(false);
  const [newMethodName, setNewMethodName] = useState("");
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editingMethodName, setEditingMethodName] = useState("");
  const [deleteMethodTarget, setDeleteMethodTarget] = useState<{ id: string; name: string } | null>(null);

  // Project method assignments (when editing a project)
  const [assignedMethodIds, setAssignedMethodIds] = useState<string[]>([]);
  const [methodAssignLoading, setMethodAssignLoading] = useState(false);

  // ━━ Project Methods CRUD Handlers ━━
  const fetchProjectMethods = useCallback(async () => {
    if (!isAdminUser) return;
    setMethodLoading(true);
    try {
      const res = await fetch("/api/project-methods", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const methods: { id: string; name: string }[] = Array.isArray(data) ? data : [];
        setProjectMethods(methods);
        // Seed defaults if empty
        if (methods.length === 0) {
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
  }, [isAdminUser]);

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

  // ━━ Project Method Assignment Handlers ━━
  const fetchProjectAssignedMethods = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/methods`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAssignedMethodIds(Array.isArray(data) ? data.map((m: { id: string }) => m.id) : []);
      }
    } catch { /* silent */ }
  }, []);

  const handleSaveProjectMethods = useCallback(async () => {
    if (!editProject) return;
    setMethodAssignLoading(true);
    try {
      const res = await fetch(`/api/projects/${safeText(editProject.id, "")}/methods`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ methodIds: assignedMethodIds }),
      });
      if (res.ok) {
        toast.success("Project methods updated");
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to update project methods");
      }
    } catch {
      toast.error("Failed to update project methods");
    } finally {
      setMethodAssignLoading(false);
    }
  }, [editProject, assignedMethodIds, queryClient]);

  const toggleProjectMethod = useCallback((methodId: string) => {
    setAssignedMethodIds((prev) =>
      prev.includes(methodId)
        ? prev.filter((id) => id !== methodId)
        : [...prev, methodId]
    );
  }, []);

  // Fetch project methods on mount (admin only)
  useEffect(() => {
    if (sessionStatus === "authenticated" && isAdminUser) {
      fetchProjectMethods();
    }
  }, [sessionStatus, isAdminUser, fetchProjectMethods]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  // ━━ Fetch credentials for a project (passwords never included in list) ━━
  const fetchCredentials = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/credentials?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCredentials(Array.isArray(data) ? data : []);
        setRevealedPasswords({});
        setShowPasswords({});
      }
    } catch {
      // silently fail
    }
  }, []);

  const revealProjectCredential = useCallback(async (credId: string): Promise<string | null> => {
    if (revealedPasswords[credId]) return revealedPasswords[credId];
    try {
      const res = await fetch("/api/projects/credentials/reveal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: credId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to reveal password");
        return null;
      }
      const data = await res.json();
      const password = typeof data.password === "string" ? data.password : "";
      if (!password) {
        toast.error("Failed to reveal password");
        return null;
      }
      setRevealedPasswords((prev) => ({ ...prev, [credId]: password }));
      return password;
    } catch {
      toast.error("Failed to reveal password");
      return null;
    }
  }, [revealedPasswords]);

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    let clientId = form.get("clientId") as string;

    // "No Client" means skip client requirement — the API will handle it
    if (!clientId || clientId === "__none__") {
      clientId = "";
    }

    const data = {
      name: form.get("name") as string,
      description: (form.get("description") as string) || undefined,
      clientId,
      budget: form.get("budget") ? parseFloat(form.get("budget") as string) || null : null,
      startDate: (form.get("startDate") as string) || null,
      deadline: (form.get("deadline") as string) || null,
      // Demo view: new projects default to isDemo=true so they appear on /dashboard/demo
      ...(isDemoView ? { isDemo: true } : {}),
    };
    const liveUrl = (form.get("liveUrl") as string)?.trim();

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const newProject = await res.json().catch(() => null);
        const newProjectId = newProject?.id;
        // If live URL was provided, create a website entry
        if (liveUrl && newProjectId) {
          try {
            await fetch(`/api/projects/${newProjectId}/websites`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ url: liveUrl, label: "Production", isPrimary: true }),
            });
          } catch {
            // silently fail — project was created
          }
        }
        toast.success("Project created");
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error((errData as Record<string, string>)?.error?.slice(0, 100) || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleEditProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProject) return;

    const form = new FormData(e.currentTarget);
    const nextIsDemo = form.get("isDemo") === "on";
    const wasDemo = editProject.isDemo === true;
    // Confirm before moving a demo project back to the main Projects board
    if (wasDemo && !nextIsDemo) {
      const ok = window.confirm(
        "Remove Demo flag? This project will leave Demo Projects and appear on the main Projects board."
      );
      if (!ok) return;
    }
    const data: Record<string, unknown> = {
      id: editProject.id,
      name: form.get("name") as string,
      description: form.get("description") as string || null,
      status: form.get("status") as string,
      clientId: (form.get("clientId") as string === "__none__" ? null : form.get("clientId") as string) || null,
      budget: parseFloat(form.get("budget") as string) || null,
      startDate: form.get("startDate") as string || null,
      deadline: form.get("deadline") as string || null,
      progress: parseInt(form.get("progress") as string) || 0,
      isDemo: nextIsDemo,
    };
    const liveUrl = (form.get("liveUrl") as string)?.trim();

    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        // Update website if live URL changed
        const projectWebsites = (editProject.websites as Record<string, unknown>[] | undefined) || [];
        const primaryWebsite = projectWebsites.find((w) => w.isPrimary === true || w.isPrimary === "true") || projectWebsites[0];
        const currentUrl = primaryWebsite ? safeText(primaryWebsite.url, "") : "";
        const primaryId = primaryWebsite ? safeText(primaryWebsite.id, "") : "";

        if (liveUrl && liveUrl !== currentUrl) {
          // Update existing primary website or create new
          if (primaryId) {
            try {
              await fetch(`/api/projects/${editProject.id}/websites`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id: primaryId, url: liveUrl, isPrimary: true }),
              });
            } catch { /* silent */ }
          } else {
            try {
              await fetch(`/api/projects/${editProject.id}/websites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ url: liveUrl, label: "Production", isPrimary: true }),
              });
            } catch { /* silent */ }
          }
        } else if (!liveUrl && currentUrl && primaryId) {
          // URL was cleared — remove the website
          try {
            await fetch(`/api/projects/${editProject.id}/websites?id=${primaryId}`, {
              method: "DELETE",
              credentials: "include",
            });
          } catch { /* silent */ }
        }

        toast.success("Project updated");
        setEditOpen(false);
        setEditProject(null);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error((errData as Record<string, string>)?.error?.slice(0, 100) || "Failed to update project");
      }
    } catch {
      toast.error("Failed to update project");
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/projects?id=${deleteId}`, {
        method: "DELETE",
        credentials: 'include',
      });
      if (res.ok) {
        toast.success("Project deleted successfully");
        queryClient.setQueryData(projectsQueryKey, (old: unknown[]) =>
          (old || []).filter((p: any) => p.id !== deleteId)
        );
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error((errData as Record<string, string>)?.error?.slice(0, 100) || "Failed to delete project");
      }
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeleteId(null);
    }
  };

  const openEditDialog = (project: Record<string, unknown>, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditProject(project);
    setEditOpen(true);
    fetchCredentials(safeText(project.id, ""));
    fetchProjectAssignedMethods(safeText(project.id, ""));
    setShowPasswords({});
    setNewCred({ title: "", username: "", password: "" });
    setEditingCredId(null);
  };

  const openDeleteDialog = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(projectId);
  };

  // ━━ Prefetch project detail data on hover (Task 2: fast navigation) ━━
  const handlePrefetchProject = useCallback((pid: string) => {
    if (!pid) return;
    queryClient.prefetchQuery({
      queryKey: ["project", pid],
      queryFn: async () => {
        const res = await fetch(`/api/projects?projectId=${pid}`, { credentials: "include" });
        if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
        if (!res.ok) throw new Error("Failed to load project");
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) return raw[0];
        if (raw && typeof raw === "object" && raw.id) return raw;
        return null;
      },
      staleTime: 30 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: ["project-members", pid],
      queryFn: async () => {
        const res = await fetch(`/api/projects/${pid}/members`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load members");
        const md = await res.json();
        return Array.isArray(md) ? md : (Array.isArray(md?.data) ? md.data : []);
      },
      staleTime: 30 * 1000,
    });
  }, [queryClient]);

  // ━━ Credential handlers ━━
  const handleAddCredential = async () => {
    if (!editProject || !newCred.title.trim() || !newCred.username.trim() || !newCred.password.trim()) {
      toast.error("All credential fields are required");
      return;
    }
    try {
      const res = await fetch("/api/projects/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: editProject.id, ...newCred }),
      });
      if (res.ok) {
        toast.success("Credential added");
        setNewCred({ title: "", username: "", password: "" });
        fetchCredentials(safeText(editProject.id, ""));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to add credential");
      }
    } catch {
      toast.error("Failed to add credential");
    }
  };

  const handleUpdateCredential = async () => {
    if (!editingCredId || !editingCred.title.trim() || !editingCred.username.trim()) {
      toast.error("Title and username are required");
      return;
    }
    try {
      // Only send password if the user explicitly changed it
      const payload: Record<string, unknown> = { id: editingCredId, title: editingCred.title, username: editingCred.username };
      if (passwordChanged && editingCred.password) {
        payload.password = editingCred.password;
      }
      const res = await fetch("/api/projects/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Credential updated");
        setEditingCredId(null);
        if (editProject) fetchCredentials(safeText(editProject.id, ""));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to update credential");
      }
    } catch {
      toast.error("Failed to update credential");
    }
  };

  const handleDeleteCredential = async () => {
    if (!deleteCredId) return;
    try {
      const res = await fetch(`/api/projects/credentials?id=${deleteCredId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Credential removed");
        if (editProject) fetchCredentials(safeText(editProject.id, ""));
      }
    } catch {
      toast.error("Failed to delete credential");
    } finally {
      setDeleteCredId(null);
    }
  };

  // ━━ DnD handlers ━━
  const handleDragStart = (event: DragStartEvent) => {
    if (updating || !isAdminUser) return;
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    if (!isAdminUser) return;
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const overId = String(over.id);
    // Drop on column OR on another card in a column
    let newStatus = VALID_STATUSES.includes(overId) ? overId : "";
    if (!newStatus) {
      const overProject = (projects as Record<string, unknown>[]).find(
        (p) => safeText(p.id, "") === overId
      );
      newStatus = overProject ? safeText(overProject.status, "") : "";
    }
    if (!newStatus || !VALID_STATUSES.includes(newStatus)) return;

    const project = (projects as Record<string, unknown>[]).find((p) => safeText(p.id, "") === projectId);
    if (!project) return;

    const currentStatus = safeText(project.status, "");
    if (currentStatus === newStatus) return;

    const prevProjects = projects;

    setUpdating(true);
    queryClient.setQueryData(projectsQueryKey, (old: unknown[]) =>
      (old || []).map((p) =>
        safeText((p as Record<string, unknown>).id, "") === projectId
          ? { ...(p as Record<string, unknown>), status: newStatus }
          : p
      )
    );

    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: projectId, status: newStatus }),
      });
      if (handle401(res)) {
        queryClient.setQueryData(projectsQueryKey, prevProjects);
        return;
      }
      if (!res.ok) {
        queryClient.setQueryData(projectsQueryKey, prevProjects);
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to move project");
      } else {
        toast.success(`Project moved to ${newStatus.replace("_", " ")}`);
      }
    } catch {
      queryClient.setQueryData(projectsQueryKey, prevProjects);
      toast.error("Failed to move project");
    } finally {
      setUpdating(false);
    }
  };

  const filtered = (projects as Record<string, unknown>[]).filter((p) => {
    const pName = safeText(p.name, "");
    const pStatus = safeText(p.status, "");
    const pClient = p.client as Record<string, unknown> | undefined;
    const pClientName = pClient ? safeText(pClient.name, "") : "";
    const matchesFilter = filter === "ALL" || pStatus === filter;
    const searchLower = search.toLowerCase();
    const matchesSearch = !search || pName.toLowerCase().includes(searchLower) || pClientName.toLowerCase().includes(searchLower) || pStatus.toLowerCase().includes(searchLower);
    return matchesFilter && matchesSearch;
  });

  // ━━ Group filtered projects into Kanban columns (reorder: IN_PROGRESS first, COMPLETED last) ━━
  const kanbanColumns = useMemo(() => {
    if (filter !== "ALL") {
      // When a specific status is selected, show only that column
      return KANBAN_COLUMNS.filter((col) => col.key === filter).map((col) => ({
        ...col,
        projects: (filtered as Record<string, unknown>[]).filter(
          (p) => safeText(p.status, "") === col.key
        ),
      }));
    }
    // ALL: reorder columns — IN_PROGRESS first, PLANNING middle, COMPLETED last
    return [...KANBAN_COLUMNS]
      .sort((a, b) => (COLUMN_DISPLAY_ORDER[a.key] ?? 99) - (COLUMN_DISPLAY_ORDER[b.key] ?? 99))
      .map((col) => ({
        ...col,
        projects: (filtered as Record<string, unknown>[]).filter(
          (p) => safeText(p.status, "") === col.key
        ),
      }));
  }, [filtered, filter]);

  // ━━ Stats computation ━━
  const totalProjects = projects.length;
  const inProgressCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "IN_PROGRESS").length;
  const reviewCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "REVIEW").length;
  const completedCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "COMPLETED").length;

  // ━━ Loading skeleton ━━
  if (sessionStatus === "loading" || projectsLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        {/* Stats bar skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-2.5 sm:p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        {/* Filter skeleton */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="flex gap-4 overflow-hidden">
          {KANBAN_COLUMNS.slice(0, 4).map((col) => (
            <div key={col.key} className="flex-shrink-0 w-[280px] space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-lg animate-pulse" />
              <Skeleton className="h-36 w-full rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ━━━━ Header ━━━━ */}
      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <LayoutGrid className="h-4.5 w-4.5 text-primary" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">
            {isDemoView ? "Demo Projects" : "Projects"}
          </h1>
          {isDemoView && (
            <Badge className="ml-1 text-[10px] font-bold tracking-wider px-2 py-0.5 border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 shadow-sm" title="Demo projects are full-fledged projects used for walkthroughs and demos">
              DEMO
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Inline Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-48 h-8 text-sm bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50 focus:bg-white dark:focus:bg-white/[0.06] transition-all"
              aria-label="Search projects"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* View Toggle — only shown on desktop (>= 768px). Mobile always uses list view. */}
          {!isMobile && (
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(val) => { if (val) handleViewModeChange(val as "board" | "list"); }}
              className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/80 dark:border-gray-700/50"
            >
              <ToggleGroupItem value="board" className="h-8 gap-1.5 text-xs px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary" aria-label="Board view">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Board</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="list" className="h-8 gap-1.5 text-xs px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary" aria-label="List view">
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          {/* New Project */}
          {isAdminUser && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-primary shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02]">
                <Plus className="h-3.5 w-3.5" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>
                  {isDemoView
                    ? "Creating in Demo Projects — this project will appear on the Demo board."
                    : "Create a new web development project for your client."}
                </DialogDescription>
              </DialogHeader>
              <CreateProjectForm
                onSubmit={handleCreateProject}
                clients={clients as { id: string; name: string; company?: string }[]}
                defaultClientId={prefillClientId || undefined}
              />
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* ━━━━ Stats Bar — Glassmorphism, 4 stats ━━━━ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-xl font-bold tracking-tight">{totalProjects}</p>
        </div>
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-blue-200/40 dark:border-blue-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">In Progress</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{inProgressCount}</p>
        </div>
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-yellow-200/40 dark:border-yellow-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <CircleDot className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Review</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-yellow-600 dark:text-yellow-400">{reviewCount}</p>
        </div>
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-emerald-200/40 dark:border-emerald-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Completed</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{completedCount}</p>
        </div>
      </div>

      {/* ━━━━ Filter Bar — Horizontal scrollable pills ━━━━ */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {["ALL", "PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"].map((s) => {
          const isActive = filter === s;
          const dotColor = s === "ALL" ? "bg-gray-400" : statusDotColors[s] || "bg-gray-400";
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/80 dark:border-gray-700/50 text-muted-foreground hover:bg-white dark:hover:bg-white/[0.07] hover:text-foreground"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-primary-foreground/80" : dotColor)} />
              {s === "ALL" ? "All" : s.replace("_", " ")}
            </button>
          );
        })}
      </div>

      {/* ━━━━ Main Content Area ━━━━ */}
      {filtered.length === 0 ? (
        <div className="text-center py-24">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
            <FolderKanban className="h-8 w-8 text-primary/40" />
          </div>
          <p className="text-lg font-bold text-foreground/80">
            {projects.length === 0
              ? (isDemoView ? "No demo projects yet" : "No projects yet")
              : "No projects match your search"}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-sm mx-auto">
            {projects.length === 0
              ? (isDemoView ? "Create a demo project to showcase walkthroughs and examples" : "Get started by creating your first project")
              : "Try adjusting your search or filter criteria"}
          </p>
          {projects.length === 0 && isAdminUser && (
            <Button variant="outline" className="mt-5 gap-2 shadow-sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> {isDemoView ? "Create your first demo project" : "Create your first project"}
            </Button>
          )}
        </div>
      ) : effectiveView === "board" ? (
        /* ━━ Kanban Board View ━━ */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory">
            {kanbanColumns.map((col) => {
              const isDimmed = filter !== "ALL" && filter !== col.key;
              return (
                <DroppableKanbanColumn
                  key={col.key}
                  col={col}
                  projects={col.projects}
                  isAdminUser={isAdminUser}
                  onCardClick={(project) => {
                    const pId = safeText(project.id, "");
                    // Demo projects manage from /dashboard/demo, regular from /dashboard/projects
                    router.push(isDemoView ? `/dashboard/demo/${pId}` : `/dashboard/projects/${pId}`);
                  }}
                  onEdit={openEditDialog}
                  onDelete={openDeleteDialog}
                  isDimmed={isDimmed}
                  activeId={activeId}
                  onHover={handlePrefetchProject}
                />
              );
            })}
          </div>
          {/* DragOverlay — visual floating card during drag */}
          <DragOverlay dropAnimation={null}>
            {activeId ? (() => {
              const project = (filtered as Record<string, unknown>[]).find(
                (p) => safeText(p.id, "") === activeId
              );
              return project ? (
                <KanbanProjectCard
                  project={project}
                  onClick={() => {}}
                  isAdminUser={false}
                  isDragging={true}
                />
              ) : null;
            })() : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* ━━ List View ━━ */
        <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
          {[...(filtered as Record<string, unknown>[])].sort((a, b) => {
            const orderA = COLUMN_DISPLAY_ORDER[safeText(a.status, "")] ?? 99;
            const orderB = COLUMN_DISPLAY_ORDER[safeText(b.status, "")] ?? 99;
            return orderA - orderB;
          }).map((project) => {
            const pId = safeText(project.id, "");
            return (
              <ListViewRow
                key={pId}
                project={project}
                isAdminUser={isAdminUser}
                onView={() => {
                  handlePrefetchProject(pId);
                  router.push(isDemoView ? `/dashboard/demo/${pId}` : `/dashboard/projects/${pId}`);
                }}
                onEdit={isAdminUser ? openEditDialog : undefined}
                onDelete={isAdminUser ? openDeleteDialog : undefined}
                onPendingClick={() => {
                  handlePrefetchProject(pId);
                  router.push(isDemoView ? `/dashboard/demo/${pId}` : `/dashboard/projects/${pId}`);
                }}
              />
            );
          })}
        </div>
      )}

      {/* ━━━━ Floating Task Boards are now rendered in DashboardLayout ━━━━ */}

      {/* ━━━━ Edit Project Dialog with Tabs ━━━━ */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditProject(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update project details, credentials, and methods.</DialogDescription></DialogHeader>
          {editProject && (
            <Tabs defaultValue="details">
              <TabsList className={cn("grid w-full bg-muted/50 p-1", isAdminUser ? "grid-cols-3" : "grid-cols-2")}>
                <TabsTrigger value="details" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all text-xs">
                  <Pencil className="h-3 w-3" /> Details
                </TabsTrigger>
                <TabsTrigger value="credentials" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all text-xs">
                  <Key className="h-3 w-3" /> Credentials
                </TabsTrigger>
                {isAdminUser && (
                <TabsTrigger value="methods" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all text-xs">
                  <Settings className="h-3 w-3" /> Methods
                </TabsTrigger>
                )}
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details">
                <div className="rounded-lg bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 mt-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5" /> Project Information
                  </h3>
                  <form onSubmit={handleEditProject} className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Project Name *</Label>
                      <Input name="name" defaultValue={typeof editProject.name === 'string' ? editProject.name : ''} required />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea name="description" rows={2} defaultValue={typeof editProject.description === 'string' ? editProject.description : ''} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Client</Label>
                      <ClientSearchSelect
                        name="clientId"
                        defaultValue={typeof editProject.clientId === 'string' ? editProject.clientId : ''}
                        clients={(clients as { id: string; name: string; company?: string }[])}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Status</Label>
                        <select name="status" defaultValue={typeof editProject.status === 'string' ? editProject.status : 'PLANNING'} className="border rounded px-3 py-2 text-sm bg-background w-full">
                          {VALID_STATUSES.map((s) => (
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Progress (%)</Label>
                        <Input name="progress" type="number" min={0} max={100} defaultValue={typeof editProject.progress === 'number' ? editProject.progress : 0} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Budget ({CURRENCY_SYMBOL}) <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                        <Input name="budget" type="number" step="any" min="0" placeholder="0.00" defaultValue={editProject.budget != null ? Number(editProject.budget) : ''} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Live URL <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                        <Input
                          name="liveUrl"
                          type="url"
                          placeholder="https://example.com"
                          defaultValue={(() => {
                            const ws = (editProject.websites as Record<string, unknown>[] | undefined) || [];
                            const primary = ws.find((w) => w.isPrimary === true || w.isPrimary === "true") || ws[0];
                            return primary ? safeText(primary.url, "") : "";
                          })()}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Date <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                        <Input name="startDate" type="date" defaultValue={editProject.startDate ? String(editProject.startDate).slice(0, 10) : ''} id="edit-start-date" onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const deadlineInput = document.getElementById("edit-deadline") as HTMLInputElement | null;
                          const sd = e.target.value;
                          const dl = deadlineInput?.value || "";
                          const period = calcProjectPeriod(sd, dl);
                          const el = document.getElementById("edit-period-display");
                          if (el) el.style.display = period ? "" : "none";
                          if (el) el.textContent = period ? `Total Period: ${period}` : "";
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Deadline <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                        <Input name="deadline" type="date" defaultValue={editProject.deadline ? String(editProject.deadline).slice(0, 10) : ''} id="edit-deadline" onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const startInput = document.getElementById("edit-start-date") as HTMLInputElement | null;
                          const sd = startInput?.value || "";
                          const dl = e.target.value;
                          const period = calcProjectPeriod(sd, dl);
                          const el = document.getElementById("edit-period-display");
                          if (el) el.style.display = period ? "" : "none";
                          if (el) el.textContent = period ? `Total Period: ${period}` : "";
                        }} />
                      </div>
                    </div>
                    <div id="edit-period-display" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10" style={{ display: (() => {
                      const sd = editProject.startDate ? String(editProject.startDate).slice(0, 10) : '';
                      const dl = editProject.deadline ? String(editProject.deadline).slice(0, 10) : '';
                      return calcProjectPeriod(sd, dl) ? "" : "none";
                    })() }}>
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">{(() => {
                        const sd = editProject.startDate ? String(editProject.startDate).slice(0, 10) : '';
                        const dl = editProject.deadline ? String(editProject.deadline).slice(0, 10) : '';
                        const p = calcProjectPeriod(sd, dl);
                        return p ? `Total Period: ${p}` : "";
                      })()}</span>
                    </div>
                    <div className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        id="edit-is-demo"
                        name="isDemo"
                        defaultChecked={editProject.isDemo === true}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                      />
                      <Label htmlFor="edit-is-demo" className="text-xs cursor-pointer select-none">
                        Demo Project <span className="text-muted-foreground font-normal">(shows under Demo Projects)</span>
                      </Label>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditProject(null); }}>Cancel</Button>
                      <Button type="submit" className="flex-1">Save Changes</Button>
                    </div>
                  </form>
                </div>
              </TabsContent>

              {/* Credentials Tab */}
              <TabsContent value="credentials">
                <div className="rounded-lg bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 mt-4 space-y-4">
                  {/* Add new credential */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Key className="h-3.5 w-3.5" /> Add New Credential
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input placeholder="Title (e.g., Hosting Login)" value={newCred.title} onChange={(e) => setNewCred({ ...newCred, title: e.target.value })} className="h-8 text-sm" />
                      <Input placeholder="Username / Email" value={newCred.username} onChange={(e) => setNewCred({ ...newCred, username: e.target.value })} className="h-8 text-sm" />
                      <Input placeholder="Password" type="password" value={newCred.password} onChange={(e) => setNewCred({ ...newCred, password: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <Button type="button" size="sm" onClick={handleAddCredential} disabled={!newCred.title.trim() || !newCred.username.trim() || !newCred.password.trim()} className="h-8">
                      <Plus className="h-3 w-3 mr-1" /> Add Credential
                    </Button>
                  </div>

                  {/* Existing credentials */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Key className="h-3.5 w-3.5" /> Stored Credentials
                    </h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {credentials.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">No credentials stored</p>
                    )}
                    {credentials.map((cred) => (
                      <div key={cred.id} className="border rounded-lg p-3 space-y-2 bg-white/40 dark:bg-white/[0.02]">
                        {editingCredId === cred.id ? (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <Input value={editingCred.title} onChange={(e) => setEditingCred({ ...editingCred, title: e.target.value })} className="h-8 text-sm" />
                              <Input value={editingCred.username} onChange={(e) => setEditingCred({ ...editingCred, username: e.target.value })} className="h-8 text-sm" />
                              <Input value={editingCred.password} onChange={(e) => { setEditingCred({ ...editingCred, password: e.target.value }); setPasswordChanged(true); }} className="h-8 text-sm" placeholder="Enter new password (leave blank to keep)" />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" className="h-7" onClick={handleUpdateCredential}>Save</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setEditingCredId(null)}>Cancel</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium">{cred.title}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7" onClick={() => { setEditingCredId(cred.id); setEditingCred({ title: cred.title, username: cred.username, password: "" }); setPasswordChanged(false); }} title="Edit">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500" onClick={() => setDeleteCredId(cred.id)} title="Delete">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>Username: <span className="font-mono text-foreground">{cred.username}</span></span>
                              <span className="hidden sm:inline mx-1">&bull;</span>
                              <span>Password: <span className="font-mono text-foreground">{showPasswords[cred.id] && revealedPasswords[cred.id] ? revealedPasswords[cred.id] : "••••••••"}</span></span>
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5 ml-auto" onClick={async () => {
                                if (showPasswords[cred.id]) {
                                  setShowPasswords({ ...showPasswords, [cred.id]: false });
                                  return;
                                }
                                const pwd = await revealProjectCredential(cred.id);
                                if (pwd) setShowPasswords({ ...showPasswords, [cred.id]: true });
                              }} title={showPasswords[cred.id] ? "Hide" : "Show"} aria-label={showPasswords[cred.id] ? "Hide password" : "Show password"}>
                                {showPasswords[cred.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5" onClick={async () => {
                                const pwd = await revealProjectCredential(cred.id);
                                if (!pwd) return;
                                try { await navigator.clipboard.writeText(pwd); toast.success("Copied"); } catch { toast.error("Failed to copy to clipboard"); }
                              }} title="Copy" aria-label="Copy password">
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Methods Tab — admin only */}
              {isAdminUser && (
              <TabsContent value="methods">
                <div className="rounded-lg bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 mt-4 space-y-4">

                  {/* Section 1: Assign methods to this project */}
                  {editProject && (
                    <div className="space-y-3 pb-4 border-b border-white/20 dark:border-white/10">
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
                  )}

                  {/* Section 2: Manage All Methods */}
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
                </div>
              </TabsContent>
              )}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ━━━━ Delete Project Confirmation ━━━━ */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and ALL related data including tasks, team members, time entries, expenses, and invoices. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-red-600 hover:bg-red-700">
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ━━━━ Credential Delete Confirmation ━━━━ */}
      <AlertDialog open={!!deleteCredId} onOpenChange={() => setDeleteCredId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this credential. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCredential} className="bg-red-600 hover:bg-red-700">
              Delete Credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ━━━━ Method Delete Confirmation ━━━━ */}
      <AlertDialog open={!!deleteMethodTarget} onOpenChange={(open) => { if (!open) setDeleteMethodTarget(null); }}>
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
    </div>
  );
}
