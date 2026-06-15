"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { X, FolderKanban, Minus, ChevronUp, ChevronDown } from "lucide-react";
import { useFloatingBoards, type FloatingBoard } from "./providers/floating-board-provider";

// ─── Mobile detection hook ────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

// ─── Imperative drag/resize (outside React lifecycle — no stale closures) ─
function useDragResize(
  elRef: React.RefObject<HTMLDivElement | null>,
  onPositionChange: (pos: { x: number; y: number }) => void,
  onSizeChange: (size: { width: number; height: number }) => void,
  isMobile: boolean,
) {
  // Keep latest callbacks in refs so imperative handlers always have fresh values
  const onPosRef = useRef(onPositionChange);
  const onSzRef = useRef(onSizeChange);
  onPosRef.current = onPositionChange;
  onSzRef.current = onSizeChange;

  const startDrag = useCallback(
    (e: React.MouseEvent | React.TouchEvent, origX: number, origY: number) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const isMouse = "clientX" in e;
      if (!isMouse) (e as React.TouchEvent).preventDefault();

      const el = elRef.current;
      if (!el) return;

      const startX = isMouse ? (e as React.MouseEvent).clientX : e.touches[0].clientX;
      const startY = isMouse ? (e as React.MouseEvent).clientY : e.touches[0].clientY;
      let hasMoved = false;
      let lastX = origX;
      let lastY = origY;

      // Block iframe pointer events during drag
      const iframe = el.querySelector("iframe") as HTMLIFrameElement | null;
      if (iframe) iframe.style.pointerEvents = "none";

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const cx = "clientX" in ev
          ? (ev as MouseEvent).clientX
          : (ev as TouchEvent).touches[0].clientX;
        const cy = "clientY" in ev
          ? (ev as MouseEvent).clientY
          : (ev as TouchEvent).touches[0].clientY;
        const dx = cx - startX;
        const dy = cy - startY;

        // Require 5px movement before starting actual drag (prevents accidental drags)
        if (!hasMoved) {
          if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
          hasMoved = true;
          if (isMouse) (ev as MouseEvent).preventDefault();
        }

        const nx = Math.max(0, Math.min(window.innerWidth - 60, origX + dx));
        const ny = Math.max(0, Math.min(window.innerHeight - 50, origY + dy));
        el.style.left = nx + "px";
        el.style.top = ny + "px";
        lastX = nx;
        lastY = ny;
      };

      const onUp = () => {
        if (iframe) iframe.style.pointerEvents = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        window.removeEventListener("touchcancel", onUp);
        if (hasMoved) {
          onPosRef.current({ x: lastX, y: lastY });
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
      window.addEventListener("touchcancel", onUp);
    },
    [elRef]
  );

  const startResize = useCallback(
    (e: React.MouseEvent, origW: number, origH: number) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();

      const el = elRef.current;
      if (!el) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let lastW = origW;
      let lastH = origH;

      // Block iframe pointer events during resize — prevents iframe from stealing mouseup
      const iframe = el.querySelector("iframe") as HTMLIFrameElement | null;
      if (iframe) iframe.style.pointerEvents = "none";

      const onMove = (ev: MouseEvent) => {
        const nw = Math.max(420, origW + (ev.clientX - startX));
        const nh = Math.max(260, origH + (ev.clientY - startY));
        el.style.width = nw + "px";
        el.style.height = nh + "px";
        lastW = nw;
        lastH = nh;
      };

      const onUp = () => {
        // ALWAYS restore iframe and clean up — even if mouse was captured
        if (iframe) iframe.style.pointerEvents = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        onSzRef.current({ width: lastW, height: lastH });
      };

      // Use DOCUMENT level with capture for mouseup — more reliable than window
      // This ensures we catch the mouseup even if iframe briefly captures it
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp, true); // capture phase
    },
    [elRef, isMobile]
  );

  return { startDrag, startResize };
}

// ─── Global restore lock — prevents concurrent capsule restores ─────────
let _globalRestoreLock = 0;
const RESTORE_LOCK_MS = 350;

// ─── Presence indicator (shows other users viewing the same board) ─────
interface PresenceUser {
  userId: string;
  userName: string;
  status: "active" | "idle";
  lastSeen: number;
}

