"use client";

import { useCallback, useEffect, useState } from "react";

export type FavoritePage = { title: string; href: string };

export const FAVORITES_UPDATED_EVENT = "trishul:favorites-updated";

export function notifyFavoritesUpdated(favorites?: string[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: { favorites } })
  );
}

/** Shared favorites loader for Home + sidebar. Max 2 role-allowed pages. */
export function useFavoritePages(enabled = true) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [allowedPages, setAllowedPages] = useState<FavoritePage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/user-favorites", { credentials: "include" });
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const json = await res.json();
      setFavorites(Array.isArray(json.favorites) ? json.favorites.slice(0, 2) : []);
      setAllowedPages(Array.isArray(json.allowedPages) ? json.allowedPages : []);
    } catch {
      /* non-blocking */
    } finally {
      setLoaded(true);
    }
  }, []);

  const save = useCallback(async (next: string[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user-favorites", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: next.slice(0, 2) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        return { ok: false as const, error: d?.error || "Could not save favorites" };
      }
      const json = await res.json();
      const saved = Array.isArray(json.favorites) ? json.favorites.slice(0, 2) : next.slice(0, 2);
      setFavorites(saved);
      notifyFavoritesUpdated(saved);
      return { ok: true as const, favorites: saved };
    } catch {
      return { ok: false as const, error: "Could not save favorites" };
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onUpdate = () => {
      void reload();
    };
    window.addEventListener(FAVORITES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(FAVORITES_UPDATED_EVENT, onUpdate);
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
