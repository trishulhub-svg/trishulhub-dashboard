"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Minus, Maximize2, FolderKanban, Copy } from "lucide-react";
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
      const openCount = prev.filter(b => !b.minimized).length;
      const offset = openCount * 28;
      return [...prev, {
        projectId,
        projectName,
        position: {
          x: Math.min(100 + offset, window.innerWidth - 600),
          y: Math.min(60 + offset, window.innerHeight - 450),
        },
        size: {
          width: Math.max(520, Math.min(840, window.innerWidth - 120)),
          height: Math.max(380, Math.min(580, window.innerHeight - 100)),
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

  const closeAll = useCallback(() => { setBoards([]); }, []);

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

  return { boards, openBoard, closeBoard, closeAll, minimizeBoard, restoreBoard, bringToFront, updatePosition, updateSize };
}

// ─── Drag & Resize helpers using refs to avoid stale closures ───
function useDragResize(
  elRef: React.RefObject<HTMLDivElement | null>,
  onPositionChange: (pos: { x: number; y: number }) => void,
  onSizeChange: (size: { width: number; height: number }) => void,
) {
  const dragState = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeState = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  const startDrag = useCallback((e: React.MouseEvent, origX: number, origY: number) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragState.current = { sx: e.clientX, sy: e.clientY, ox: origX, oy: origY };
  }, []);

  const startResize = useCallback((e: React.MouseEvent, origW: number, origH: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { sx: e.clientX, sy: e.clientY, ow: origW, oh: origH };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragState.current && elRef.current) {
        const { sx, sy, ox, oy } = dragState.current;
        const nx = Math.max(0, Math.min(window.innerWidth - 120, ox + (e.clientX - sx)));
        const ny = Math.max(0, Math.min(window.innerHeight - 50, oy + (e.clientY - sy)));
        elRef.current.style.left = nx + "px";
        elRef.current.style.top = ny + "px";
      }
      if (resizeState.current && elRef.current) {
        const { sx, sy, ow, oh } = resizeState.current;
        const nw = Math.max(420, ow + (e.clientX - sx));
        const nh = Math.min(260, Math.max(260, oh + (e.clientY - sy)));
        elRef.current.style.width = nw + "px";
        elRef.current.style.height = nh + "px";
      }
    };
    const onUp = () => {
      if (dragState.current && elRef.current) {
        const { sx, sy, ox, oy } = dragState.current;
        // Read final position from DOM
        const fx = parseInt(elRef.current.style.left) || ox;
        const fy = parseInt(elRef.current.style.top) || oy;
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
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [elRef, onPositionChange, onSizeChange]);

  return { startDrag, startResize };
}

// ─── Minimized capsule (docked at bottom) ───
function MinimizedCapsule({
  board,
  onClose,
  onRestore,
}: {
  board: FloatingBoard;
  onClose: () => void;
  onRestore: () => void;
}) {
  return (
    <div
      className="fixed bottom-3 flex z-[9999] animate-in slide-in-from-bottom-3 fade-in duration-200"
      style={{ left: board.position.x, zIndex: board.zIndex }}
    >
      <div
        className="group/cap flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-full
          bg-white/80 dark:bg-white/[0.08]
          backdrop-blur-2xl saturate-[1.8]
          border border-white/30 dark:border-white/[0.12]
          shadow-[0_2px_20px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.03),inset_0_0.5px_0_rgba(255,255,255,0.6)]
          dark:shadow-[0_2px_20px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.05),inset_0_0.5px_0_rgba(255,255,255,0.08)]
          cursor-pointer hover:shadow-[0_4px_28px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04),inset_0_0.5px_0_rgba(255,255,255,0.7)]
          dark:hover:shadow-[0_4px_28px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.1)]
          transition-all duration-200 ease-out
          hover:scale-[1.02] active:scale-[0.98]"
        onClick={onRestore}
        onDoubleClick={onRestore}
        title="Click to restore"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-sm">
            <FolderKanban className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-foreground/90 dark:text-white/80 max-w-[140px] truncate select-none">
            {board.projectName}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="h-5 w-5 rounded-full flex items-center justify-center
            text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10
            opacity-0 group-hover/cap:opacity-100
            transition-all duration-150"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main floating window ───
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
  const { startDrag, startResize } = useDragResize(elRef, onPositionChange, onSizeChange);
  const [iframeReady, setIframeReady] = useState(false);

  if (board.minimized) {
    return <MinimizedCapsule board={board} onClose={onClose} onRestore={onBringToFront} />;
  }

  return (
    <div
      ref={elRef}
      className="fixed flex flex-col overflow-hidden animate-in fade-in zoom-in-[0.97] duration-200 ease-out
        rounded-2xl
        bg-white/75 dark:bg-black/40
        backdrop-blur-2xl saturate-[1.8]
        border border-white/40 dark:border-white/[0.1]
        shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06),0_16px_56px_rgba(0,0,0,0.06),inset_0_0.5px_0_rgba(255,255,255,0.7),inset_0_1px_0_rgba(255,255,255,0.5)]
        dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.2),0_16px_56px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{
        left: board.position.x,
        top: board.position.y,
        width: board.size.width,
        height: board.size.height,
        zIndex: board.zIndex,
      }}
      onMouseDown={onBringToFront}
    >
      {/* ── Title Bar ── */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0 select-none cursor-move
          bg-white/50 dark:bg-white/[0.04]
          border-b border-black/[0.04] dark:border-white/[0.06]"
        onMouseDown={(e) => startDrag(e, board.position.x, board.position.y)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onClose} className="w-[11px] h-[11px] rounded-full bg-[#ff5f57] hover:brightness-90 transition-all hover:shadow-[0_0_4px_rgba(255,95,87,0.4)]" title="Close" />
            <button onClick={onMinimize} className="w-[11px] h-[11px] rounded-full bg-[#febc2e] hover:brightness-90 transition-all hover:shadow-[0_0_4px_rgba(254,188,46,0.4)]" title="Minimize" />
            <div className="w-[11px] h-[11px] rounded-full bg-[#28c840]/40" />
          </div>
          <span className="text-[11px] font-semibold text-foreground/80 dark:text-white/70 truncate select-none">
            {board.projectName}
          </span>
          <Badge
            variant="secondary"
            className="text-[8px] h-4 px-1.5 font-medium bg-black/[0.04] dark:bg-white/[0.06] text-foreground/50 dark:text-white/40 border-0 shrink-0"
          >
            Task Board
          </Badge>
        </div>
      </div>

      {/* ── Content ── */}
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
          src={`/dashboard/projects/${board.projectId}`}
          className="absolute inset-0 w-full h-full border-0"
          title={`${board.projectName} — Task Board`}
          onLoad={() => setIframeReady(true)}
        />
      </div>

      {/* ── Resize Handle ── */}
      <div
        onMouseDown={(e) => startResize(e, board.size.width, board.size.height)}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.08) 55%, transparent 55%, transparent 65%, rgba(0,0,0,0.08) 65%, rgba(0,0,0,0.08) 70%, transparent 70%)',
        }}
      />
    </div>
  );
}

export { FloatingBoardWindow };