function PresenceIndicator({ projectId }: { projectId: string }) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchPresence = async () => {
      try {
        const res = await fetch(`/api/board-presence?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch { /* silent */ }
    };

    fetchPresence();
    intervalRef.current = setInterval(fetchPresence, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectId]);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 ml-auto mr-1">
      <div className="flex -space-x-1.5">
        {users.slice(0, 4).map((u) => (
          <div
            key={u.userId}
            className="relative"
            title={`${u.userName} — ${u.status === "active" ? "Viewing now" : "Inactive"}`}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center text-[8px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-black/40">
              {u.userName.charAt(0).toUpperCase()}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-black/60 ${
              u.status === "active" ? "bg-emerald-400" : "bg-amber-400"
            }`} />
          </div>
        ))}
      </div>
      {users.length > 4 && (
        <span className="text-[9px] text-muted-foreground/70 font-medium">+{users.length - 4}</span>
      )}
    </div>
  );
}

// ─── Smart Capsule Hub — ONE capsule for ALL minimized boards ──────────
function SmartCapsuleHub({
  minimizedBoards,
  onRestore,
  onClose,
}: {
  minimizedBoards: FloatingBoard[];
  onRestore: (projectId: string) => void;
  onClose: (projectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 16, y: 0 });
  const isMobile = useIsMobile();
  const hubRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const hasMovedRef = useRef(false);
  const touchActiveRef = useRef(false);

  const bottomOffset = isMobile ? 24 : 16;
  const defaultY = typeof window !== "undefined"
    ? window.innerHeight - bottomOffset - 40
    : 0;
  const defaultX = typeof window !== "undefined"
    ? Math.min(position.x, window.innerWidth - (expanded ? 220 : 180))
    : 16;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const y = window.innerHeight - bottomOffset - 40;
    const x = Math.min(position.x, window.innerWidth - (expanded ? 220 : 180));
    setPosition({ x, y });
  }, [expanded, bottomOffset]);

  // Close expanded panel when clicking outside
  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: Event) => {
      if (hubRef.current && !hubRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [expanded]);

  // Drag support for collapsed capsule
  useEffect(() => {
    const el = hubRef.current;
    if (!el) return;

    const handleStart = (e: MouseEvent) => {
      if (expanded) return;
      if ((e.target as HTMLElement).closest("button")) return;
      dragStartRef.current = { sx: e.clientX, sy: e.clientY, ox: defaultX, oy: defaultY };
      hasMovedRef.current = false;
      touchActiveRef.current = true;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (expanded) return;
      if ((e.target as HTMLElement).closest("button")) return;
      dragStartRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, ox: defaultX, oy: defaultY };
      hasMovedRef.current = false;
      touchActiveRef.current = true;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !el) return;
      const dx = e.clientX - dragStartRef.current.sx;
      const dy = e.clientY - dragStartRef.current.sy;
      if (!hasMovedRef.current && (Math.abs(dx) < 5 && Math.abs(dy) < 5)) return;
      hasMovedRef.current = true;
      const nx = Math.max(0, Math.min(window.innerWidth - 80, dragStartRef.current.ox + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 50, dragStartRef.current.oy + dy));
      setPosition({ x: nx, y: ny });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current || !el) return;
      const dx = e.touches[0].clientX - dragStartRef.current.sx;
      const dy = e.touches[0].clientY - dragStartRef.current.sy;
      if (!hasMovedRef.current && (Math.abs(dx) < 5 && Math.abs(dy) < 5)) return;
      hasMovedRef.current = true;
      e.preventDefault();
      const nx = Math.max(0, Math.min(window.innerWidth - 80, dragStartRef.current.ox + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 50, dragStartRef.current.oy + dy));
      setPosition({ x: nx, y: ny });
    };

    const handleEnd = (e: Event) => {
      if (!touchActiveRef.current) return;
      touchActiveRef.current = false;
      dragStartRef.current = null;
    };

    el.addEventListener("mousedown", handleStart);
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("mouseup", handleEnd, true);
    window.addEventListener("touchend", handleEnd, true);
    window.addEventListener("touchcancel", handleEnd, true);

    return () => {
      touchActiveRef.current = false;
      el.removeEventListener("mousedown", handleStart);
      el.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleEnd, true);
      window.removeEventListener("touchend", handleEnd, true);
      window.removeEventListener("touchcancel", handleEnd, true);
    };
  }, [expanded, defaultX, defaultY]);

  const handleToggle = useCallback(() => {
    if (hasMovedRef.current) return;
    const now = Date.now();
    if (now - _globalRestoreLock < RESTORE_LOCK_MS) return;
    _globalRestoreLock = now;
    setExpanded((prev) => !prev);
  }, []);

  const handleRestore = useCallback((projectId: string) => {
    const now = Date.now();
    if (now - _globalRestoreLock < RESTORE_LOCK_MS) return;
    _globalRestoreLock = now;
    setExpanded(false);
    onRestore(projectId);
  }, [onRestore]);

  if (minimizedBoards.length === 0) return null;

  return (
    <div
      ref={hubRef}
      className="fixed z-[9999] select-none"
      style={{ left: defaultX, top: defaultY }}
    >
      {!expanded && (
        <div
          className="group/smart flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-2xl
            bg-white/90 dark:bg-white/[0.1]
            backdrop-blur-2xl saturate-[1.8]
            border border-white/40 dark:border-white/[0.12]
            shadow-[0_4px_24px_rgba(0,0,0,0.1),0_0_0_0.5px_rgba(0,0,0,0.03),inset_0_0.5px_0_rgba(255,255,255,0.6),inset_0_1px_0_rgba(255,255,255,0.4)]
            dark:shadow-[0_4px_24px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08)]
            cursor-pointer
            hover:shadow-[0_8px_32px_rgba(0,0,0,0.14),0_0_0_0.5px_rgba(0,0,0,0.04),inset_0_0.5px_0_rgba(255,255,255,0.7)]
            dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.08)]
            transition-all duration-200 ease-out
            hover:scale-[1.02] active:scale-[0.98] touch-none"
          onClick={handleToggle}
          title={`${minimizedBoards.length} task board${minimizedBoards.length > 1 ? "s" : ""} minimized`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-md shrink-0">
              <FolderKanban className="h-3 w-3 text-white" />
              <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center shadow-sm border border-white/30">
                {minimizedBoards.length}
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-foreground/90 dark:text-white/80 leading-tight">
                Task Boards
              </span>
              <span className="text-[9px] text-muted-foreground/70 dark:text-white/50 leading-tight truncate max-w-[120px]">
                {minimizedBoards.length === 1
                  ? minimizedBoards[0].projectName
                  : `${minimizedBoards.length} boards minimized`}
              </span>
            </div>
          </div>
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 group-hover/smart:text-muted-foreground/80 transition-colors" />
        </div>
      )}

      {expanded && (
        <div
          className="rounded-2xl overflow-hidden
            bg-white/95 dark:bg-black/60
            backdrop-blur-2xl saturate-[1.8]
            border border-white/40 dark:border-white/[0.1]
            shadow-[0_8px_40px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.03),inset_0_0.5px_0_rgba(255,255,255,0.6)]
            dark:shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08)]
            animate-in slide-in-from-bottom-2 fade-in duration-200"
          style={{ width: Math.max(200, Math.min(240, typeof window !== "undefined" ? window.innerWidth - 40 : 240)) }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[11px] font-semibold text-foreground/80 dark:text-white/70">
                Minimized Boards
              </span>
              <span className="text-[9px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full px-1.5 py-0.5 leading-none">
                {minimizedBoards.length}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="w-5 h-5 rounded-full flex items-center justify-center
                text-muted-foreground/50 hover:text-foreground/80 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]
                transition-all duration-150"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
            {minimizedBoards.map((board) => (
              <div
                key={board.projectId}
                className="group/item flex items-center gap-2.5 px-3 py-2
                  hover:bg-black/[0.03] dark:hover:bg-white/[0.04]
                  border-b border-black/[0.03] dark:border-white/[0.04] last:border-b-0
                  transition-colors duration-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); handleRestore(board.projectId); }}
              >
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500/80 to-cyan-400/80 flex items-center justify-center shadow-sm shrink-0">
                  <FolderKanban className="h-2.5 w-2.5 text-white" />
                </div>
                <span className="text-[11px] font-medium text-foreground/80 dark:text-white/70 truncate flex-1 min-w-0">
                  {board.projectName}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(board.projectId); }}
                  className="w-5 h-5 rounded-full flex items-center justify-center
                    text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10
                    opacity-0 group-hover/item:opacity-100
                    transition-all duration-150 shrink-0"
                  title="Close board"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Floating Window ─────────────────────────────────────────────
