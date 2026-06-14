"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { X, FolderKanban, Minus } from "lucide-react";
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

// ─── Touch + Mouse drag/resize helpers ─────────────────────────────────
function useDragResize(
  elRef: React.RefObject<HTMLDivElement | null>,
  onPositionChange: (pos: { x: number; y: number }) => void,
  onSizeChange: (size: { width: number; height: number }) => void,
  isMobile: boolean,
) {
  const dragState = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeState = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  const startDrag = useCallback(
    (e: React.MouseEvent | React.TouchEvent, origX: number, origY: number) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const isMouseEvent = "clientX" in e;
      if (!isMouseEvent) {
        (e as React.TouchEvent).preventDefault();
      } else {
        (e as React.MouseEvent).preventDefault();
      }
      const pt = isMouseEvent
        ? { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
        : { x: (e as React.TouchEvent).touches[0].clientX, y: (e as React.TouchEvent).touches[0].clientY };
      dragState.current = { sx: pt.x, sy: pt.y, ox: origX, oy: origY };
    },
    []
  );

  const startResize = useCallback(
    (e: React.MouseEvent, origW: number, origH: number) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      resizeState.current = { sx: e.clientX, sy: e.clientY, ow: origW, oh: origH };
    },
    [isMobile]
  );

  useEffect(() => {
    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const pt =
        "touches" in e
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };

      if (dragState.current && elRef.current) {
        const { sx, sy, ox, oy } = dragState.current;
        const nx = Math.max(0, Math.min(window.innerWidth - 60, ox + (pt.x - sx)));
        const ny = Math.max(0, Math.min(window.innerHeight - 50, oy + (pt.y - sy)));
        elRef.current.style.left = nx + "px";
        elRef.current.style.top = ny + "px";
      }
      if (resizeState.current && elRef.current && !isMobile) {
        const { sx, sy, ow, oh } = resizeState.current;
        const nw = Math.max(420, ow + (pt.x - sx));
        const nh = Math.max(260, oh + (pt.y - sy));
        elRef.current.style.width = nw + "px";
        elRef.current.style.height = nh + "px";
      }
    };

    const onPointerUp = () => {
      if (dragState.current && elRef.current) {
        const fx = parseInt(elRef.current.style.left) || dragState.current.ox;
        const fy = parseInt(elRef.current.style.top) || dragState.current.oy;
        onPositionChange({ x: fx, y: fy });
        dragState.current = null;
      }
      if (resizeState.current && elRef.current) {
        const fw = parseInt(elRef.current.style.width) || resizeState.current.ow;
        const fh = parseInt(elRef.current.style.height) || resizeState.current.oh;
        onSizeChange({ width: fw, height: fh });
        resizeState.current = null;
      }
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
    window.addEventListener("touchcancel", onPointerUp);

    return () => {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
      window.removeEventListener("touchcancel", onPointerUp);
    };
  }, [elRef, onPositionChange, onSizeChange, isMobile]);

  return { startDrag, startResize };
}

// ─── Global restore lock — prevents concurrent capsule restores ─────────
let _globalRestoreLock = 0;
const RESTORE_LOCK_MS = 350;

