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
import { useTheme } from "next-themes";

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
  capsulePosition: { x: number; y: number };
  openBoard: (projectId: string, projectName: string) => void;
  closeBoard: (projectId: string) => void;
  closeAll: () => void;
  minimizeBoard: (projectId: string) => void;
  restoreBoard: (projectId: string) => void;
  bringToFront: (projectId: string) => void;
  updatePosition: (projectId: string, position: { x: number; y: number }) => void;
  updateSize: (projectId: string, size: { width: number; height: number }) => void;
  updateCapsulePosition: (pos: { x: number; y: number }) => void;
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
const CAPSULE_POS_KEY = "trishulhub_capsule_position";

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

function loadCapsulePosition(): { x: number; y: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CAPSULE_POS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(boards: FloatingBoard[]) {
  if (typeof window === "undefined") return;
  try {
    const toSave = boards.map(b => ({
      ...b,
      minimized: true,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function saveCapsulePosition(pos: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CAPSULE_POS_KEY, JSON.stringify(pos));
  } catch { /* */ }
}

function clearStorage() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

// ─── Server sync helpers ────────────────────────────────────────────
const SYNC_DEBOUNCE_MS = 2000;

function getDefaultCapsulePosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 16, y: 0 };
  const bottomOffset = window.innerWidth < 768 ? 24 : 16;
  return {
    x: 16,
    y: Math.max(60, window.innerHeight - bottomOffset - 48),
  };
}

// ─── Provider ────────────────────────────────────────────────────────
export function FloatingBoardProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const { setTheme: setNextTheme, resolvedTheme } = useTheme();
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  const [boards, setBoards] = useState<FloatingBoard[]>(() => {
    if (typeof window === "undefined") return [];
    return loadFromStorage();
  });

  const [capsulePosition, setCapsulePosition] = useState<{ x: number; y: number }>(() => {
    const stored = loadCapsulePosition();
    return stored || getDefaultCapsulePosition();
  });

  const [nextZ, setNextZ] = useState(100);
  const mountedRef = useRef(false);
  const serverSyncedRef = useRef(false);
  const lastActionTimeRef = useRef<Record<string, number>>({});
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On first mount, ensure all restored boards are minimized
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setBoards(prev => prev.map(b => ({ ...b, minimized: true })));
  }, []);

  // ─── Server sync: fetch preferences on auth ─────────────────────
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId || serverSyncedRef.current) return;
    serverSyncedRef.current = true;

    let cancelled = false;
    fetch("/api/user-preferences", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data?.success || !data.preferences) return;
        const prefs = data.preferences as Record<string, unknown>;

        // Sync theme from server
        if (prefs.theme && typeof prefs.theme === "string") {
          const serverTheme = prefs.theme as string;
          const localTheme = localStorage.getItem("theme") || "system";
          if (serverTheme !== localTheme) {
            setNextTheme(serverTheme);
          }
        }

        // Sync boards from server (capsule list)
        if (prefs.boards && Array.isArray(prefs.boards)) {
          const serverBoards = prefs.boards.filter(
            (b: FloatingBoard) => b.projectId && b.projectName && typeof b.minimized === "boolean"
          );
          if (serverBoards.length > 0) {
            setBoards(serverBoards.map((b: FloatingBoard) => ({ ...b, minimized: true })));
            saveToStorage(serverBoards);
          }
        }

        // Sync capsule position from server
        if (prefs.capsulePosition && typeof prefs.capsulePosition === "object") {
          const pos = prefs.capsulePosition as { x: number; y: number };
          if (typeof pos.x === "number" && typeof pos.y === "number") {
            setCapsulePosition(pos);
            saveCapsulePosition(pos);
          }
        }
      })
      .catch(() => { /* silent — local state is fine */ });

    return () => { cancelled = true; };
  }, [sessionStatus, userId, setNextTheme]);

  // ─── Server sync: push preferences on change (debounced) ───────
  const pushToServer = useCallback((boardsToSync: FloatingBoard[], capsPos: { x: number; y: number }, theme: string) => {
    if (!userId) return;

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      const payload = {
        preferences: {
          boards: boardsToSync.map(b => ({ ...b, minimized: true })),
          capsulePosition: capsPos,
          theme,
        },
      };
      fetch("/api/user-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }).catch(() => { /* silent */ });
    }, SYNC_DEBOUNCE_MS);
  }, [userId]);

  // Persist to localStorage + push to server whenever boards change
  useEffect(() => {
    if (!mountedRef.current) return;
    if (sessionStatus === "authenticated") {
      saveToStorage(boards);
      const theme = localStorage.getItem("theme") || "system";
      pushToServer(boards, capsulePosition, theme);
    }
  }, [boards, sessionStatus, capsulePosition, pushToServer]);

  // Sync theme changes to server
  useEffect(() => {
    if (!mountedRef.current || sessionStatus !== "authenticated" || !userId) return;
    if (resolvedTheme) {
      const theme = localStorage.getItem("theme") || "system";
      pushToServer(boards, capsulePosition, theme);
    }
  }, [resolvedTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBoard = useCallback((projectId: string, projectName: string) => {
    setBoards(prev => {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

      let updated = isMobile
        ? prev.map(b => ({ ...b, minimized: true }))
        : prev;

      const existing = updated.find(b => b.projectId === projectId);
      if (existing) {
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
          : (() => {
              const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
              const vh = typeof window !== "undefined" ? window.innerHeight : 800;
              const w = Math.max(520, Math.min(840, vw - 120));
              const h = Math.max(380, Math.min(580, vh - 100));
              const x = Math.min(100 + updated.length * 28, vw - w - 20);
              const y = vh < 700
                ? Math.max(10, vh - h - 10)
                : Math.min(60 + updated.length * 28, vh - h - 10);
              return { x, y };
            })(),
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
    const now = Date.now();
    const lastTime = lastActionTimeRef.current[`restore:${projectId}`] || 0;
    if (now - lastTime < 200) return;
    lastActionTimeRef.current[`restore:${projectId}`] = now;

    setBoards(prev => {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

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

  const updateCapsulePosition = useCallback((pos: { x: number; y: number }) => {
    setCapsulePosition(pos);
    saveCapsulePosition(pos);
  }, []);

  const signalLogout = useCallback(() => {
    setBoards(prev => {
      const minimized = prev.map(b => ({ ...b, minimized: true }));
      saveToStorage(minimized);
      if (userId) {
        const theme = localStorage.getItem("theme") || "system";
        fetch("/api/user-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            preferences: {
              boards: minimized,
              capsulePosition: capsulePosition,
              theme,
            },
          }),
        }).catch(() => { /* silent */ });
      }
      return minimized;
    });
  }, [userId, capsulePosition]);

  return (
    <FloatingBoardContext.Provider
      value={{
        boards,
        capsulePosition,
        openBoard,
        closeBoard,
        closeAll,
        minimizeBoard,
        restoreBoard,
        bringToFront,
        updatePosition,
        updateSize,
        updateCapsulePosition,
        signalLogout,
        isAdmin,
      }}
    >
      {children}
    </FloatingBoardContext.Provider>
  );
}