"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, Users, UserPlus, X, CalendarDays, Tag,
  CheckCircle2, ShieldCheck, Activity, Gauge, CircleDot, FolderKanban,
  ChevronRight, ChevronDown, ChevronUp, ExternalLink, Settings, Globe, Star, Pencil, Trash2 as Trash2Icon, Loader2,
  Github, Database, Server, Eye, EyeOff, Copy, Save, Key, FlaskConical, GripVertical, CopyPlus, Layers,
} from "lucide-react";
import { ProjectCredentialsDialog } from "@/components/dashboard/projects/project-credentials-dialog";
import { ProjectMethodsDialog } from "@/components/dashboard/projects/project-methods-dialog";
import { WorkPriorityBadge } from "@/components/dashboard/projects/work-priority-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { safeText, safeNumber, safeDate, deepSanitize, cn, extractStr, extractNum, extractNestedStr } from "@/lib/utils";
import { formatDisplayDateShort, formatDisplayDateWithWeekday } from "@/lib/format";
import { BUILTIN_INFRA_GROUPS, toCustomInfraGroupKey } from "@/lib/infra-groups";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BULLETPROOF v9: Redesigned layout — compact stats row, glassmorphism,
// removed view tabs (My Tasks link in header), horizontal member chips.
// ALL functionality preserved: handlers, RBAC, safe extractors, caching.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const projectStatusColors: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const VALID_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"];

type InfraGroupDef = {
  key: string;
  label: string;
  description: string;
  builtin: boolean;
};

type InfraItem = {
  id: string;
  projectId: string;
  groupKey: string;
  groupLabel?: string;
  label: string;
  isSecret: boolean;
  value: string | null;
  hasValue: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type InfraMemberGrant = {
  userId: string;
  userName: string | null;
  visibleUntil: string | null;
  isActive: boolean;
};

type InfraItemsResponse = {
  groups: Record<string, InfraItem[]>;
  groupDefs?: InfraGroupDef[];
  memberAccess: {
    visibleUntil: string | null;
    isActive: boolean;
    grants?: InfraMemberGrant[];
  };
  canManage: boolean;
  canView: boolean;
};

type InfraItemForm = {
  groupKey: string;
  groupLabel?: string;
  label: string;
  value: string;
  isSecret: boolean;
};

const DEFAULT_INFRA_GROUP_DEFS: InfraGroupDef[] = BUILTIN_INFRA_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  description: g.description,
  builtin: true,
}));

const emptyInfraGroups = (): Record<string, InfraItem[]> =>
  Object.fromEntries(DEFAULT_INFRA_GROUP_DEFS.map((g) => [g.key, []] as const));

