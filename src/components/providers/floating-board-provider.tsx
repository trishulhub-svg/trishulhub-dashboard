"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

// ─── Types ───────────────────────────────────────────────────────────
export interface FloatingBoard {
  projectId: string;
  projectName: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  zIndex: number;
}

interface FloatingBoardContextValue {
  boards: FloatingBoard[];
  openBoard: (projectId: string, projectName: string) => void;
  closeBoard: (projectId: string) => void;
  closeAll: () => void;
  minimizeBoard: (projectId: string) => void;
  restoreBoard: (projectId: string) => void;
  bringToFront: (projectId: string) => void;
  updatePosition: (projectId: string, position: { x: number; y: number }) => void;
  updateSize: (projectId: string, size: { width: number; height: number }) => void;
  /** Signal that user is logging out — auto-minimizes all boards and persists */
  signalLogout: () => void;
  isAdmin: boolean;
}

const FloatingBoardContext = createContext<FloatingBoardContextValue | null>(null);

export function useFloatingBoards() {
  const ctx = useContext(FloatingBoardContext);
  if (!ctx) throw new Error("useFloatingBoards must be used within FloatingBoardProvider");
  return ctx;
}

// ─── localStorage helpers ────────────────────────────────────────────
const STORAGE_KEY = "trishulhub_floating_boards";

function loadFromStorage(): FloatingBoard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b: FloatingBoard) =>
        b.projectId && b.projectName && typeof b.minimized === "boolean"
    );
  } catch {
    return [];
  }
}

function saveToStorage(boards: FloatingBoard[]) {
  if (typeof window === "undefined") return;
  try {
    // Only save minimized boards (capsules) — open boards don't persist across page loads
    const toSave = boards.map(b => ({
      ...b,
      minimized: true, // Always save as minimized
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function clearStorage() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

// ─── Provider ────────────────────────────────────────────────────────
export function FloatingBoardProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  // Initialize from localStorage on mount — boards always restored as minimized (capsules)
  const [boards, setBoards] = useState<FloatingBoard[]>(() => {
    if (typeof window === "undefined") return [];
    return loadFromStorage();
  });
  const [nextZ, setNextZ] = useState(100);
  const mountedRef = useRef(false);
  // Prevent rapid duplicate state updates (e.g. double-tap)
  const lastActionTimeRef = useRef<Record<string, number>>({});

  // On first mount, ensure all restored boards are minimized
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setBoards(prev => prev.map(b => ({ ...b, minimized: true })));
  }, []);

  // Persist to localStorage whenever boards change (after initial mount)
  useEffect(() => {
    if (!mountedRef.current) return;
    // Only persist when user is authenticated
    if (sessionStatus === "authenticated") {
      saveToStorage(boards);
    }
  }, [boards, sessionStatus]);

  // Clear stored boards when user explicitly closes all (NOT on logout — capsules persist)
  // The signalLogout function handles minimizing before logout.

  const openBoard = useCallback((projectId: string, projectName: string) => {
    setBoards(prev => {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

      // On mobile: only ONE board can be open at a time — auto-minimize others
      let updated = isMobile
        ? prev.map(b => ({ ...b, minimized: true }))
        : prev;

      const existing = updated.find(b => b.projectId === projectId);
      if (existing) {
        // Restore if minimized, bring to front
        return updated.map(b =>
          b.projectId === projectId
            ? { ...b, minimized: false, zIndex: Date.now() }
            : b
        );
      }
      const newBoard: FloatingBoard = {
        projectId,
        projectName,
        position: isMobile
          ? { x: 0, y: 0 }
          : {
              x: Math.min(100 + updated.length * 28, (typeof window !== "undefined" ? window.innerWidth : 1200) - 600),
              y: Math.min(60 + updated.length * 28, (typeof window !== "undefined" ? window.innerHeight : 800) - 450),
            },
        size: isMobile
          ? { width: typeof window !== "undefined" ? window.innerWidth : 375, height: typeof window !== "undefined" ? window.innerHeight : 667 }
          : {
              width: Math.max(520, Math.min(840, (typeof window !== "undefined" ? window.innerWidth : 1200) - 120)),
              height: Math.max(380, Math.min(580, (typeof window !== "undefined" ? window.innerHeight : 800) - 100)),
            },
        minimized: false,
        zIndex: Date.now(),
      };
      return [...updated, newBoard];
    });
  }, []);

  const closeBoard = useCallback((projectId: string) => {
    setBoards(prev => prev.filter(b => b.projectId !== projectId));
  }, []);

  const closeAll = useCallback(() => {
    setBoards([]);
    clearStorage();
  }, []);

  const minimizeBoard = useCallback((projectId: string) => {
    setBoards(prev =>
      prev.map(b => b.projectId === projectId ? { ...b, minimized: true } : b)
    );
  }, []);

  const restoreBoard = useCallback((projectId: string) => {
    // Debounce: ignore if same action happened within 200ms
    const now = Date.now();
    const lastTime = lastActionTimeRef.current[`restore:${projectId}`] || 0;
    if (now - lastTime < 200) return;
    lastActionTimeRef.current[`restore:${projectId}`] = now;

    setBoards(prev => {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

      // On mobile: only ONE board open at a time — minimize all others first
      if (isMobile) {
        return prev.map(b =>
          b.projectId === projectId
            ? { ...b, minimized: false, zIndex: Date.now() }
            : { ...b, minimized: true }
        );
      }

      return prev.map(b =>
        b.projectId === projectId
          ? { ...b, minimized: false, zIndex: Date.now() }
          : b
      );
    });
  }, []);

  const bringToFront = useCallback((projectId: string) => {
    setBoards(prev =>
      prev.map(b =>
        b.projectId === projectId ? { ...b, zIndex: Date.now() } : b
      )
    );
  }, []);

  const updatePosition = useCallback((projectId: string, position: { x: number; y: number }) => {
    setBoards(prev =>
      prev.map(b => (b.projectId === projectId ? { ...b, position } : b))
    );
  }, []);

  const updateSize = useCallback((projectId: string, size: { width: number; height: number }) => {
    setBoards(prev =>
      prev.map(b => (b.projectId === projectId ? { ...b, size } : b))
    );
  }, []);

  // Auto-minimize all boards and persist (called before logout)
  const signalLogout = useCallback(() => {
    setBoards(prev => {
      const minimized = prev.map(b => ({ ...b, minimized: true }));
      saveToStorage(minimized);
      return minimized;
    });
  }, []);

  return (
    <FloatingBoardContext.Provider
      value={{
        boards,
        openBoard,
        closeBoard,
        closeAll,
        minimizeBoard,
        restoreBoard,
        bringToFront,
        updatePosition,
        updateSize,
        signalLogout,
        isAdmin,
      }}
    >
      {children}
    </FloatingBoardContext.Provider>
  );
}