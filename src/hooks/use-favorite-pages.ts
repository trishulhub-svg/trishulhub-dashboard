"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export type FavoritePage = { title: string; href: string };

export const FAVORITES_UPDATED_EVENT = "trishul:favorites-updated";

const cacheKey = (userId: string) => `trishul:favorites:${userId}`;

function readCache(userId: string): { favorites: string[]; allowedPages: FavoritePage[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const favorites = (parsed as { favorites?: unknown }).favorites;
    const allowedPages = (parsed as { allowedPages?: unknown }).allowedPages;
    if (!Array.isArray(favorites)) return null;
    return {
      favorites: favorites.filter((x): x is string => typeof x === "string").slice(0, 2),
      allowedPages: Array.isArray(allowedPages)
        ? allowedPages.filter(
            (p): p is FavoritePage =>
              !!p &&
              typeof p === "object" &&
              typeof (p as FavoritePage).href === "string" &&
              typeof (p as FavoritePage).title === "string"
          )
        : [],
    };
  } catch {
    return null;
  }
}

function writeCache(
  userId: string,
  favorites: string[],
  allowedPages: FavoritePage[]
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      cacheKey(userId),
      JSON.stringify({ favorites: favorites.slice(0, 2), allowedPages })
    );
  } catch {
    /* quota / private mode */
  }
}

export function notifyFavoritesUpdated(favorites?: string[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: { favorites } })
  );
}

/**
 * Shared favorites loader for Home + sidebar.
 * Source of truth is the signed-in user account (server DB) — same on every device.
 * localStorage is only a per-user paint cache; server always wins on fetch.
 */
export function useFavoritePages(enabled = true) {
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ?? null;
  const [favorites, setFavorites] = useState<string[]>([]);
  const [allowedPages, setAllowedPages] = useState<FavoritePage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  const applyPayload = useCallback(
    (nextFavorites: string[], nextAllowed: FavoritePage[], forUserId: string) => {
      if (userIdRef.current !== forUserId) return;
      const favs = nextFavorites.slice(0, 2);
      setFavorites(favs);
      setAllowedPages(nextAllowed);
      writeCache(forUserId, favs, nextAllowed);
    },
    []
  );

  const reload = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch("/api/user-favorites", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (userIdRef.current !== uid) return;
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const json = await res.json();
      applyPayload(
        Array.isArray(json.favorites) ? json.favorites : [],
        Array.isArray(json.allowedPages) ? json.allowedPages : [],
        uid
      );
    } catch {
      /* timeout / network — keep last known (cache or prior server) */
    } finally {
      clearTimeout(timer);
      if (userIdRef.current === uid) setLoaded(true);
    }
  }, [applyPayload]);

  const save = useCallback(
    async (next: string[]) => {
      const uid = userIdRef.current;
      if (!uid) return { ok: false as const, error: "Not signed in" };

      setSaving(true);
      try {
        const res = await fetch("/api/user-favorites", {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: next.slice(0, 2) }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          return { ok: false as const, error: d?.error || "Could not save favorites" };
        }
        const json = await res.json();
        const saved = Array.isArray(json.favorites)
          ? json.favorites.slice(0, 2)
          : next.slice(0, 2);
        if (userIdRef.current === uid) {
          setFavorites(saved);
          writeCache(uid, saved, allowedPages);
          notifyFavoritesUpdated(saved);
        }
        return { ok: true as const, favorites: saved };
      } catch {
        return { ok: false as const, error: "Could not save favorites" };
      } finally {
        setSaving(false);
      }
    },
    [allowedPages]
  );

  // Load from account when signed in; clear when signed out / user switches
  useEffect(() => {
    if (!enabled) return;
    if (sessionStatus === "loading") return;

    if (sessionStatus !== "authenticated" || !userId) {
      setFavorites([]);
      setAllowedPages([]);
      setLoaded(true);
      return;
    }

    const cached = readCache(userId);
    if (cached) {
      setFavorites(cached.favorites);
      setAllowedPages(cached.allowedPages);
    } else {
      setFavorites([]);
      setAllowedPages([]);
    }
    setLoaded(false);
    void reload();
  }, [enabled, reload, sessionStatus, userId]);

  // Same-tab Home ↔ sidebar sync
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onUpdate = () => {
      void reload();
    };
    window.addEventListener(FAVORITES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(FAVORITES_UPDATED_EVENT, onUpdate);
  }, [enabled, reload]);

  // Re-fetch when returning to the app (other device may have changed favorites)
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (userIdRef.current) void reload();
    };
    const onFocus = () => {
      if (userIdRef.current) void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, reload]);

  const resolved = favorites.map((href) => {
    const page = allowedPages.find((p) => p.href === href);
    return page || { title: href.replace(/^\/dashboard\/?/, "") || "Dashboard", href };
  });

  return {
    favorites,
    allowedPages,
    resolved,
    loaded,
    saving,
    reload,
    save,
    setFavorites,
  };
}