// ─── Minimized Capsule ────────────────────────────────────────────────
function MinimizedCapsule({
  board,
  boardIndex,
  totalCapsules,
  onClose,
  onRestore,
  onPositionChange,
}: {
  board: FloatingBoard;
  boardIndex: number;
  totalCapsules: number;
  onClose: () => void;
  onRestore: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
}) {
  const capsuleRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const hasMoved = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  // Prevent double-fire: ignore restore if called within 400ms
  const lastRestoreRef = useRef(0);
  // Stable refs for callbacks — avoid effect re-running on every render
  const onRestoreRef = useRef(onRestore);
  const onPositionChangeRef = useRef(onPositionChange);
  onRestoreRef.current = onRestore;
  onPositionChangeRef.current = onPositionChange;
  // Track if this capsule's touch is active
  const touchActiveRef = useRef(false);

  const bottomOffset = isMobile ? 24 + boardIndex * 48 : 16;
  const topPos = typeof window !== "undefined"
    ? window.innerHeight - bottomOffset - 40
    : 0;

  const displayX = board.position.x;
  const displayY = board.position.y < 100 ? topPos : board.position.y;

  useEffect(() => {
    const el = capsuleRef.current;
    if (!el) return;

    const handleStart = (e: MouseEvent | TouchEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const pt = "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
      dragStartPos.current = { x: pt.x, y: pt.y, dx: displayX, dy: displayY };
      hasMoved.current = false;
      touchActiveRef.current = true;
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartPos.current || !el) return;
      const pt = "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
      const dx = pt.x - dragStartPos.current.x;
      const dy = pt.y - dragStartPos.current.y;

      if (!hasMoved.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasMoved.current = true;
      }

      if (hasMoved.current) {
        if ("touches" in e) e.preventDefault();
        const nx = Math.max(0, Math.min(window.innerWidth - 80, dragStartPos.current.dx + dx));
        const ny = Math.max(0, Math.min(window.innerHeight - 50, dragStartPos.current.dy + dy));
        el.style.left = nx + "px";
        el.style.top = ny + "px";
      }
    };

    const handleEnd = (e: Event) => {
      // Only handle if THIS capsule's touch is active
      if (!touchActiveRef.current) return;
      touchActiveRef.current = false;
      if (!dragStartPos.current || !el) return;
      // CRITICAL: stopImmediatePropagation to prevent ALL other capsule
      // listeners (registered on window capture) from firing
      e.stopImmediatePropagation();
      e.stopPropagation();
      if (!hasMoved.current) {
        // Global restore lock — only one capsule can restore at a time
        const now = Date.now();
        if (now - _globalRestoreLock < RESTORE_LOCK_MS) return;
        if (now - lastRestoreRef.current < 400) return;
        _globalRestoreLock = now;
        lastRestoreRef.current = now;
        onRestoreRef.current();
      } else {
        const fx = parseInt(el.style.left) || dragStartPos.current.dx;
        const fy = parseInt(el.style.top) || dragStartPos.current.dy;
        onPositionChangeRef.current({ x: fx, y: fy });
      }
      dragStartPos.current = null;
    };

    el.addEventListener("mousedown", handleStart);
    el.addEventListener("touchstart", handleStart, { passive: true });
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleEnd, true);
    window.addEventListener("touchend", handleEnd, true);
    window.addEventListener("touchcancel", handleEnd, true);

    return () => {
      touchActiveRef.current = false;
      el.removeEventListener("mousedown", handleStart);
      el.removeEventListener("touchstart", handleStart);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("mouseup", handleEnd, true);
      window.removeEventListener("touchend", handleEnd, true);
      window.removeEventListener("touchcancel", handleEnd, true);
    };
  }, [displayX, displayY, topPos]);

  return (
    <div
      ref={capsuleRef}
      className="fixed z-[9999] select-none"
      style={{
        left: displayX,
        top: displayY,
        zIndex: board.zIndex,
      }}
    >
      <div
        className="group/cap flex items-center gap-2 pl-2.5 pr-1 py-1.5 rounded-full
          bg-white/80 dark:bg-white/[0.08]
          backdrop-blur-2xl saturate-[1.8]
          border border-white/30 dark:border-white/[0.12]
          shadow-[0_2px_20px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.03),inset_0_0.5px_0_rgba(255,255,255,0.6),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-0.5px_0_rgba(0,0,0,0.02)]
          dark:shadow-[0_2px_20px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.05),inset_0_0.5px_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]
          cursor-pointer
          hover:shadow-[0_4px_28px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04),inset_0_0.5px_0_rgba(255,255,255,0.7),inset_0_1px_0_rgba(255,255,255,0.5)]
          dark:hover:shadow-[0_4px_28px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.1)]
          transition-shadow duration-200 ease-out
          active:scale-[0.96]
          touch-none"
        title="Tap to restore · Drag to move"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-sm shrink-0">
            <FolderKanban className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-foreground/90 dark:text-white/80 max-w-[140px] truncate">
            {board.projectName}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="h-6 w-6 rounded-full flex items-center justify-center
            text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10
            sm:opacity-0 sm:group-hover/cap:opacity-100
            transition-all duration-150 shrink-0"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Floating Window ─────────────────────────────────────────────