function FloatingBoardWindow({
  board,
  onClose,
  onMinimize,
  onBringToFront,
  onRestoreBoard,
  onPositionChange,
  onSizeChange,
}: {
  board: FloatingBoard;
  onClose: () => void;
  onMinimize: () => void;
  onBringToFront: () => void;
  onRestoreBoard: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { startDrag, startResize } = useDragResize(elRef, onPositionChange, onSizeChange, isMobile);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeSrc = `/dashboard/projects/${board.projectId}?embed=true`;
  const [glowing, setGlowing] = useState(false);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerGlow = useCallback(() => {
    setGlowing(true);
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => setGlowing(false), 1200);
  }, []);

  // Presence heartbeat
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (board.minimized) {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        await fetch("/api/board-presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ projectId: board.projectId }),
        });
      } catch { /* silent */ }
    };

    sendHeartbeat();
    presenceIntervalRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
    };
  }, [board.projectId, board.minimized]);

  // Remove presence when board is closed
  useEffect(() => {
    return () => {
      try {
        fetch("/api/board-presence", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ projectId: board.projectId }),
        }).catch(() => {});
      } catch { /* silent */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBringToFront = useCallback(() => {
    onBringToFront();
    triggerGlow();
  }, [onBringToFront, triggerGlow]);

  const handleRestore = useCallback(() => {
    onRestoreBoard();
    triggerGlow();
  }, [onRestoreBoard, triggerGlow]);

  const windowVisible = !board.minimized;

  return (
    <div
      ref={elRef}
      style={{
        display: windowVisible ? "flex" : "none",
        visibility: windowVisible ? "visible" : "hidden",
        pointerEvents: windowVisible ? "auto" : "none",
        left: board.position.x,
        top: board.position.y,
        width: board.size.width,
        height: board.size.height,
        zIndex: board.zIndex,
      }}
      className={isMobile
        ? `fixed inset-0 z-[10000] flex-col bg-white dark:bg-[#0a0a0a]`
        : `fixed flex-col overflow-hidden
           rounded-2xl
           bg-white/75 dark:bg-black/40
           backdrop-blur-2xl saturate-[1.8]
           border border-white/40 dark:border-white/[0.1]
           shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06),0_16px_56px_rgba(0,0,0,0.06),inset_0_0.5px_0_rgba(255,255,255,0.7),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-0.5px_0_rgba(0,0,0,0.02)]
           dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.2),0_16px_56px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]
           ${glowing ? "ring-2 ring-blue-400/60 ring-offset-1 ring-offset-transparent transition-shadow duration-300" : ""}`
      }
      onMouseDown={handleBringToFront}
      onTouchStart={(e) => {
        if (!board.minimized) handleBringToFront();
      }}
    >
      {isMobile ? (
        <>
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0 select-none
            bg-white/80 dark:bg-white/[0.06]
            border-b border-black/[0.06] dark:border-white/[0.08]
            backdrop-blur-xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onMinimize(); }}
                  className="w-8 h-8 rounded-full bg-yellow-400/20 active:bg-yellow-400/40 flex items-center justify-center transition-colors"
                  title="Minimize"
                >
                  <Minus className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); }}
                  className="w-8 h-8 rounded-full bg-red-400/20 active:bg-red-400/40 flex items-center justify-center transition-colors"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </button>
              </div>
              <span className="text-[12px] font-semibold text-foreground/80 dark:text-white/70 truncate ml-1">
                {board.projectName}
              </span>
            </div>
            <PresenceIndicator projectId={board.projectId} />
          </div>
          <div className="flex-1 relative overflow-hidden">
            {!iframeReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-black/70 z-10">
                <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
              </div>
            )}
            <iframe
              src={iframeSrc}
              className="absolute inset-0 w-full h-full border-0"
              title={board.projectName}
              onLoad={() => setIframeReady(true)}
            />
          </div>
        </>
      ) : (
        <>
          {/* Title Bar */}
          <div
            className="flex items-center justify-between px-3 py-2 shrink-0 select-none cursor-move
              bg-white/50 dark:bg-white/[0.04]
              border-b border-black/[0.04] dark:border-white/[0.06]
              touch-none"
            onMouseDown={(e) => startDrag(e, board.position.x, board.position.y)}
            onTouchStart={(e) => startDrag(e, board.position.x, board.position.y)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={onClose} className="w-[11px] h-[11px] rounded-full bg-[#ff5f57] hover:brightness-90 transition-all hover:shadow-[0_0_4px_rgba(255,95,87,0.4)]" title="Close" />
                <button onClick={onMinimize} className="w-[11px] h-[11px] rounded-full bg-[#febc2e] hover:brightness-90 transition-all hover:shadow-[0_0_4px_rgba(254,188,46,0.4)]" title="Minimize" />
                <div className="w-[11px] h-[11px] rounded-full bg-[#28c840]/40" />
              </div>
              <span className="text-[11px] font-semibold text-foreground/80 dark:text-white/70 truncate select-none">
                {board.projectName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <PresenceIndicator projectId={board.projectId} />
              <span className="text-[8px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-foreground/50 dark:text-white/40 rounded px-1.5 h-4 flex items-center">
                Task Board
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 relative bg-white dark:bg-[#0a0a0a] rounded-b-2xl overflow-hidden">
            {!iframeReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-black/60 backdrop-blur-sm z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
                  <span className="text-[10px] text-muted-foreground">Loading board...</span>
                </div>
              </div>
            )}
            <iframe
              src={iframeSrc}
              className="absolute inset-0 w-full h-full border-0"
              title={`${board.projectName} — Task Board`}
              onLoad={() => setIframeReady(true)}
            />
          </div>

          {/* Visible Resize Handle — desktop only, with proper mouse handling */}
          {!isMobile && (
            <div
              onMouseDown={(e) => startResize(e, board.size.width, board.size.height)}
              className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-20
                flex items-center justify-center
                hover:bg-blue-500/10 rounded-tl-lg
                transition-colors duration-150"
              title="Drag to resize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-foreground/30 hover:text-blue-500 transition-colors">
                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Floating Board Renderer (placed in dashboard layout) ─────────────
export function FloatingBoardRenderer() {
  const {
    boards,
    closeBoard,
    minimizeBoard,
    bringToFront,
    restoreBoard,
    updatePosition,
    updateSize,
    closeAll,
    isAdmin,
  } = useFloatingBoards();

  if (!isAdmin || boards.length === 0) return null;

  const hasOpenBoard = boards.some((b) => !b.minimized);
  const minimizedBoards = boards.filter((b) => b.minimized);

  return (
    <>
      {hasOpenBoard && (
        <button
          onClick={closeAll}
          className="fixed top-4 right-4 z-[10001] flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
            bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-medium
            backdrop-blur-2xl saturate-[1.8]
            border border-white/20
            shadow-[0_2px_12px_rgba(239,68,68,0.25),inset_0_0.5px_0_rgba(255,255,255,0.3)]
            hover:shadow-[0_4px_20px_rgba(239,68,68,0.35),inset_0_0.5px_0_rgba(255,255,255,0.4)]
            transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
            md:top-4 md:right-4"
          style={{ zIndex: 10001 }}
          title="Close all floating task boards"
        >
          <X className="h-3 w-3" />
          <span className="hidden sm:inline">Close All</span>
        </button>
      )}

      {boards
        .filter((b) => !b.minimized)
        .map((board) => (
          <FloatingBoardWindow
            key={board.projectId}
            board={board}
            onClose={() => closeBoard(board.projectId)}
            onMinimize={() => minimizeBoard(board.projectId)}
            onBringToFront={() => bringToFront(board.projectId)}
            onRestoreBoard={() => restoreBoard(board.projectId)}
            onPositionChange={(pos) => updatePosition(board.projectId, pos)}
            onSizeChange={(size) => updateSize(board.projectId, size)}
          />
        ))
      }

      {minimizedBoards.length > 0 && (
        <SmartCapsuleHub
          minimizedBoards={minimizedBoards}
          onRestore={(projectId) => restoreBoard(projectId)}
          onClose={(projectId) => closeBoard(projectId)}
        />
      )}
    </>
  );
}

// Re-export for backward compatibility
export { useFloatingBoards } from "./providers/floating-board-provider";
export type { FloatingBoard } from "./providers/floating-board-provider";