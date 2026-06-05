"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Paperclip, Key, Eye, EyeOff, Copy, Download, Upload, X, Activity, CheckCircle2,
  LayoutGrid, ClipboardCheck, List, ArrowUpDown, CircleDot, ExternalLink, Globe,
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
          {pClientName}
        </span>
      </div>

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
              href={safeText(pWebsites[0].url, "")}
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
                      <a href={wUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
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
  pendingTaskCounts,
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
  pendingTaskCounts?: Record<string, number>;
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
                pendingCount={pendingTaskCounts?.[pId]}
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
          <p className="text-[11px] text-muted-foreground">{pClientName}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="hidden sm:block shrink-0">
        <Badge className={`text-[10px] px-2 py-0.5 font-medium ${statusColors[pStatus] || ""}`}>
          {pStatus.replace("_", " ")}
        </Badge>
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

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("projects-view-mode") as "board" | "list") || "board";
    }
    return "board";
  });

  const handleViewModeChange = useCallback((mode: "board" | "list") => {
    setViewMode(mode);
    localStorage.setItem("projects-view-mode", mode);
  }, []);

  // ━━ React Query — cached fetch with stale-while-revalidate ━━
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      return deepSanitize(raw) as unknown[];
    },
    staleTime: 60 * 1000,
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
    retry: 1,
  });

  // ━━ Pending task counts per project (lightweight count endpoint) ━━
  const { data: taskCountsData } = useQuery({
    queryKey: ["task-counts"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/counts", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load task counts");
      const data = await res.json();
      return data as Record<string, number>;
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  const projects = projectsData;
  const clients = clientsData;
  const pendingTaskCounts = taskCountsData || {};

  const isAdminUser = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  // Feature 3: Attachments & Credentials state
  const [attachments, setAttachments] = useState<{ id: string; fileName: string; fileSize: number; createdAt: string }[]>([]);
  const [credentials, setCredentials] = useState<{ id: string; title: string; username: string; password: string }[]>([]);
  const [newCred, setNewCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [editingCred, setEditingCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deleteCredId, setDeleteCredId] = useState<string | null>(null);

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

  // ━━ Fetch attachments for a project ━━
  const fetchAttachments = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/attachments?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAttachments(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

  // ━━ Fetch credentials for a project ━━
  const fetchCredentials = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/credentials?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCredentials(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

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
      description: form.get("description") as string,
      clientId,
      budget: parseFloat(form.get("budget") as string) || null,
      deadline: form.get("deadline") as string || null,
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
        queryClient.invalidateQueries({ queryKey: ["task-counts"] });
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleEditProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProject) return;

    const form = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {
      id: editProject.id,
      name: form.get("name") as string,
      description: form.get("description") as string || null,
      status: form.get("status") as string,
      clientId: (form.get("clientId") as string === "__none__" ? null : form.get("clientId") as string) || null,
      budget: parseFloat(form.get("budget") as string) || null,
      deadline: form.get("deadline") as string || null,
      progress: parseInt(form.get("progress") as string) || 0,
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
        queryClient.invalidateQueries({ queryKey: ["task-counts"] });
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to update project");
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
        queryClient.setQueryData(["projects"], (old: unknown[]) =>
          (old || []).filter((p: any) => p.id !== deleteId)
        );
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to delete project");
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
    fetchAttachments(safeText(project.id, ""));
    fetchCredentials(safeText(project.id, ""));
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
      queryKey: ["project-tasks", pid],
      queryFn: async () => {
        const res = await fetch(`/api/tasks?projectId=${pid}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load tasks");
        const td = await res.json();
        return Array.isArray((td as any)?.tasks) ? (td as any).tasks : Array.isArray(td) ? td : (Array.isArray(td?.data) ? td.data : []);
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

  // ━━ File upload handler ━━
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editProject || !e.target.files?.length) return;
    const file = e.target.files[0];
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    setUploadingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/projects/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId: editProject.id,
            fileName: file.name,
            fileData: base64,
            fileSize: file.size,
          }),
        });
        if (res.ok) {
          toast.success("File uploaded");
          fetchAttachments(safeText(editProject.id, ""));
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to upload");
        }
        setUploadingFile(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Failed to read file");
      setUploadingFile(false);
    }
    e.target.value = "";
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/projects/attachments?id=${attachmentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Attachment removed");
        if (editProject) fetchAttachments(safeText(editProject.id, ""));
      }
    } catch {
      toast.error("Failed to delete attachment");
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/projects/attachments?id=${attachmentId}`, {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.fileData}`;
        link.download = data.fileName;
        link.click();
      }
    } catch {
      toast.error("Failed to download");
    }
  };

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
        toast.error(data.error || "Failed to add credential");
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
      const res = await fetch("/api/projects/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: editingCredId, ...editingCred }),
      });
      if (res.ok) {
        toast.success("Credential updated");
        setEditingCredId(null);
        if (editProject) fetchCredentials(safeText(editProject.id, ""));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update credential");
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
    if (updating) return;
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const newStatus = over.id as string;

    if (!VALID_STATUSES.includes(newStatus)) return;

    const project = (projects as Record<string, unknown>[]).find((p) => safeText(p.id, "") === projectId);
    if (!project) return;

    const currentStatus = safeText(project.status, "");
    if (currentStatus === newStatus) return;

    const prevProjects = projects;

    setUpdating(true);
    queryClient.setQueryData(["projects"], (old: unknown[]) =>
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
        queryClient.setQueryData(["projects"], prevProjects);
        return;
      }
      if (!res.ok) {
        queryClient.setQueryData(["projects"], prevProjects);
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error || "Failed to move project");
      } else {
        toast.success(`Project moved to ${newStatus.replace("_", " ")}`);
      }
    } catch {
      queryClient.setQueryData(["projects"], prevProjects);
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
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Projects</h1>
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
          {/* View Toggle */}
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
          {/* My Todos — ghost variant */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hidden sm:inline-flex"
            onClick={() => router.push("/dashboard/projects/todos")}
          >
            <ClipboardCheck className="h-3.5 w-3.5" /> <span className="hidden md:inline">My Todos</span>
          </Button>
          {/* New Project */}
          {isAdminUser && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-primary shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02]">
                <Plus className="h-3.5 w-3.5" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Project</DialogTitle><DialogDescription>Create a new web development project for your client.</DialogDescription></DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-3">
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
                  <ClientSearchSelect
                    name="clientId"
                    clients={(clients as { id: string; name: string; company?: string }[])}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Budget (₹)</Label>
                    <Input name="budget" type="number" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Deadline</Label>
                    <Input name="deadline" type="date" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Live URL</Label>
                  <Input name="liveUrl" type="url" placeholder="https://example.com" />
                </div>
                <Button type="submit" className="w-full">Create Project</Button>
              </form>
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
            {projects.length === 0 ? "No projects yet" : "No projects match your search"}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-sm mx-auto">
            {projects.length === 0 ? "Get started by creating your first project" : "Try adjusting your search or filter criteria"}
          </p>
          {projects.length === 0 && isAdminUser && (
            <Button variant="outline" className="mt-5 gap-2 shadow-sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          )}
        </div>
      ) : viewMode === "board" ? (
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
                    router.push(`/dashboard/projects/${pId}`);
                  }}
                  onEdit={openEditDialog}
                  onDelete={openDeleteDialog}
                  isDimmed={isDimmed}
                  activeId={activeId}
                  onHover={handlePrefetchProject}
                  pendingTaskCounts={pendingTaskCounts}
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
                  pendingCount={pendingTaskCounts[safeText(project.id, "")]}
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
                  router.push(`/dashboard/projects/${pId}`);
                }}
                onEdit={isAdminUser ? openEditDialog : undefined}
                onDelete={isAdminUser ? openDeleteDialog : undefined}
                pendingCount={pendingTaskCounts[pId]}
                onPendingClick={() => {
                  handlePrefetchProject(pId);
                  router.push(`/dashboard/projects/${pId}`);
                }}
              />
            );
          })}
        </div>
      )}

      {/* ━━━━ Edit Project Dialog with Tabs ━━━━ */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditProject(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update project details, attachments, and credentials.</DialogDescription></DialogHeader>
          {editProject && (
            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
                <TabsTrigger value="details" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all text-xs">
                  <Pencil className="h-3 w-3" /> Details
                </TabsTrigger>
                <TabsTrigger value="attachments" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all text-xs">
                  <Paperclip className="h-3 w-3" /> Attachments
                </TabsTrigger>
                <TabsTrigger value="credentials" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all text-xs">
                  <Key className="h-3 w-3" /> Credentials
                </TabsTrigger>
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Budget (₹)</Label>
                        <Input name="budget" type="number" defaultValue={editProject.budget != null ? Number(editProject.budget) : ''} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Deadline</Label>
                        <Input name="deadline" type="date" defaultValue={editProject.deadline ? String(editProject.deadline).slice(0, 10) : ''} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Live URL</Label>
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
                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditProject(null); }}>Cancel</Button>
                      <Button type="submit" className="flex-1">Save Changes</Button>
                    </div>
                  </form>
                </div>
              </TabsContent>

              {/* Attachments Tab */}
              <TabsContent value="attachments">
                <div className="rounded-lg bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5" /> Project Files
                    </h3>
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                        {uploadingFile ? "Uploading..." : <><Upload className="h-3.5 w-3.5" /> Upload PDF</>}
                      </div>
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Upload PDF files for this project (max 10MB)</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {attachments.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">No attachments yet</p>
                    )}
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-2 p-2.5 border rounded-lg bg-white/40 dark:bg-white/[0.02]">
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.fileName}</p>
                          <p className="text-[11px] text-muted-foreground">{formatFileSize(att.fileSize)}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7" onClick={() => handleDownloadAttachment(att.id)} title="Download" aria-label="Download attachment">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500" onClick={() => handleDeleteAttachment(att.id)} title="Delete" aria-label="Delete attachment">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
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
                              <Input value={editingCred.password} onChange={(e) => setEditingCred({ ...editingCred, password: e.target.value })} className="h-8 text-sm" />
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
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7" onClick={() => { setEditingCredId(cred.id); setEditingCred({ title: cred.title, username: cred.username, password: cred.password }); }} title="Edit">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500" onClick={() => setDeleteCredId(cred.id)} title="Delete">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Username: <span className="font-mono text-foreground">{cred.username}</span></span>
                              <span className="mx-1">&bull;</span>
                              <span>Password: <span className="font-mono text-foreground">{showPasswords[cred.id] ? cred.password : "&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"}</span></span>
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5 ml-auto" onClick={() => { setShowPasswords({ ...showPasswords, [cred.id]: !showPasswords[cred.id] }); }} title={showPasswords[cred.id] ? "Hide" : "Show"} aria-label={showPasswords[cred.id] ? "Hide password" : "Show password"}>
                                {showPasswords[cred.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(cred.password); toast.success("Password copied"); }} title="Copy" aria-label="Copy password">
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
              This will permanently delete this project and ALL related data including tasks, team members, time entries, meetings, expenses, and invoices. This action cannot be undone.
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
    </div>
  );
}
