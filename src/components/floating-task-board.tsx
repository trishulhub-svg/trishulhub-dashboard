"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Minus, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface FloatingBoard {
  projectId: string;
  projectName: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  zIndex: number;
}

export function useFloatingBoards() {
  const [boards, setBoards] = useState<FloatingBoard[]>([]);
  const [nextZ, setNextZ] = useState(100);

  const openBoard = useCallback((projectId: string, projectName: string) => {
    setBoards(prev => {
      const existing = prev.find(b => b.projectId === projectId);
      if (existing) {
        return prev.map(b =>
          b.projectId === projectId
            ? { ...b, minimized: false, zIndex: nextZ }
            : b
        );
      }
      const offset = prev.filter(b => !b.minimized).length * 30;
      return [...prev, {
        projectId,
        projectName,
        position: { x: 60 + offset, y: 50 + offset },
        size: {
          width: Math.max(500, Math.min(820, window.innerWidth - 160)),
          height: Math.max(350, Math.min(560, window.innerHeight - 140)),
        },
        minimized: false,
        zIndex: nextZ,
      }];
    });
    setNextZ(z => z + 1);
  }, [nextZ]);

  const closeBoard = useCallback((projectId: string) => {
    setBoards(prev => prev.filter(b => b.projectId !== projectId));
  }, []);

  const closeAll = useCallback(() => {
    setBoards([]);
  }, []);

  const minimizeBoard = useCallback((projectId: string) => {
    setBoards(prev => prev.map(b => b.projectId === projectId ? { ...b, minimized: true } : b));
  }, []);

  const restoreBoard = useCallback((projectId: string) => {
    setBoards(prev => prev.map(b => b.projectId === projectId ? { ...b, minimized: false, zIndex: nextZ } : b));
    setNextZ(z => z + 1);
  }, [nextZ]);

  const bringToFront = useCallback((projectId: string) => {
    setBoards(prev => prev.map(b => b.projectId === projectId ? { ...b, zIndex: nextZ } : b));
    setNextZ(z => z + 1);
  }, [nextZ]);

  const updatePosition = useCallback((projectId: string, position: { x: number; y: number }) => {
    setBoards(prev => prev.map(b => b.projectId === projectId ? { ...b, position } : b));
  }, []);

  const updateSize = useCallback((projectId: string, size: { width: number; height: number }) => {
    setBoards(prev => prev.map(b => b.projectId === projectId ? { ...b, size } : b));
  }, []);

  return {
    boards,
    openBoard,
    closeBoard,
    closeAll,
    minimizeBoard,
    restoreBoard,
    bringToFront,
    updatePosition,
    updateSize,
  };
}

function FloatingBoardWindow({
  board,
  onClose,
  onMinimize,
  onBringToFront,
  onPositionChange,
  onSizeChange,
}: {
  board: FloatingBoard;
  onClose: () => void;
  onMinimize: () => void;
  onBringToFront: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  // Use refs for drag/resize to avoid stale closure issues in event listeners
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Drag handling
  useEffect(() => {
    if (!dragRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;

    const onMove = (e: MouseEvent) => {
      const nx = Math.max(0, Math.min(window.innerWidth - 100, origX + (e.clientX - startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 40, origY + (e.clientY - startY)));
      if (elRef.current) {
        elRef.current.style.left = nx + "px";
        elRef.current.style.top = ny + "px";
      }
    };

    const onUp = (e: MouseEvent) => {
      const nx = Math.max(0, Math.min(window.innerWidth - 100, origX + (e.clientX - startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 40, origY + (e.clientY - startY)));
      onPositionChange({ x: nx, y: ny });
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragRef.current]);

  // Resize handling
  useEffect(() => {
    if (!resizeRef.current) return;
    const { startX, startY, origW, origH } = resizeRef.current;

    const onMove = (e: MouseEvent) => {
      const nw = Math.max(400, origW + (e.clientX - startX));
      const nh = Math.max(250, origH + (e.clientY - startY));
      if (elRef.current) {
        elRef.current.style.width = nw + "px";
        elRef.current.style.height = nh + "px";
      }
    };

    const onUp = (e: MouseEvent) => {
      const nw = Math.max(400, origW + (e.clientX - startX));
      const nh = Math.max(250, origH + (e.clientY - startY));
      onSizeChange({ width: nw, height: nh });
      resizeRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeRef.current]);

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: board.position.x, origY: board.position.y };
    onBringToFront();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: board.size.width, origH: board.size.height };
    onBringToFront();
  };

  // Minimized state — small pill at bottom of screen
  if (board.minimized) {
    return (
      <div
        className="fixed bottom-3 z-[9999] animate-in slide-in-from-bottom-2"
        style={{ left: board.position.x, zIndex: board.zIndex }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg cursor-pointer hover:shadow-xl transition-all group/min"
          onClick={onBringToFront}
        >
          <FolderKanban className="h-3 w-3 text-blue-500 shrink-0" />
          <span className="text-xs font-medium text-foreground max-w-[160px] truncate">{board.projectName}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="h-4 w-4 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover/min:opacity-100"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      className="fixed bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl rounded-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
      style={{
        left: board.position.x,
        top: board.position.y,
        width: board.size.width,
        height: board.size.height,
        zIndex: board.zIndex,
      }}
      onMouseDown={onBringToFront}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-gray-50/80 dark:bg-gray-900/80 border-b border-white/20 dark:border-white/10 cursor-move select-none shrink-0"
        onMouseDown={handleTitleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderKanban className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-semibold truncate">{board.projectName}</span>
          <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">Task Board</Badge>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onMinimize}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-gray-200/80 dark:hover:bg-gray-700/80 text-muted-foreground hover:text-foreground transition-colors"
            title="Minimize"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
            title="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* iframe — loads the actual project task board */}
      <div className="flex-1 relative bg-white dark:bg-gray-950">
        <iframe
          src={`/dashboard/projects/${board.projectId}`}
          className="absolute inset-0 w-full h-full border-0"
          title={`${board.projectName} — Task Board`}
          loading="lazy"
        />
      </div>

      {/* Resize handle (bottom-right corner) */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10 flex items-end justify-end p-0.5"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-gray-400 dark:text-gray-600">
          <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export { FloatingBoardWindow };