// KEY: The iframe is ALWAYS rendered (never unmounted). When minimized,
// the window is hidden with visibility:hidden + pointer-events:none.
// Capsule renders conditionally. This makes restore INSTANT.
function FloatingBoardWindow({
  board,
  boardIndex,
  totalCapsules,
  onClose,
  onMinimize,
  onBringToFront,
  onRestoreBoard,
  onPositionChange,
  onSizeChange,
}: {
  board: FloatingBoard;
  boardIndex: number;
  totalCapsules: number;
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
  const iframeSrc = `/dashboard/projects/${board.projectId}`;

  // Use visibility instead of display:none to keep layout alive
  // This is instant — no reflow, no paint, no re-render
  const windowVisible = !board.minimized;

  return (
    <>
      {/* ── The actual window (instantly hidden/shown via visibility) ── */}
      <div
        ref={elRef}
        style={{
          visibility: windowVisible ? "visible" : "hidden",
          pointerEvents: windowVisible ? "auto" : "none",
          left: board.position.x,
          top: board.position.y,
          width: board.size.width,
          height: board.size.height,
          zIndex: board.zIndex,
        }}
        className={isMobile
          ? `fixed inset-0 z-[10000] flex-col ${windowVisible ? "flex" : "hidden"} bg-white dark:bg-[#0a0a0a]`
          : `fixed flex-col overflow-hidden
             rounded-2xl
             bg-white/75 dark:bg-black/40
             backdrop-blur-2xl saturate-[1.8]
             border border-white/40 dark:border-white/[0.1]
             shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06),0_16px_56px_rgba(0,0,0,0.06),inset_0_0.5px_0_rgba(255,255,255,0.7),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-0.5px_0_rgba(0,0,0,0.02)]
             dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.2),0_16px_56px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]`
        }
        onMouseDown={onBringToFront}
        onTouchStart={(e) => {
          // Only bring to front when window is visible — never when minimized
          // (prevents interference with capsule touch events)
          if (!board.minimized) onBringToFront();
        }}
      >
        {isMobile ? (
          /* ── Mobile: full screen overlay ── */
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
          /* ── Desktop: floating draggable window with liquid glass ── */
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
              <span className="text-[8px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-foreground/50 dark:text-white/40 rounded px-1.5 h-4 flex items-center shrink-0">
                Task Board
              </span>
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

            {/* Resize Handle (desktop only) */}
            <div
              onMouseDown={(e) => startResize(e, board.size.width, board.size.height)}
              className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20"
              style={{
                background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.08) 55%, transparent 55%, transparent 65%, rgba(0,0,0,0.08) 65%, rgba(0,0,0,0.08) 70%, transparent 70%)',
              }}
            />
          </>
        )}
      </div>

      {/* ── Capsule shown ONLY when minimized (no animation, instant swap) ── */}
      {board.minimized && (
        <MinimizedCapsule
          board={board}
          boardIndex={boardIndex}
          totalCapsules={totalCapsules}
          onClose={onClose}
          onRestore={onRestoreBoard}
          onPositionChange={onPositionChange}
        />
      )}
    </>
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

      {boards.map((board, idx) => {
        const minIdx = boards.slice(0, idx + 1).filter(b => b.minimized).length - 1;
        return (
          <FloatingBoardWindow
            key={board.projectId}
            board={board}
            boardIndex={board.minimized ? Math.max(0, minIdx) : 0}
            totalCapsules={boards.filter(b => b.minimized).length}
            onClose={() => closeBoard(board.projectId)}
            onMinimize={() => minimizeBoard(board.projectId)}
            onBringToFront={() => bringToFront(board.projectId)}
            onRestoreBoard={() => restoreBoard(board.projectId)}
            onPositionChange={(pos) => updatePosition(board.projectId, pos)}
            onSizeChange={(size) => updateSize(board.projectId, size)}
          />
        );
      })}
    </>
  );
}

// Re-export for backward compatibility
export { useFloatingBoards } from "./providers/floating-board-provider";
export type { FloatingBoard } from "./providers/floating-board-provider";