/** Monday (UTC) of the week containing dateKey YYYY-MM-DD, as YYYY-MM-DD. */
function weekStartKey(dueIso: string): string {
  const d = new Date(dueIso.includes("T") ? dueIso : `${dueIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "none";
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(mondayKey: string, todayKey: string): string {
  if (mondayKey === "none") return "No due date";
  const thisMonday = weekStartKey(todayKey);
  const next = new Date(`${thisMonday}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextMonday = next.toISOString().slice(0, 10);
  if (mondayKey === thisMonday) return "This week";
  if (mondayKey === nextMonday) return "Next week";
  const mon = new Date(`${mondayKey}T00:00:00.000Z`);
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  const sunKey = sun.toISOString().slice(0, 10);
  const range = `${formatDisplayDateShort(mondayKey)} – ${formatDisplayDateShort(sunKey)}`;
  if (mondayKey < thisMonday) return `Earlier · ${range}`;
  return `Week of ${range}`;
}

function sortMilestonesForDisplay(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return items.slice().sort((a, b) => {
    // Open first; done stay in collapsed section
    const doneDiff = Number(a.done === true) - Number(b.done === true);
    if (doneDiff !== 0) return doneDiff;
    // Admin-arranged order (first → last)
    const sa = extractNum(a, "sortOrder", 0);
    const sb = extractNum(b, "sortOrder", 0);
    if (sa !== sb) return sa - sb;
    const da = extractStr(a, "dueDate", "");
    const db = extractStr(b, "dueDate", "");
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });
}

/** Open milestones first; done ones sit in a collapsed section (expand to review). */
function MilestoneListWithDoneCollapsed({
  items,
  userId,
  canManage,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  onReorder,
}: {
  items: Record<string, unknown>[];
  userId: string;
  canManage: boolean;
  onToggle: (id: string, done: boolean) => void;
  onEdit?: (m: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (m: Record<string, unknown>) => void;
  /** Persist new first→last order for open milestones in this week */
  onReorder?: (orderedIds: string[]) => void;
}) {
  const sorted = sortMilestonesForDisplay(items);
  const open = sorted.filter((m) => m.done !== true);
  const done = sorted.filter((m) => m.done === true);
  const openIds = open.map((m) => extractStr(m, "id", "")).filter(Boolean);
  const canReorder = Boolean(canManage && onReorder && openIds.length > 1);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = openIds.indexOf(String(active.id));
    const newIndex = openIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(openIds, oldIndex, newIndex));
  };

  const moveOpen = (id: string, dir: -1 | 1) => {
    if (!onReorder) return;
    const idx = openIds.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= openIds.length) return;
    onReorder(arrayMove(openIds, idx, next));
  };

  return (
    <div className="space-y-2">
      {canReorder && (
        <p className="text-[10px] text-muted-foreground px-0.5">
          Drag or use arrows to set first → last order for this week
        </p>
      )}
      {open.length === 0 && done.length > 0 && (
        <p className="text-[10px] text-muted-foreground px-0.5">All open items done — expand completed below</p>
      )}
      {canReorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={openIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {open.map((m, index) => (
                <SortableMilestoneRow
                  key={extractStr(m, "id", "")}
                  m={m}
                  userId={userId}
                  canManage={canManage}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  orderIndex={index}
                  orderTotal={open.length}
                  onMoveUp={() => moveOpen(extractStr(m, "id", ""), -1)}
                  onMoveDown={() => moveOpen(extractStr(m, "id", ""), 1)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        open.map((m) => (
          <MilestoneRow
            key={extractStr(m, "id", "")}
            m={m}
            userId={userId}
            canManage={canManage}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        ))
      )}
      {done.length > 0 && (
        <Collapsible defaultOpen={false} className="rounded-lg border border-border/40 bg-muted/20">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/40 rounded-lg [&[data-state=open]>svg]:rotate-180">
            <span className="text-[10px] font-medium text-muted-foreground">
              {done.length} completed — expand to review
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 px-1.5 pb-2">
            {done.map((m) => (
              <MilestoneRow
                key={extractStr(m, "id", "")}
                m={m}
                userId={userId}
                canManage={canManage}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function SortableMilestoneRow({
  m,
  userId,
  canManage,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  orderIndex,
  orderTotal,
  onMoveUp,
  onMoveDown,
}: {
  m: Record<string, unknown>;
  userId: string;
  canManage: boolean;
  onToggle: (id: string, done: boolean) => void;
  onEdit?: (m: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (m: Record<string, unknown>) => void;
  orderIndex: number;
  orderTotal: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const mId = extractStr(m, "id", "");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "shadow-md rounded-lg")}>
      <MilestoneRow
        m={m}
        userId={userId}
        canManage={canManage}
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dragHandleProps={{ attributes, listeners }}
        orderBadge={orderIndex + 1}
        onMoveUp={orderIndex > 0 ? onMoveUp : undefined}
        onMoveDown={orderIndex < orderTotal - 1 ? onMoveDown : undefined}
      />
    </div>
  );
}

function formatMilestoneRole(role: string) {
  const cleaned = (role || "").replace(/_/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const MILESTONE_DESC_PREVIEW_CHARS = 280;

function MilestoneRow({
  m,
  userId,
  canManage,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  dragHandleProps,
  orderBadge,
  onMoveUp,
  onMoveDown,
}: {
  m: Record<string, unknown>;
  userId: string;
  canManage: boolean;
  onToggle: (id: string, done: boolean) => void;
  onEdit?: (m: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (m: Record<string, unknown>) => void;
  dragHandleProps?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attributes: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: any;
  };
  orderBadge?: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const mId = extractStr(m, "id", "");
  const mTitle = extractStr(m, "title", "");
  const mDescription = extractStr(m, "description", "").trim();
  const mDone = m.done === true;
  const mDue = extractStr(m, "dueDate", "");
  const mDueTime = extractStr(m, "dueTime", "");
  const assignees = Array.isArray(m.assignees) ? (m.assignees as Record<string, unknown>[]) : [];
  const isAssignee = assignees.some(
    (a) =>
      extractStr(a, "userId", "") === userId ||
      extractNestedStr(a, ["user", "id"], "") === userId
  );
  const canToggleDone = canManage || isAssignee;
  const descLong = mDescription.length > MILESTONE_DESC_PREVIEW_CHARS;
  const [descExpanded, setDescExpanded] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const descShown =
    !descLong || descExpanded
      ? mDescription
      : `${mDescription.slice(0, MILESTONE_DESC_PREVIEW_CHARS).trimEnd()}…`;

  const dueLabel = mDue ? formatDisplayDateWithWeekday(mDue, "") : "";

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-3 rounded-lg border bg-white/60 dark:bg-white/[0.03]",
        isAssignee && !mDone
          ? "border-amber-500/35 ring-1 ring-amber-500/20"
          : "border-white/20 dark:border-white/10"
      )}
    >
      {dragHandleProps && (
        <button
          type="button"
          className="shrink-0 mt-0.5 touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {typeof orderBadge === "number" && (
        <span
          className="shrink-0 mt-0.5 h-5 min-w-5 px-1 rounded-md bg-muted text-[10px] font-semibold tabular-nums flex items-center justify-center text-muted-foreground"
          title={`Order ${orderBadge}`}
        >
          {orderBadge}
        </span>
      )}
      <button
        type="button"
        onClick={() => canToggleDone && onToggle(mId, mDone)}
        className={cn("shrink-0 mt-0.5", canToggleDone ? "cursor-pointer" : "cursor-default")}
        disabled={!canToggleDone}
        title={canToggleDone ? (mDone ? "Mark incomplete" : "Mark done") : "Only assignees or admin can mark done"}
      >
        <CheckCircle2 className={cn("h-4 w-4", mDone ? "text-emerald-500" : "text-muted-foreground/40")} />
      </button>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p
            className={cn(
              "text-sm font-semibold break-words whitespace-pre-wrap leading-snug flex-1 min-w-0",
              mDone && "line-through text-muted-foreground"
            )}
          >
            {mTitle || "Untitled milestone"}
          </p>
          {isAssignee && !mDone && (
            <Badge className="text-[10px] h-5 px-1.5 bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30 shrink-0">
              Assigned to you
            </Badge>
          )}
        </div>

        {mDescription ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <button
                type="button"
                onClick={() => setReadOpen(true)}
                className="text-[10px] font-medium text-foreground/80 hover:text-foreground underline-offset-2 hover:underline shrink-0"
              >
                Read full
              </button>
            </div>
            <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap leading-relaxed">
              {descShown}
            </p>
            {descLong && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="text-[11px] font-medium text-foreground/70 hover:text-foreground"
              >
                {descExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">No description provided</p>
        )}

        {(mDue || mDueTime) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] h-auto min-h-5 px-1.5 py-0.5 gap-1 font-normal whitespace-normal">
              <CalendarDays className="h-2.5 w-2.5 shrink-0" />
              <span>
                {dueLabel || "Due"}
                {mDueTime ? ` · ${mDueTime} UK` : ""}
              </span>
            </Badge>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {assignees.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">No assignees</span>
          ) : (
            assignees.map((a) => {
              const aUserId = extractStr(a, "userId", "") || extractNestedStr(a, ["user", "id"], "");
              const name = extractNestedStr(a, ["user", "name"], "?");
              const email = extractNestedStr(a, ["user", "email"], "");
              const role = formatMilestoneRole(extractNestedStr(a, ["user", "role"], ""));
              const mine = aUserId === userId;
              return (
                <Badge
                  key={aUserId || `${name}-${role}`}
                  variant="secondary"
                  className={cn(
                    "text-[10px] h-auto min-h-5 px-1.5 py-0.5 font-normal whitespace-normal max-w-full",
                    mine && "bg-amber-500/15 border border-amber-500/30"
                  )}
                  title={email || name}
                >
                  <span className="break-words">
                    {name}
                    {role ? ` · ${role}` : ""}
                  </span>
                </Badge>
              );
            })
          )}
        </div>
      </div>
      {(onMoveUp || onMoveDown || (canManage && (onEdit || onDelete || onDuplicate))) && (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {(onMoveUp || onMoveDown) && (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!onMoveUp}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move earlier"
                aria-label="Move earlier"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!onMoveDown}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move later"
                aria-label="Move later"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {canManage && (onEdit || onDelete || onDuplicate) && (
            <div className="flex items-center gap-0.5">
              {onDuplicate && (
                <button
                  type="button"
                  onClick={() => onDuplicate(m)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="Duplicate milestone"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </button>
              )}
              {onEdit && (
                <button type="button" onClick={() => onEdit(m)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(mId)} className="text-muted-foreground hover:text-red-500 transition-colors p-1" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={readOpen} onOpenChange={setReadOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base break-words whitespace-pre-wrap leading-snug pr-6">
              {mTitle || "Untitled milestone"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Full milestone description for assignees to follow.
              {dueLabel || mDueTime
                ? ` Due ${dueLabel || "—"}${mDueTime ? ` · ${mDueTime} UK` : ""}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Description
            </p>
            <p className="text-sm text-foreground break-words whitespace-pre-wrap leading-relaxed">
              {mDescription || "No description provided."}
            </p>
          </div>
          {assignees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {assignees.map((a) => {
                const aUserId = extractStr(a, "userId", "") || extractNestedStr(a, ["user", "id"], "");
                const name = extractNestedStr(a, ["user", "name"], "?");
                const role = formatMilestoneRole(extractNestedStr(a, ["user", "role"], ""));
                return (
                  <Badge key={aUserId || name} variant="secondary" className="text-[10px] font-normal">
                    {name}
                    {role ? ` · ${role}` : ""}
                  </Badge>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  // If viewing a demo project detail (/dashboard/demo/[projectId]), the back
  // button should return to the demo list — not the regular projects list.
  const isDemoDetail = pathname?.includes("/demo/") ?? false;
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  // Safe projectId extraction
  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === "string"
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? "")
      : "";

  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  // PROJECT_MANAGER can manage projects, members, infrastructure, and tokens
  // (same as ADMIN for project-management capabilities).
  const canManageProject = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "PROJECT_MANAGER";

  // Detect if loaded inside floating board iframe — hide back button & reduce padding
  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  // ── State: UI-only state (dialogs, selections) ──
  const [creating, setCreating] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  // Remove member confirmation state
  const [removeMemberUserId, setRemoveMemberUserId] = useState<string | null>(null);
  // Website management dialog state
  const [websiteMgmtOpen, setWebsiteMgmtOpen] = useState(false);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [methodsDialogOpen, setMethodsDialogOpen] = useState(false);
  const [deleteWebsiteId, setDeleteWebsiteId] = useState<string | null>(null);
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [newWebsiteLabel, setNewWebsiteLabel] = useState("");
  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null);
  const [editingWebsiteUrl, setEditingWebsiteUrl] = useState("");
  const [editingWebsiteLabel, setEditingWebsiteLabel] = useState("");

  // ── Grouped infrastructure section state ──
  const [infraItemDialogOpen, setInfraItemDialogOpen] = useState(false);
  const [editingInfraItem, setEditingInfraItem] = useState<InfraItem | null>(null);
  const [infraItemForm, setInfraItemForm] = useState<InfraItemForm>({
    groupKey: "GITHUB",
    label: "",
    value: "",
    isSecret: true,
  });
  const [customGroupDialogOpen, setCustomGroupDialogOpen] = useState(false);
  const [customGroupName, setCustomGroupName] = useState("");
  const [localCustomGroups, setLocalCustomGroups] = useState<InfraGroupDef[]>([]);
  const [infraSaving, setInfraSaving] = useState(false);
  const [infraDeletingId, setInfraDeletingId] = useState<string | null>(null);
  const [revealedInfraItems, setRevealedInfraItems] = useState<Record<string, { value: string; expiresAt: number }>>({});
  const [revealTick, setRevealTick] = useState(0);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [visibilityPreset, setVisibilityPreset] = useState("30");
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [infraAccessUserIds, setInfraAccessUserIds] = useState<string[]>([]);
  const [infraAccessDialogOpen, setInfraAccessDialogOpen] = useState(false);
  // Infrastructure panel: collapsed by default; remember open/closed per project
  const [infraSectionOpen, setInfraSectionOpen] = useState(false);
  // Milestones panel: same collapse pattern as infrastructure
  const [milestoneSectionOpen, setMilestoneSectionOpen] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDescription, setNewMilestoneDescription] = useState("");
  const [newMilestoneDue, setNewMilestoneDue] = useState("");
  const [newMilestoneDueTime, setNewMilestoneDueTime] = useState("");
  const [newMilestoneAssignees, setNewMilestoneAssignees] = useState<string[]>([]);
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [milestoneWeekFilter, setMilestoneWeekFilter] = useState<string>("__all__");
  const [editingMilestone, setEditingMilestone] = useState<Record<string, unknown> | null>(null);
  const [editMilestoneTitle, setEditMilestoneTitle] = useState("");
  const [editMilestoneDescription, setEditMilestoneDescription] = useState("");
  const [editMilestoneDue, setEditMilestoneDue] = useState("");
  const [editMilestoneDueTime, setEditMilestoneDueTime] = useState("");
  const [editMilestoneAssignees, setEditMilestoneAssignees] = useState<string[]>([]);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const canManageMilestones =
    userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "PROJECT_MANAGER";
  const PM_MILESTONE_ROLES = useMemo(() => new Set(["PROJECT_MANAGER", "DEVELOPER"]), []);

  // PERF: One bootstrap seeds React Query caches (single auth), then per-resource queries
  // stay enabled for mutations/refetch without a cold waterfall of 4–5 session checks.
  const [bootstrapReady, setBootstrapReady] = useState(false);
  useEffect(() => {
    if (!projectId) {
      setBootstrapReady(true);
      return;
    }
    let cancelled = false;
    setBootstrapReady(false);
    (async () => {
      try {
        const res = await fetch(`/api/bootstrap/project/${projectId}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (res.ok) {
          const raw = deepSanitize(await res.json()) as Record<string, unknown>;
          if (raw.project && typeof raw.project === "object") {
            queryClient.setQueryData(["project", projectId], raw.project);
          }
          if (Array.isArray(raw.members)) {
            queryClient.setQueryData(["project-members", projectId], raw.members);
          }
          if (raw.infrastructure && typeof raw.infrastructure === "object") {
            queryClient.setQueryData(["project-infra", projectId], raw.infrastructure);
          }
          if (Array.isArray(raw.milestones)) {
            queryClient.setQueryData(["project-milestones", projectId], raw.milestones);
          }
          if (Array.isArray(raw.websites)) {
            queryClient.setQueryData(["project-websites", projectId], raw.websites);
          }
        }
      } catch {
        /* fall through to individual queries */
      } finally {
        if (!cancelled) setBootstrapReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, queryClient]);

  useEffect(() => {
    if (Object.keys(revealedInfraItems).length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRevealTick(now);
      setRevealedInfraItems((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, entry]) => entry.expiresAt > now));
        return next as Record<string, { value: string; expiresAt: number }>;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [revealedInfraItems]);

  // ── React Query: Project data with aggressive caching ──
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects?projectId=${projectId}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load project");
      const raw = deepSanitize(await res.json());
      if (Array.isArray(raw) && raw.length > 0) return raw[0] as Record<string, unknown>;
      if (raw && typeof raw === "object" && (raw as Record<string, unknown>).id) return raw as Record<string, unknown>;
      if (Array.isArray((raw as Record<string, unknown>)?.data) && ((raw as Record<string, unknown>).data as unknown[]).length > 0) {
        return ((raw as Record<string, unknown>).data as unknown[])[0] as Record<string, unknown>;
      }
      return null;
    },
    enabled: !!projectId && bootstrapReady,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: membersData = [], isLoading: membersLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/members`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load members");
      const md = deepSanitize(await res.json());
      return Array.isArray(md) ? md : (Array.isArray((md as Record<string, unknown>)?.data) ? (md as Record<string, unknown>).data as unknown[] : []);
    },
    enabled: !!projectId && bootstrapReady,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Lazy load team users — prefetch on hover/focus so the list is ready
  // by the time the dialog opens. The query is enabled when addMemberOpen
  // is true OR when the user hovers the add-member button (prefetch).
  const [prefetchTeamUsers, setPrefetchTeamUsers] = useState(false);
  const {
    data: teamUsersData = [],
    isLoading: teamUsersLoading,
    isError: teamUsersError,
    refetch: refetchTeamUsers,
  } = useQuery({
    queryKey: ["team-users"],
    queryFn: async () => {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load team users");
      const ud = deepSanitize(await res.json());
      return Array.isArray(ud) ? ud : (Array.isArray((ud as Record<string, unknown>)?.data) ? (ud as Record<string, unknown>).data as unknown[] : []);
    },
    // Enable on: dialog open OR prefetch trigger (hover/focus on add button)
    enabled: canManageProject && (addMemberOpen || prefetchTeamUsers),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ── React Query: Websites — SKIP in iframe (not needed for task board)
  const { data: websitesData = [] } = useQuery({
    queryKey: ["project-websites", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/websites`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return [];
      const raw = deepSanitize(await res.json());
      return Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
    },
    enabled: !isInIframe && !!projectId && canManageProject && bootstrapReady,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ── React Query: Grouped infrastructure ──
  const { data: infraData, isLoading: infraLoading } = useQuery({
    queryKey: ["project-infra-items", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects/${projectId}/infra-items`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return null;
      const raw = deepSanitize(await res.json());
      return raw as InfraItemsResponse;
    },
    enabled: !!projectId && bootstrapReady,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: milestonesData = [], refetch: refetchMilestones } = useQuery({
    queryKey: ["project-milestones", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/milestones`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return [];
      const raw = deepSanitize(await res.json());
      return Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
    },
    enabled: !!projectId && !isInIframe && bootstrapReady,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: 1,
  });

  const project = projectData;
  const members = membersData;
  const activeMembers = useMemo(
    () =>
      members.filter((m) => {
        const active = (m as { user?: { isActive?: boolean } }).user?.isActive;
        return active !== false;
      }),
    [members]
  );
  const milestoneAssigneeMembers = useMemo(() => {
    if (userRole !== "PROJECT_MANAGER") return activeMembers;
    return activeMembers.filter((m) => {
      const role = extractNestedStr(m, ["user", "role"], "");
      return PM_MILESTONE_ROLES.has(role);
    });
  }, [activeMembers, userRole, PM_MILESTONE_ROLES]);
  const infraAccessCandidates = useMemo(() => {
    return activeMembers.filter((m) => {
      const role = extractNestedStr(m, ["user", "role"], "");
      return role === "DEVELOPER";
    });
  }, [activeMembers]);
  const teamUsers = teamUsersData;
  const websites = websitesData;
  const infrastructure = infraData;
  const infraStorageKey = projectId ? `trishul:project-infra-open:${projectId}` : null;
  const milestoneStorageKey = projectId ? `trishul:project-milestones-open:${projectId}` : null;

  useEffect(() => {
    if (!infraStorageKey || typeof window === "undefined") return;
    let cancelled = false;
    const open = (() => {
      try {
        return window.localStorage.getItem(infraStorageKey) === "1";
      } catch {
        return false;
      }
    })();
    queueMicrotask(() => {
      if (!cancelled) setInfraSectionOpen(open);
    });
    return () => {
      cancelled = true;
    };
  }, [infraStorageKey]);

  useEffect(() => {
    if (!milestoneStorageKey || typeof window === "undefined") return;
    let cancelled = false;
    const open = (() => {
      try {
        return window.localStorage.getItem(milestoneStorageKey) === "1";
      } catch {
        return false;
      }
    })();
    queueMicrotask(() => {
      if (!cancelled) setMilestoneSectionOpen(open);
    });
    return () => {
      cancelled = true;
    };
  }, [milestoneStorageKey]);

  const setInfraSectionOpenPersist = useCallback(
    (open: boolean) => {
      setInfraSectionOpen(open);
      if (!infraStorageKey || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(infraStorageKey, open ? "1" : "0");
      } catch {
        /* private mode / quota */
      }
    },
    [infraStorageKey]
  );

  const setMilestoneSectionOpenPersist = useCallback(
    (open: boolean) => {
      setMilestoneSectionOpen(open);
      if (!milestoneStorageKey || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(milestoneStorageKey, open ? "1" : "0");
      } catch {
        /* private mode / quota */
      }
    },
    [milestoneStorageKey]
  );

  const infraGroups = infrastructure?.groups || emptyInfraGroups();
  const infraGroupDefs = useMemo(() => {
    const fromApi = infrastructure?.groupDefs?.length
      ? infrastructure.groupDefs
      : DEFAULT_INFRA_GROUP_DEFS;
    const seen = new Set(fromApi.map((g) => g.key));
    const merged = [...fromApi];
    for (const g of localCustomGroups) {
      if (!seen.has(g.key)) {
        merged.push(g);
        seen.add(g.key);
      }
    }
    // Ensure every group that has items appears (even if defs lag)
    for (const key of Object.keys(infraGroups)) {
      if (!seen.has(key) && (infraGroups[key]?.length || 0) > 0) {
        const sample = infraGroups[key][0];
        merged.push({
          key,
          label: sample?.groupLabel || key.replace(/^CUSTOM_/, "").replace(/_/g, " "),
          description: "Custom infrastructure group",
          builtin: false,
        });
        seen.add(key);
      }
    }
    return merged;
  }, [infrastructure?.groupDefs, infraGroups, localCustomGroups]);
  const infraMemberAccess = infrastructure?.memberAccess || {
    visibleUntil: null,
    isActive: false,
    grants: [],
  };
  const infraAccessGrants = useMemo(
    () => (infraMemberAccess.grants || []).filter((g) => g.isActive),
    [infraMemberAccess.grants]
  );
  const infraCanView = infrastructure?.canView ?? canManageProject;
  const infraItemCount = infraGroupDefs.reduce(
    (count, group) => count + (infraGroups[group.key]?.length || 0),
    0
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-websites", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-infra-items", projectId] });
  };

  // ── Grouped infrastructure handlers ──
  const resetInfraItemDialog = useCallback(() => {
    setInfraItemDialogOpen(false);
    setEditingInfraItem(null);
    setInfraItemForm({ groupKey: "GITHUB", label: "", value: "", isSecret: true });
  }, []);

  const openAddInfraItem = useCallback((groupKey: string, groupLabel?: string) => {
    setEditingInfraItem(null);
    setInfraItemForm({
      groupKey,
      groupLabel,
      label: "",
      value: "",
      isSecret: true,
    });
    setInfraItemDialogOpen(true);
  }, []);

  const openEditInfraItem = useCallback((item: InfraItem) => {
    setEditingInfraItem(item);
    setInfraItemForm({
      groupKey: item.groupKey,
      groupLabel: item.groupLabel,
      label: item.label,
      value: item.isSecret ? "" : item.value || "",
      isSecret: item.isSecret,
    });
    setInfraItemDialogOpen(true);
  }, []);

  const handleCreateCustomGroup = useCallback(() => {
    const name = customGroupName.trim().replace(/\s+/g, " ").slice(0, 60);
    const key = toCustomInfraGroupKey(name);
    if (!name || !key) {
      toast.error("Enter a valid group name (letters/numbers)");
      return;
    }
    if (infraGroupDefs.some((g) => g.key === key)) {
      toast.error("That group already exists");
      return;
    }
    setLocalCustomGroups((prev) => [
      ...prev,
      { key, label: name, description: "Custom infrastructure group", builtin: false },
    ]);
    setCustomGroupName("");
    setCustomGroupDialogOpen(false);
    openAddInfraItem(key, name);
    toast.success(`Custom group "${name}" ready — add the first item`);
  }, [customGroupName, infraGroupDefs, openAddInfraItem]);

  const handleSaveInfraItem = useCallback(async () => {
    if (!infraItemForm.label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (!editingInfraItem && !infraItemForm.value.trim()) {
      toast.error("Value is required");
      return;
    }
    setInfraSaving(true);
    try {
      const endpoint = editingInfraItem
        ? `/api/projects/${projectId}/infra-items/${editingInfraItem.id}`
        : `/api/projects/${projectId}/infra-items`;
      const body: Record<string, unknown> = {
        groupKey: infraItemForm.groupKey,
        label: infraItemForm.label.trim(),
        isSecret: infraItemForm.isSecret,
      };
      if (infraItemForm.groupKey.startsWith("CUSTOM_")) {
        body.groupLabel =
          infraItemForm.groupLabel ||
          infraGroupDefs.find((g) => g.key === infraItemForm.groupKey)?.label ||
          infraItemForm.groupKey.replace(/^CUSTOM_/, "").replace(/_/g, " ");
      }
      if (!editingInfraItem || infraItemForm.value.trim()) {
        body.value = infraItemForm.value;
      } else if (!infraItemForm.isSecret) {
        body.value = "";
      }
      const res = await fetch(endpoint, {
        method: editingInfraItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save infrastructure item");
        return;
      }
      toast.success(editingInfraItem ? "Infrastructure item updated" : "Infrastructure item added");
      resetInfraItemDialog();
      setRevealedInfraItems((prev) => {
        if (!editingInfraItem) return prev;
        const next = { ...prev };
        delete next[editingInfraItem.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["project-infra-items", projectId] });
    } catch {
      toast.error("Failed to save infrastructure item");
    } finally {
      setInfraSaving(false);
    }
  }, [editingInfraItem, infraGroupDefs, infraItemForm, projectId, queryClient, resetInfraItemDialog]);

  const handleDeleteInfraItem = useCallback(async (itemId: string) => {
    setInfraDeletingId(itemId);
    try {
      const res = await fetch(`/api/projects/${projectId}/infra-items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to delete infrastructure item");
        return;
      }
      toast.success("Infrastructure item deleted");
      setRevealedInfraItems((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["project-infra-items", projectId] });
    } catch {
      toast.error("Failed to delete infrastructure item");
    } finally {
      setInfraDeletingId(null);
    }
  }, [projectId, queryClient]);

  const handleUpdateInfraMemberAccess = useCallback(
    async (visibleUntil: string | null, userIds: string[]) => {
      if (userIds.length === 0) {
        toast.error("Select at least one developer");
        return;
      }
      setVisibilitySaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/infra-items`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ visibleUntil, userIds }),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Failed to update member visibility");
          return;
        }
        const data = deepSanitize(await res.json()) as {
          memberAccess?: InfraItemsResponse["memberAccess"];
        };
        if (data.memberAccess) {
          queryClient.setQueryData(
            ["project-infra-items", projectId],
            (prev: InfraItemsResponse | null | undefined) =>
              prev
                ? { ...prev, memberAccess: { ...prev.memberAccess, ...data.memberAccess } }
                : prev
          );
        }
        toast.success(
          visibleUntil
            ? `Access granted to ${userIds.length} developer${userIds.length === 1 ? "" : "s"}`
            : `Access revoked for ${userIds.length} developer${userIds.length === 1 ? "" : "s"}`
        );
        setInfraAccessUserIds([]);
        setInfraAccessDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["project-infra-items", projectId] });
      } catch {
        toast.error("Failed to update member visibility");
      } finally {
        setVisibilitySaving(false);
      }
    },
    [projectId, queryClient]
  );

  const handleRevealInfraItem = useCallback(async (item: InfraItem) => {
    setRevealing(item.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/infra-items/${item.id}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to reveal value");
        return;
      }
      const data = await res.json();
      setRevealedInfraItems((prev) => ({
        ...prev,
        [item.id]: {
          value: String(data.value || ""),
          expiresAt: Date.now() + 30_000,
        },
      }));
      setRevealTick(Date.now());
    } catch {
      toast.error("Failed to reveal value");
    } finally {
      setRevealing(null);
    }
  }, [projectId]);

  const enableInfraVisibility = useCallback(() => {
    const minutes = Number.parseInt(visibilityPreset, 10);
    const visibleUntil = new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
    handleUpdateInfraMemberAccess(visibleUntil, infraAccessUserIds);
  }, [handleUpdateInfraMemberAccess, visibilityPreset, infraAccessUserIds]);

  const toggleInfraAccessUser = useCallback((uid: string) => {
    setInfraAccessUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard`);
    }).catch(() => {
      toast.error("Failed to copy");
    });
  }, []);

  // ── Website CRUD handlers ──
  const handleAddWebsite = async () => {
    if (!newWebsiteUrl.trim()) { toast.error("URL is required"); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: newWebsiteUrl.trim(),
          label: newWebsiteLabel.trim() || "Production",
          isPrimary: websites.length === 0,
        }),
      });
      if (res.ok) { toast.success("Website added"); setNewWebsiteUrl(""); setNewWebsiteLabel(""); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to add website"); }
    } catch { toast.error("Failed to add website"); }
  };

  const handleUpdateWebsite = async (websiteId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: websiteId, ...updates }),
      });
      if (res.ok) { toast.success("Website updated"); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update website"); }
    } catch { toast.error("Failed to update website"); }
  };

  const handleDeleteWebsite = async (websiteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites?id=${websiteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) { toast.success("Website removed"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to delete website"); }
    } catch { toast.error("Failed to delete website"); }
  };

  const handleSetPrimaryWebsite = async (websiteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: websiteId, isPrimary: true }),
      });
      if (res.ok) { toast.success("Primary website set"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to set primary"); }
    } catch { toast.error("Failed to set primary"); }
  };

  const handleAddMember = async (userId: string, role: string) => {
    if (addingMemberId) return;
    setAddingMemberId(userId);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) {
        toast.success(role === "LEAD" ? "Lead added" : "Member added");
        setAddMemberOpen(false);
        queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
        queryClient.invalidateQueries({ queryKey: ["team-users"] });
      } else {
        if (handle401(res)) return;
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to add member");
      }
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAddingMemberId(null);
    }
  };

  const handleUpdateProject = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/projects", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: projectId, ...updates }) });
      if (res.ok) { toast.success("Project updated"); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update project"); }
    } catch { toast.error("Failed to update project"); }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${userId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("Member removed");
        // PERF: Only invalidate members, not the entire project.
        queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      }
      else { if (handle401(res)) return; toast.error("Failed to remove member"); }
    } catch { toast.error("Failed to remove member"); }
  };

  const refreshProgress = useCallback(() => {
    void refetchMilestones();
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }, [refetchMilestones, queryClient, projectId]);

  const handleAddMilestone = async () => {
    if (!newMilestoneTitle.trim()) {
      toast.error("Milestone title is required");
      return;
    }
    if (!newMilestoneDue) {
      toast.error("Due date is required");
      return;
    }
    if (newMilestoneAssignees.length === 0) {
      toast.error("Select at least one project member to assign");
      return;
    }
    if (newMilestoneTitle.trim().length > 2000) {
      toast.error("Title must be at most 2000 characters");
      return;
    }
    setMilestoneSaving(true);
    const title = newMilestoneTitle.trim();
    const description = newMilestoneDescription.trim() || null;
    const dueDate = newMilestoneDue;
    const dueTime = newMilestoneDueTime || null;
    const assigneeIds = [...newMilestoneAssignees];
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          description,
          dueDate,
          dueTime,
          assigneeIds,
        }),
      });
      if (res.ok) {
        const created = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        toast.success("Milestone added");
        setNewMilestoneTitle("");
        setNewMilestoneDescription("");
        setNewMilestoneDue("");
        setNewMilestoneDueTime("");
        setNewMilestoneAssignees([]);
        // Optimistic append — feels instant; soft-refresh progress in background
        if (created && extractStr(created, "id", "")) {
          queryClient.setQueryData(
            ["project-milestones", projectId],
            (prev: unknown) => {
              const list = Array.isArray(prev) ? (prev as Record<string, unknown>[]) : [];
              if (list.some((m) => extractStr(m, "id", "") === extractStr(created, "id", ""))) {
                return list;
              }
              return [...list, created];
            }
          );
        }
        void refreshProgress();
      } else {
        if (handle401(res)) return;
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to add milestone");
      }
    } catch {
      toast.error("Failed to add milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const openEditMilestone = (m: Record<string, unknown>) => {
    setEditingMilestone(m);
    setEditMilestoneTitle(extractStr(m, "title", ""));
    setEditMilestoneDescription(extractStr(m, "description", ""));
    const due = extractStr(m, "dueDate", "");
    setEditMilestoneDue(due ? due.slice(0, 10) : "");
    setEditMilestoneDueTime(extractStr(m, "dueTime", ""));
    const assignees = Array.isArray(m.assignees)
      ? (m.assignees as Record<string, unknown>[]).map((a) =>
          extractStr(a, "userId", "") || extractNestedStr(a, ["user", "id"], "")
        ).filter(Boolean)
      : [];
    setEditMilestoneAssignees(assignees);
  };

  const handleSaveMilestoneEdit = async () => {
    if (!editingMilestone) return;
    const id = extractStr(editingMilestone, "id", "");
    if (!id || !editMilestoneTitle.trim() || !editMilestoneDue) {
      toast.error("Title and due date are required");
      return;
    }
    if (editMilestoneTitle.trim().length > 2000) {
      toast.error("Title must be at most 2000 characters");
      return;
    }
    if (editMilestoneAssignees.length === 0) {
      toast.error("Select at least one project member to assign");
      return;
    }
    setMilestoneSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id,
          title: editMilestoneTitle.trim(),
          description: editMilestoneDescription.trim() || null,
          dueDate: editMilestoneDue,
          dueTime: editMilestoneDueTime || null,
          assigneeIds: editMilestoneAssignees,
        }),
      });
      if (res.ok) {
        toast.success("Milestone updated");
        setEditingMilestone(null);
        refreshProgress();
      } else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to update milestone");
      }
    } catch {
      toast.error("Failed to update milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const handleToggleMilestone = async (id: string, done: boolean) => {
    const nextDone = !done;
    // Optimistic UI — progress bar updates instantly
    queryClient.setQueryData(
      ["project-milestones", projectId],
      (old: Record<string, unknown>[] | undefined) =>
        (old ?? []).map((m) =>
          extractStr(m, "id", "") === id ? { ...m, done: nextDone } : m
        )
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, done: nextDone }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data.projectProgress === "number") {
          queryClient.setQueryData(
            ["project", projectId],
            (old: Record<string, unknown> | undefined) =>
              old ? { ...old, progress: data.projectProgress } : old
          );
        }
        toast.success(nextDone ? "Milestone marked done — progress updated" : "Milestone reopened");
        refreshProgress();
      } else {
        refreshProgress();
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to update milestone");
      }
    } catch {
      refreshProgress();
      toast.error("Failed to update milestone");
    }
  };

  const handleReorderMilestones = useCallback(
    async (orderedIds: string[]) => {
      if (!projectId || orderedIds.length === 0) return;
      // Int-safe base (seconds) — Date.now() ms overflows Prisma Int
      const base = Math.floor(Date.now() / 1000);
      const reorder = orderedIds.map((id, index) => ({
        id,
        sortOrder: base + index,
      }));
      const orderMap = new Map(reorder.map((r) => [r.id, r.sortOrder]));

      // Optimistic — UI shows new first→last immediately
      queryClient.setQueryData(
        ["project-milestones", projectId],
        (old: Record<string, unknown>[] | undefined) =>
          (old ?? []).map((m) => {
            const id = extractStr(m, "id", "");
            const next = orderMap.get(id);
            return next === undefined ? m : { ...m, sortOrder: next };
          })
      );

      try {
        const res = await fetch(`/api/projects/${projectId}/milestones`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reorder }),
        });
        if (!res.ok) {
          if (handle401(res)) return;
          const d = await res.json().catch(() => null);
          toast.error(d?.error || "Failed to save order");
          void refetchMilestones();
          return;
        }
        toast.success("Milestone order saved");
      } catch {
        toast.error("Failed to save order");
        void refetchMilestones();
      }
    },
    [projectId, queryClient, refetchMilestones, handle401]
  );

  const handleDeleteMilestone = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Milestone removed");
        refreshProgress();
      } else {
        toast.error("Failed to delete milestone");
      }
    } catch {
      toast.error("Failed to delete milestone");
    }
  };

  const handleDuplicateMilestone = async (m: Record<string, unknown>) => {
    const titleBase = extractStr(m, "title", "Milestone").replace(/\s*\(copy\)\s*$/i, "").trim();
    const due = extractStr(m, "dueDate", "");
    const dueDate = due ? due.slice(0, 10) : "";
    const dueTime = extractStr(m, "dueTime", "") || null;
    const assignees = Array.isArray(m.assignees)
      ? (m.assignees as Record<string, unknown>[])
          .map((a) => extractStr(a, "userId", "") || extractNestedStr(a, ["user", "id"], ""))
          .filter(Boolean)
      : [];
    if (!dueDate) {
      toast.error("Original milestone has no due date to copy");
      return;
    }
    if (assignees.length === 0) {
      toast.error("Original milestone has no assignees to copy");
      return;
    }
    setMilestoneSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `${titleBase} (copy)`.slice(0, 2000),
          description: extractStr(m, "description", "").trim() || null,
          dueDate,
          dueTime,
          assigneeIds: assignees,
        }),
      });
      if (res.ok) {
        const created = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        toast.success("Milestone duplicated");
        if (created && extractStr(created, "id", "")) {
          queryClient.setQueryData(
            ["project-milestones", projectId],
            (prev: unknown) => {
              const list = Array.isArray(prev) ? (prev as Record<string, unknown>[]) : [];
              return [...list, created];
            }
          );
        }
        void refreshProgress();
      } else {
        if (handle401(res)) return;
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to duplicate milestone");
      }
    } catch {
      toast.error("Failed to duplicate milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const toggleAssignee = (list: string[], setList: (v: string[]) => void, userId: string) => {
    setList(list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId]);
  };

  // ── Derived values (ALL guaranteed primitives via safe extractors) ──
  const projectName = project ? extractStr(project, "name", "Untitled") : "";
  const projectDesc = project ? extractStr(project, "description", "") : "";
  const projectStatus = project ? extractStr(project, "status", "PLANNING") : "PLANNING";
  // Progress is driven only by milestone completion (not manually editable).
  // No milestones ⇒ always 0% (never fall back to a stale stored Project.progress).
  const milestoneTotal = milestonesData.length;
  const milestoneDone = milestonesData.filter((m) => m.done === true).length;
  const projectProgress =
    milestoneTotal > 0 ? Math.round((milestoneDone / milestoneTotal) * 100) : 0;
  const projectBudget = project ? extractNum(project, "budget", 0) : 0;
  const projectDeadline = project ? extractStr(project, "deadline", "") : "";
  const projectWorkPriority =
    project && typeof (project as Record<string, unknown>).workPriority === "number"
      ? ((project as Record<string, unknown>).workPriority as number)
      : null;

  // Admin/SuperAdmin: group milestones by due-date week for easier planning
  const milestonesByWeek = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const thisMonday = weekStartKey(todayKey);
    const buckets = new Map<string, Record<string, unknown>[]>();
    for (const m of milestonesData) {
      const due = extractStr(m, "dueDate", "");
      const key = due ? weekStartKey(due) : "none";
      const list = buckets.get(key) || [];
      list.push(m);
      buckets.set(key, list);
    }
    // Current + upcoming weeks first; Earlier last so open work is easier to find
    const keys = [...buckets.keys()].sort((a, b) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      const aPast = a < thisMonday;
      const bPast = b < thisMonday;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({
      key,
      label: formatWeekLabel(key, todayKey),
      items: sortMilestonesForDisplay(buckets.get(key) || []),
    }));
  }, [milestonesData]);

  const memberUserIds = useMemo(() => members.map((m) => extractStr(m, "userId", "")), [members]);
  const availableUsers = useMemo(() => {
    const ids = memberUserIds;
    return teamUsers.filter((u) => {
      const id = extractStr(u, "id", "");
      if (!id || ids.includes(id)) return false;
      // Team API already filters inactive; keep a defensive client check
      const active = (u as { isActive?: boolean }).isActive;
      return active !== false;
    });
  }, [teamUsers, memberUserIds]);

  // CRITICAL FIX: Only gate on session + project loading.
  // Do NOT block on tasksLoading/membersLoading — show the board immediately
  // with tasks/members populating in as they arrive. This fixes:
  // 1. "No data visible" in floating task board iframes (was blocked by slow teamUsers query)
  // 2. Slow perceived loading (page was blank until ALL 4 queries finished)
  const isInitialLoading = sessionStatus === "loading" || !bootstrapReady || projectLoading;

  // ── Loading state — only for session/project (not tasks/members) ──
  if (isInitialLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Invalid project ID</p>
        <Button variant="outline" onClick={() => router.push(isDemoDetail ? "/dashboard/demo" : "/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-16">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Project not found</p>
        <Button variant="outline" onClick={() => router.push(isDemoDetail ? "/dashboard/demo" : "/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  const progressColorClass = projectProgress < 30 ? "text-red-600 dark:text-red-400" : projectProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  const manageIconBtnClass = "inline-flex items-center justify-center h-[26px] w-[26px] rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors";
  const CredMethodsIcons = () => (
    <>
      <button
        type="button"
        className={manageIconBtnClass}
        aria-label="Credentials"
        title="Credentials"
        onClick={() => setCredentialsDialogOpen(true)}
      >
        <Key className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={manageIconBtnClass}
        aria-label="Methods"
        title="Methods"
        onClick={() => setMethodsDialogOpen(true)}
      >
        <Layers className="h-3 w-3" />
      </button>
    </>
  );

  return (
    <div className="space-y-5" style={{ animation: "fade-in 0.35s ease-out both", padding: isInIframe ? "8px" : undefined }}>
      {/* ═══════ DEMO PROJECT banner (shown only when isDemo is true) ═══════ */}
      {project?.isDemo === true && (
        <div
          className="flex items-center gap-2.5 rounded-xl border border-teal-300/50 dark:border-teal-500/30 bg-teal-50/80 dark:bg-teal-950/30 backdrop-blur-sm px-3.5 py-2.5 shadow-sm"
          role="status"
          aria-label="Demo project"
        >
          <FlaskConical className="h-4 w-4 text-teal-600 dark:text-teal-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold tracking-wider text-teal-700 dark:text-teal-200 uppercase">
              Demo Project
            </p>
            <p className="text-[11px] text-teal-600/80 dark:text-teal-300/70 mt-0.5">
              This is a demo project — it works exactly like a regular project (members, credentials, infrastructure) but is grouped under Demo Projects for walkthroughs.
            </p>
          </div>
          <Badge className="text-[10px] font-bold tracking-wider px-2 py-0.5 border border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-200 shrink-0">
            DEMO
          </Badge>
        </div>
      )}

      {/* ═══════ Compact Header ═══════ */}
      <div className="flex items-start gap-3" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "50ms" }}>
        {!isInIframe && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(isDemoDetail ? "/dashboard/demo" : "/dashboard/projects")}
          aria-label="Back to projects"
          className="mt-0.5 h-8 w-8 rounded-lg hover:bg-muted/80 hover:scale-105 transition-all duration-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{safeText(projectName, "Untitled")}</h1>
            <WorkPriorityBadge priority={projectWorkPriority} className="h-5 min-w-5 text-[11px]" />
            {canManageProject ? (
              <select
                className="h-6 text-[10px] border rounded-full px-2.5 bg-background/80 font-semibold focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer appearance-none pr-5"
                value={safeText(projectStatus, "PLANNING")}
                onChange={(e) => handleUpdateProject({ status: e.target.value })}
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <Badge className={`${projectStatusColors[safeText(projectStatus, "")] || ""} text-[10px] font-semibold px-2 py-0`}>
                {safeText(projectStatus, "UNKNOWN").replace("_", " ")}
              </Badge>
            )}
            {canManageProject && (
              <label className="inline-flex items-center gap-1.5 h-6 text-[10px] border rounded-full px-2.5 bg-background/80 font-semibold">
                <span className="text-muted-foreground whitespace-nowrap">Priority</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder="—"
                  className="w-10 bg-transparent border-0 p-0 text-[10px] font-bold tabular-nums focus:outline-none focus:ring-0"
                  defaultValue={projectWorkPriority ?? ""}
                  key={`wp-${projectId}-${projectWorkPriority ?? "none"}`}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const next = raw === "" ? null : parseInt(raw, 10);
                    const normalized =
                      next != null && Number.isInteger(next) && next >= 1 && next <= 99
                        ? next
                        : null;
                    if (normalized === projectWorkPriority) return;
                    if (raw !== "" && normalized == null) {
                      e.target.value = projectWorkPriority != null ? String(projectWorkPriority) : "";
                      toast.error("Priority must be 1–99 or blank");
                      return;
                    }
                    handleUpdateProject({ workPriority: normalized });
                  }}
                  title="Clock-in priority (1 = highest). Clear to unset."
                  aria-label="Work priority"
                />
              </label>
            )}
          </div>
          {projectDesc && (
            <p className="text-muted-foreground/70 text-sm mt-1 leading-relaxed line-clamp-2 max-w-2xl">{safeText(projectDesc)}</p>
          )}
        </div>
      </div>

      {/* ═══════ Compact Stats Row (glassmorphism pills) ═══════ */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Progress pill — auto from milestones (uneditable) */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm"
          title="Progress = completed milestones / total milestones"
        >
          <Gauge className={cn("h-3.5 w-3.5", progressColorClass)} />
          {(() => {
            const displayProgress = safeNumber(projectProgress);
            const fillColor = displayProgress < 30 ? "bg-red-500" : displayProgress < 70 ? "bg-amber-500" : "bg-emerald-500";
            const handleShadow = displayProgress < 30 ? "shadow-red-500/30" : displayProgress < 70 ? "shadow-amber-500/30" : "shadow-emerald-500/30";
            return (
              <div className="flex items-center gap-1.5">
                <div className="relative h-2 w-24 rounded-full bg-black/10 dark:bg-white/10 select-none cursor-default">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", fillColor, handleShadow)}
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
                <span className={cn("text-[11px] font-bold tabular-nums", progressColorClass)}>
                  {displayProgress}%
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {milestoneDone}/{milestoneTotal || 0}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Budget pill (admin + PM) */}
        {canManageProject && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">£</span>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {String(projectBudget || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            </span>
          </div>
        )}

        {/* Deadline pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {projectDeadline ? safeDate(projectDeadline, "No deadline") : "No deadline"}
          </span>
        </div>

        {/* Team Size pill (non-manager) */}
        {!canManageProject && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{String(members.length)} members</span>
          </div>
        )}

        {/* Live button / Add Live URL (admin) */}
        {(() => {
          const projectWebsites = (project?.websites as Record<string, unknown>[] | undefined) || [];
          const mergedWebsites = canManageProject && websites.length > 0 ? websites : projectWebsites;
          if (mergedWebsites.length === 1) {
            const wUrl = extractStr(mergedWebsites[0], "url", "");
            const wLabel = extractStr(mergedWebsites[0], "label", "");
            return (
              <>
                <a
                  href={wUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  {wLabel || "Live"}
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </a>
                {canManageProject && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                      className={manageIconBtnClass}
                      aria-label="Manage websites"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                    <CredMethodsIcons />
                  </>
                )}
              </>
            );
          }
          if (mergedWebsites.length > 1) {
            const primary = mergedWebsites.find((w) => extractStr(w, "isPrimary", "") === "true" || w.isPrimary === true) || mergedWebsites[0];
            const pUrl = extractStr(primary, "url", "");
            const pLabel = extractStr(primary, "label", "");
            return (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      {pLabel || "Live"}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {mergedWebsites.map((w, i) => {
                      const wUrl = extractStr(w, "url", "");
                      const wLabel = extractStr(w, "label", "");
                      const wIsPrimary = w.isPrimary === true || extractStr(w, "isPrimary", "") === "true";
                      return (
                        <DropdownMenuItem key={extractStr(w, "id", String(i))} asChild>
                          <a href={wUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                            <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{wLabel || `Site ${i + 1}`}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{wUrl}</p>
                            </div>
                            {wIsPrimary && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                          </a>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                {canManageProject && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                      className={manageIconBtnClass}
                      aria-label="Manage websites"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                    <CredMethodsIcons />
                  </>
                )}
              </>
            );
          }
          // 0 websites
          if (canManageProject) {
            return (
              <>
                <button
                  type="button"
                  onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 border border-dashed border-muted-foreground/30 transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  Add Live URL
                </button>
                <CredMethodsIcons />
              </>
            );
          }
          return null;
        })()}
      </div>

      {/* ═══════ Compact Team Members ═══════ */}
      {membersLoading ? (
        <div className="flex items-center gap-2" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "150ms" }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "150ms" }}>
          {members.length === 0 && !canManageProject && (
            <span className="text-xs text-muted-foreground/60 italic">No team members</span>
          )}
          {members.map((member) => {
            const mId = extractStr(member, "id", "");
            const mUserId = extractStr(member, "userId", "");
            const mRole = extractStr(member, "role", "");
            const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
            const initials = mUserName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
            const avatarColor = mRole === "LEAD" ? "from-amber-400 to-orange-500" : "from-slate-500 to-slate-600 dark:from-slate-400 dark:to-slate-500";
            return (
              <div
                key={mId}
                className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm hover:shadow-md transition-all group/member shrink-0"
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={cn("text-[9px] font-bold text-white bg-gradient-to-br", avatarColor)}>{initials || "?"}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-medium text-foreground/80 max-w-[80px] truncate">{mUserName}</span>
                {canManageProject && mUserId !== userId && (
                  <button
                    type="button"
                    title="Remove member"
                    aria-label="Remove member"
                    className="h-7 w-7 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 hover:text-red-600 opacity-0 group-hover/member:opacity-100 transition-all ml-0.5"
                    onClick={() => setRemoveMemberUserId(mUserId)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {canManageProject && (
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-full shrink-0 shadow-sm hover:shadow-md transition-all"
                  aria-label="Add member"
                  onMouseEnter={() => setPrefetchTeamUsers(true)}
                  onFocus={() => setPrefetchTeamUsers(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold">Add Team Member</DialogTitle>
                  <DialogDescription className="text-xs">Assign a team member to this project.</DialogDescription>
                </DialogHeader>
                {teamUsersLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading team…
                  </div>
                ) : teamUsersError ? (
                  <div className="space-y-3 py-4 text-center">
                    <p className="text-sm text-muted-foreground">Could not load team members.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => void refetchTeamUsers()}>
                      Retry
                    </Button>
                  </div>
                ) : availableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    All team members are already assigned to this project.
                  </p>
                ) : (
                  <ScrollArea className="max-h-72">
                    <div className="space-y-1.5">
                      {availableUsers.map((user) => {
                        const uName = extractStr(user, "name", "Unknown");
                        const uRole = extractStr(user, "role", "");
                        const uDept = extractStr(user, "department", "");
                        const uId = extractStr(user, "id", "");
                        const initials = uName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
                        const busy = addingMemberId === uId;
                        return (
                          <div key={uId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2.5 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar className="h-7 w-7 ring-1 ring-muted shrink-0">
                                <AvatarFallback className="text-[10px] bg-gradient-to-br from-primary/20 to-primary/5">{initials || "?"}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{uName}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {safeText(uRole)}{uDept ? ` · ${safeText(uDept)}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0 self-end sm:self-auto">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2"
                                disabled={!!addingMemberId}
                                onClick={() => void handleAddMember(uId, "MEMBER")}
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Member"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 text-[10px] px-2"
                                disabled={!!addingMemberId}
                                onClick={() => void handleAddMember(uId, "LEAD")}
                              >
                                Lead
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ═══════ Milestones (collapsible like Infrastructure) ═══════ */}
      {!isInIframe && (
        <Collapsible
          open={milestoneSectionOpen}
          onOpenChange={setMilestoneSectionOpenPersist}
          className="rounded-xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden"
          style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "165ms" }}
        >
          <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
            <CollapsibleTrigger className="flex items-center gap-1.5 sm:gap-2 min-w-0 text-left group flex-1 [&[data-state=open]>svg.ms-chevron]:rotate-180">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <h2 className="text-sm font-bold tracking-tight truncate">Milestones</h2>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                {milestonesData.filter((m) => m.done === true).length}/{milestonesData.length}
              </Badge>
              {milestonesData.length > 0 && (
                <span className="text-[10px] text-muted-foreground hidden md:inline">Grouped by week</span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0 hidden md:inline">
                {milestoneSectionOpen ? "Click to collapse" : "Click to expand"}
              </span>
              <ChevronDown className="ms-chevron h-4 w-4 text-muted-foreground shrink-0 ml-auto transition-transform" />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
          <div className="p-4 space-y-2">
            {canManageMilestones && (
              <div className="space-y-2 mb-3 rounded-lg border border-dashed border-border/60 p-3 bg-white/30 dark:bg-white/[0.02]">
                <div className="space-y-1">
                  <Textarea
                    placeholder="Milestone title…"
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    className="min-h-[64px] text-xs resize-y"
                    maxLength={2000}
                  />
                  <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                    {newMilestoneTitle.length}/2000
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Description (what assignees should do)
                  </Label>
                  <Textarea
                    placeholder="Clear work notes for assignees — steps, links, acceptance criteria…"
                    value={newMilestoneDescription}
                    onChange={(e) => setNewMilestoneDescription(e.target.value)}
                    className="min-h-[88px] text-sm resize-y"
                    maxLength={2000}
                  />
                  <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                    {newMilestoneDescription.length}/2000
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Due date * (UK)</Label>
                    <Input
                      type="date"
                      value={newMilestoneDue}
                      onChange={(e) => setNewMilestoneDue(e.target.value)}
                      className="h-8 text-xs w-full min-w-[140px] sm:w-[150px]"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Due time (optional, UK)</Label>
                    <Input
                      type="time"
                      value={newMilestoneDueTime}
                      onChange={(e) => setNewMilestoneDueTime(e.target.value)}
                      className="h-8 text-xs w-full min-w-[110px] sm:w-[120px]"
                    />
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0 w-full sm:w-auto sm:ml-auto" onClick={handleAddMilestone} disabled={milestoneSaving}>
                    {milestoneSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                    Add
                  </Button>
                </div>
                {milestoneAssigneeMembers.length > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      {userRole === "PROJECT_MANAGER"
                        ? "Assign to * (Developers / PM only — single or multiple)"
                        : "Assign to * (active project members — single or multiple)"}
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {milestoneAssigneeMembers.map((member) => {
                        const mUserId = extractStr(member, "userId", "");
                        const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
                        const mRole = formatMilestoneRole(
                          extractNestedStr(member, ["user", "role"], "") || extractStr(member, "role", "")
                        );
                        const selected = newMilestoneAssignees.includes(mUserId);
                        return (
                          <button
                            key={mUserId}
                            type="button"
                            onClick={() => toggleAssignee(newMilestoneAssignees, setNewMilestoneAssignees, mUserId)}
                            className={cn(
                              "text-[10px] px-2 py-1 rounded-full border transition-colors whitespace-normal text-left max-w-full",
                              selected
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                            )}
                          >
                            {mUserName}{mRole ? ` · ${mRole}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    {userRole === "PROJECT_MANAGER"
                      ? "Add a Developer or yourself as a project member first, then assign the milestone."
                      : "Add active team members to this project first, then assign the milestone."}
                  </p>
                )}
              </div>
            )}
            {milestonesData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No milestones yet</p>
            ) : (
              <div className="space-y-3">
                {/* Same week grouping for every role so nothing is hidden or cramped */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
                  <button
                    type="button"
                    onClick={() => setMilestoneWeekFilter("__all__")}
                    className={cn(
                      "shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                      milestoneWeekFilter === "__all__"
                        ? "bg-foreground text-background border-foreground"
                        : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                    )}
                  >
                    All weeks ({milestonesData.length})
                  </button>
                  {milestonesByWeek.map((week) => (
                    <button
                      key={week.key}
                      type="button"
                      onClick={() => setMilestoneWeekFilter(week.key)}
                      className={cn(
                        "shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                        milestoneWeekFilter === week.key
                          ? "bg-foreground text-background border-foreground"
                          : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                      )}
                    >
                      {week.label} ({week.items.length})
                    </button>
                  ))}
                </div>

                {(milestoneWeekFilter === "__all__"
                  ? milestonesByWeek
                  : milestonesByWeek.filter((w) => w.key === milestoneWeekFilter)
                ).map((week) => {
                  const weekDone = week.items.filter((m) => m.done === true).length;
                  return (
                    <div key={week.key} className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <h3 className="text-xs font-semibold tracking-tight break-words">{week.label}</h3>
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">
                            {weekDone}/{week.items.length} done
                          </Badge>
                        </div>
                      </div>
                      <MilestoneListWithDoneCollapsed
                        items={week.items}
                        userId={userId}
                        canManage={canManageMilestones}
                        onToggle={handleToggleMilestone}
                        onEdit={canManageMilestones ? openEditMilestone : undefined}
                        onDelete={canManageMilestones ? handleDeleteMilestone : undefined}
                        onDuplicate={canManageMilestones ? handleDuplicateMilestone : undefined}
                        onReorder={canManageMilestones ? handleReorderMilestones : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Edit milestone dialog */}
      <Dialog open={!!editingMilestone} onOpenChange={(o) => !o && setEditingMilestone(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Edit milestone</DialogTitle>
            <DialogDescription className="text-xs">Update title, description, due date, and assignees.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Textarea
                value={editMilestoneTitle}
                onChange={(e) => setEditMilestoneTitle(e.target.value)}
                className="min-h-[72px] text-sm resize-y"
                maxLength={2000}
              />
              <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                {editMilestoneTitle.length}/2000
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (what assignees should do)</Label>
              <Textarea
                value={editMilestoneDescription}
                onChange={(e) => setEditMilestoneDescription(e.target.value)}
                placeholder="Clear work notes for assignees — steps, links, acceptance criteria…"
                className="min-h-[120px] text-sm resize-y"
                maxLength={2000}
              />
              <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                {editMilestoneDescription.length}/2000
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Due date (UK)</Label>
                <Input type="date" value={editMilestoneDue} onChange={(e) => setEditMilestoneDue(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due time (optional, UK)</Label>
                <Input type="time" value={editMilestoneDueTime} onChange={(e) => setEditMilestoneDueTime(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {userRole === "PROJECT_MANAGER"
                  ? "Assignees * (Developers / PM only)"
                  : "Assignees * (active members)"}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {milestoneAssigneeMembers.map((member) => {
                  const mUserId = extractStr(member, "userId", "");
                  const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
                  const mRole = formatMilestoneRole(extractNestedStr(member, ["user", "role"], "") || extractStr(member, "role", ""));
                  const selected = editMilestoneAssignees.includes(mUserId);
                  return (
                    <button
                      key={mUserId}
                      type="button"
                      onClick={() => toggleAssignee(editMilestoneAssignees, setEditMilestoneAssignees, mUserId)}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-full border transition-colors whitespace-normal text-left max-w-full",
                        selected
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-muted/40 border-transparent text-muted-foreground"
                      )}
                    >
                      {mUserName}{mRole ? ` · ${mRole}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMilestone(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveMilestoneEdit} disabled={milestoneSaving}>
                {milestoneSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ Infrastructure Section (collapsed by default; remembers open state) ═══════ */}
      <Collapsible
        open={infraSectionOpen}
        onOpenChange={setInfraSectionOpenPersist}
        className="rounded-xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden"
        style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "180ms" }}
      >
        <div className="flex flex-col gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01] sm:flex-row sm:items-center sm:justify-between">
          <CollapsibleTrigger className="flex items-center gap-2 min-w-0 text-left group flex-1 [&[data-state=open]>svg.infra-chevron]:rotate-180">
            <Server className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-bold tracking-tight truncate">Infrastructure</h2>
            {infraItemCount > 0 && (
              <Badge variant="secondary" className="text-[10px] font-semibold h-5 px-1.5 shrink-0">{infraItemCount} items</Badge>
            )}
            {!canManageProject && infraMemberAccess.isActive && (
              <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shrink-0">
                Visible
                {infraMemberAccess.visibleUntil
                  ? ` until ${new Date(infraMemberAccess.visibleUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : " now"}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
              {infraSectionOpen ? "Click to collapse" : "Click to expand"}
            </span>
            <ChevronDown className="infra-chevron h-4 w-4 text-muted-foreground shrink-0 ml-auto transition-transform" />
          </CollapsibleTrigger>
          {canManageProject && (
            <div
              className="flex flex-wrap items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {infraSectionOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-[10px] gap-1"
                  onClick={() => setCustomGroupDialogOpen(true)}
                >
                  <Plus className="h-3 w-3" /> Custom group
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[10px] gap-1"
                onClick={() => {
                  setInfraAccessUserIds([]);
                  setInfraAccessDialogOpen(true);
                }}
              >
                <Users className="h-3 w-3" />
                Members
                {infraAccessGrants.length > 0 ? (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    {infraAccessGrants.length}
                  </Badge>
                ) : null}
              </Button>
              {infraAccessGrants.length > 0 && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[160px] sm:max-w-[220px]">
                  Access: {infraAccessGrants.map((g) => g.userName || "User").join(", ")}
                </span>
              )}
            </div>
          )}
        </div>

        <CollapsibleContent>
        <div className="p-4">
          {infraLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
            </div>
          ) : !infraCanView ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-5 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium">Infrastructure is hidden</p>
              <p className="text-xs text-muted-foreground mt-1">Ask an admin or project manager to grant temporary visibility.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {infraGroupDefs.map((group) => {
                const items = infraGroups[group.key] || [];
                return (
                  <div key={group.key} className="rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] overflow-hidden">
                    <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-black/[0.04] dark:border-white/[0.06]">
                      <div className="flex items-start gap-2 min-w-0">
                        {group.key === "GITHUB" ? (
                          <Github className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : group.key === "TURSO" ? (
                          <Database className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : group.key === "CLOUDFLARE" ? (
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                          <Server className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-bold tracking-tight truncate">{group.label}</p>
                            {!group.builtin && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0">Custom</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{group.description}</p>
                        </div>
                      </div>
                      {canManageProject && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2 gap-1 shrink-0"
                          onClick={() => openAddInfraItem(group.key, group.label)}
                        >
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      )}
                    </div>
                    <div className="p-2.5 space-y-2">
                      {items.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/60 italic py-2 text-center">No {group.label} items yet</p>
                      ) : (
                        items.map((item) => {
                          const revealed = revealedInfraItems[item.id];
                          const now = revealTick || Date.now();
                          const remaining = revealed ? Math.max(0, Math.ceil((revealed.expiresAt - now) / 1000)) : 0;
                          return (
                            <div key={item.id} className="rounded-md border border-black/[0.04] dark:border-white/[0.05] bg-background/60 p-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-xs font-semibold truncate">{item.label}</p>
                                    <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0">
                                      {item.isSecret ? "Secret" : "Plain"}
                                    </Badge>
                                    {item.isSecret && revealed && (
                                      <Badge className="h-4 px-1 text-[9px] shrink-0 bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                        {remaining}s
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                    {item.isSecret ? (
                                      revealed ? (
                                        <code className="text-[11px] font-mono truncate flex-1">{revealed.value}</code>
                                      ) : (
                                        <code className="text-[11px] font-mono text-muted-foreground flex-1">{item.hasValue ? "••••••••••••" : "No value set"}</code>
                                      )
                                    ) : item.value ? (
                                      <code className="text-[11px] font-mono truncate flex-1">{item.value}</code>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground/60 italic">No value set</span>
                                    )}
                                    {item.isSecret ? (
                                      revealed ? (
                                        <>
                                          <button onClick={() => copyToClipboard(revealed.value, item.label)} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Copy revealed value">
                                            <Copy className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={() => setRevealedInfraItems((prev) => { const next = { ...prev }; delete next[item.id]; return next; })}
                                            className="text-muted-foreground/40 hover:text-foreground/80 shrink-0"
                                            aria-label="Hide value"
                                          >
                                            <EyeOff className="h-3 w-3" />
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => handleRevealInfraItem(item)}
                                          disabled={!item.hasValue || revealing === item.id}
                                          className="text-muted-foreground/40 hover:text-foreground/80 shrink-0 disabled:opacity-50"
                                          aria-label="Reveal value"
                                        >
                                          {revealing === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                      )
                                    ) : item.value ? (
                                      <button onClick={() => copyToClipboard(item.value || "", item.label)} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Copy value">
                                        <Copy className="h-3 w-3" />
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                {canManageProject && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button type="button" onClick={() => openEditInfraItem(item)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Edit">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteInfraItem(item.id)}
                                      disabled={infraDeletingId === item.id}
                                      className="text-muted-foreground hover:text-red-500 transition-colors p-1 disabled:opacity-50"
                                      title="Delete"
                                    >
                                      {infraDeletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </CollapsibleContent>
      </Collapsible>

      {canManageProject && (
        <Dialog open={infraItemDialogOpen} onOpenChange={(open) => { if (!open) resetInfraItemDialog(); else setInfraItemDialogOpen(true); }}>
          <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Key className="h-4 w-4" /> {editingInfraItem ? "Edit Infrastructure Item" : "Add Infrastructure Item"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Secrets are encrypted at rest and are only revealed for 30 seconds.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Group</Label>
                <select
                  value={infraItemForm.groupKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    const def = infraGroupDefs.find((g) => g.key === key);
                    setInfraItemForm((p) => ({
                      ...p,
                      groupKey: key,
                      groupLabel: def?.label,
                    }));
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  {infraGroupDefs.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label}{group.builtin ? "" : " (custom)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Label</Label>
                <Input
                  value={infraItemForm.label}
                  onChange={(e) => setInfraItemForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Github Repo, database token, SMTP password..."
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-2">
                <div>
                  <p className="text-xs font-medium">Secret value</p>
                  <p className="text-[10px] text-muted-foreground">Secret values are masked in lists.</p>
                </div>
                <Switch
                  checked={infraItemForm.isSecret}
                  onCheckedChange={(checked) => setInfraItemForm((p) => ({ ...p, isSecret: checked }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Value {editingInfraItem && infraItemForm.isSecret ? <span className="text-muted-foreground">(leave blank to keep current)</span> : null}
                </Label>
                <Textarea
                  value={infraItemForm.value}
                  onChange={(e) => setInfraItemForm((p) => ({ ...p, value: e.target.value }))}
                  placeholder={infraItemForm.isSecret ? "Encrypted after save" : "Visible to users who can view infrastructure"}
                  className="min-h-24 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSaveInfraItem} disabled={infraSaving}>
                {infraSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={resetInfraItemDialog} disabled={infraSaving}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canManageProject && (
        <Dialog
          open={infraAccessDialogOpen}
          onOpenChange={(open) => {
            setInfraAccessDialogOpen(open);
            if (!open) setInfraAccessUserIds([]);
          }}
        >
          <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4 w-4" /> Temporary member access
              </DialogTitle>
              <DialogDescription className="text-xs">
                Select developers who can view infrastructure. Access auto-revokes when the timer ends.
              </DialogDescription>
            </DialogHeader>

            {infraAccessGrants.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active now</p>
                <div className="flex flex-col gap-1.5">
                  {infraAccessGrants.map((g) => (
                    <div key={g.userId} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{g.userName || "Developer"}</p>
                        {g.visibleUntil && (
                          <p className="text-[10px] text-muted-foreground">
                            Until {new Date(g.visibleUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[10px] text-red-600 shrink-0"
                        disabled={visibilitySaving}
                        onClick={() => handleUpdateInfraMemberAccess(null, [g.userId])}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium">Developers on this project</Label>
              {infraAccessCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/60 p-3">
                  No active developers on this project. Add a developer as a project member first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {infraAccessCandidates.map((m) => {
                    const uid = extractStr(m, "userId", "");
                    const name = extractNestedStr(m, ["user", "name"], "Developer");
                    const selected = infraAccessUserIds.includes(uid);
                    const alreadyActive = infraAccessGrants.some((g) => g.userId === uid);
                    return (
                      <button
                        key={uid}
                        type="button"
                        onClick={() => toggleInfraAccessUser(uid)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                          selected
                            ? "border-foreground/40 bg-foreground text-background"
                            : "border-border/60 bg-background/70 hover:bg-muted/50"
                        )}
                      >
                        <span className="truncate max-w-[120px]">{name}</span>
                        {alreadyActive && !selected && (
                          <span className="text-[9px] opacity-70">active</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs font-medium shrink-0">Duration</Label>
              <select
                value={visibilityPreset}
                onChange={(e) => setVisibilityPreset(e.target.value)}
                className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                disabled={visibilitySaving}
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="240">4 hours</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={enableInfraVisibility}
                disabled={visibilitySaving || infraAccessUserIds.length === 0}
              >
                {visibilitySaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                Grant access
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => handleUpdateInfraMemberAccess(null, infraAccessUserIds)}
                disabled={visibilitySaving || infraAccessUserIds.length === 0}
              >
                <EyeOff className="h-3 w-3" />
                Revoke selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setInfraAccessDialogOpen(false)}
                disabled={visibilitySaving}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canManageProject && (
        <Dialog
          open={customGroupDialogOpen}
          onOpenChange={(open) => {
            setCustomGroupDialogOpen(open);
            if (!open) setCustomGroupName("");
          }}
        >
          <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Add custom infrastructure group</DialogTitle>
              <DialogDescription className="text-xs">
                Create a named group beyond GitHub, Turso, Cloudflare, and SMTP. Then add items to it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Group name</Label>
              <Input
                value={customGroupName}
                onChange={(e) => setCustomGroupName(e.target.value)}
                placeholder="e.g. Vercel, AWS, Stripe"
                className="h-9 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateCustomGroup();
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleCreateCustomGroup}>
                <Plus className="h-3 w-3" /> Create group
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setCustomGroupDialogOpen(false);
                  setCustomGroupName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}


      {/* ═══════ Website Management Dialog ═══════ */}
      <Dialog open={websiteMgmtOpen} onOpenChange={(open) => { setWebsiteMgmtOpen(open); if (!open) { setEditingWebsiteId(null); setEditingWebsiteUrl(""); setEditingWebsiteLabel(""); } }}>
        <DialogContent className="sm:max-w-lg bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Globe className="h-4 w-4" /> Manage Websites
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add, edit, or remove website URLs for this project.
            </DialogDescription>
          </DialogHeader>

          {/* Add website form */}
          <div className="space-y-2 pb-3 border-b border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Website</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="https://example.com"
                value={newWebsiteUrl}
                onChange={(e) => setNewWebsiteUrl(e.target.value)}
                className="h-8 text-xs flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddWebsite(); } }}
              />
              <Input
                placeholder="Label (e.g. Production)"
                value={newWebsiteLabel}
                onChange={(e) => setNewWebsiteLabel(e.target.value)}
                className="h-8 text-xs sm:w-36"
              />
              <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={handleAddWebsite} disabled={!newWebsiteUrl.trim()}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </div>

          {/* Existing websites list */}
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {websites.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No websites added yet.</p>
            )}
            {websites.map((w) => {
              const wId = extractStr(w, "id", "");
              const wUrl = extractStr(w, "url", "");
              const wLabel = extractStr(w, "label", "");
              const wIsPrimary = w.isPrimary === true || extractStr(w, "isPrimary", "") === "true";
              return (
                <div key={wId} className="rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] overflow-hidden">
                  {editingWebsiteId === wId ? (
                    <div className="flex flex-col sm:flex-row gap-2 p-2">
                      <Input
                        value={editingWebsiteUrl}
                        onChange={(e) => setEditingWebsiteUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="h-8 text-xs flex-1"
                        autoFocus
                      />
                      <Input
                        value={editingWebsiteLabel}
                        onChange={(e) => setEditingWebsiteLabel(e.target.value)}
                        placeholder="Label"
                        className="h-8 text-xs sm:w-28"
                      />
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" className="h-8 px-3 text-xs" onClick={() => {
                          handleUpdateWebsite(wId, { url: editingWebsiteUrl, label: editingWebsiteLabel });
                          setEditingWebsiteId(null);
                        }}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setEditingWebsiteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2">
                      <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{wLabel || wUrl}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{wUrl}</p>
                      </div>
                      {wIsPrimary && <span title="Primary"><Star className="h-3 w-3 text-amber-500 shrink-0" /></span>}
                      {!wIsPrimary && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] shrink-0" onClick={() => handleSetPrimaryWebsite(wId)} title="Set as primary">
                          Primary
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 shrink-0" onClick={() => { setEditingWebsiteId(wId); setEditingWebsiteUrl(wUrl); setEditingWebsiteLabel(wLabel); }} aria-label="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 shrink-0 text-red-500 hover:text-red-600" onClick={() => setDeleteWebsiteId(wId)} aria-label="Delete">
                        <Trash2Icon className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ Remove Member Confirmation ═══════ */}
      {removeMemberUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Remove Team Member</h3>
              <p className="text-xs text-muted-foreground mt-1">Are you sure you want to remove this member from the project? They will lose access to all project tasks and data.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRemoveMemberUserId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleRemoveMember(removeMemberUserId);
                  setRemoveMemberUserId(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Delete Website Confirmation ═══════ */}
      {deleteWebsiteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Delete Website</h3>
              <p className="text-xs text-muted-foreground mt-1">Are you sure you want to delete this website URL? This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeleteWebsiteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleDeleteWebsite(deleteWebsiteId);
                  setDeleteWebsiteId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {projectId && (
        <>
          <ProjectCredentialsDialog
            projectId={projectId}
            open={credentialsDialogOpen}
            onOpenChange={setCredentialsDialogOpen}
          />
          <ProjectMethodsDialog
            projectId={projectId}
            open={methodsDialogOpen}
            onOpenChange={setMethodsDialogOpen}
            canManageCatalog={canManageProject}
          />
        </>
      )}
    </div>
  );
}
