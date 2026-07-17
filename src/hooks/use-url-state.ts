"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type UrlStateValue = string;

/**
 * Persist UI state in the URL so refresh / share keeps the user on the same view.
 * Falls back to localStorage for the first paint when the param is missing.
 */
export function useUrlState(
  key: string,
  defaultValue: UrlStateValue,
  options?: { storageKey?: string; replace?: boolean }
): [UrlStateValue, (next: UrlStateValue) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storageKey = options?.storageKey ?? `ui:${pathname}:${key}`;
  const replace = options?.replace !== false;
  const hydrated = useRef(false);

  const urlValue = searchParams.get(key);

  const initial = useMemo(() => {
    if (urlValue != null && urlValue !== "") return urlValue;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored != null && stored !== "") return stored;
      } catch {
        /* ignore */
      }
    }
    return defaultValue;
  }, [urlValue, storageKey, defaultValue]);

  const [value, setValue] = useState<UrlStateValue>(initial);

  // Sync from URL when navigating back/forward
  useEffect(() => {
    if (urlValue != null && urlValue !== "" && urlValue !== value) {
      setValue(urlValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to URL changes
  }, [urlValue]);

  // On first mount, if URL lacks the key but we have a stored value, write it into the URL
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (urlValue == null || urlValue === "") {
      if (value !== defaultValue) {
        const params = new URLSearchParams(searchParams.toString());
        params.set(key, value);
        const qs = params.toString();
        const href = qs ? `${pathname}?${qs}` : pathname;
        router.replace(href, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback(
    (next: UrlStateValue) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultValue || next === "") {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [defaultValue, key, pathname, replace, router, searchParams, storageKey]
  );

  return [value, set];
}

/** Multi-key URL state for filter bars (status, tab, view, etc.) */
export function useUrlStates<T extends Record<string, string>>(
  defaults: T
): [T, (patch: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storagePrefix = `ui:${pathname}`;

  const read = useCallback((): T => {
    const next = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const fromUrl = searchParams.get(String(key));
      if (fromUrl != null && fromUrl !== "") {
        next[key] = fromUrl as T[keyof T];
        continue;
      }
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem(`${storagePrefix}:${String(key)}`);
          if (stored != null && stored !== "") {
            next[key] = stored as T[keyof T];
          }
        } catch {
          /* ignore */
        }
      }
    }
    return next;
  }, [defaults, searchParams, storagePrefix]);

  const [state, setState] = useState<T>(() => read());

  useEffect(() => {
    setState(read());
  }, [read]);

  // Ensure URL reflects restored storage values once
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      if (searchParams.get(String(key)) == null && state[key] !== defaults[key]) {
        params.set(String(key), state[key]);
        changed = true;
      }
    }
    if (changed) {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback(
    (partial: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...partial };
        const params = new URLSearchParams(searchParams.toString());
        for (const key of Object.keys(partial) as (keyof T)[]) {
          const val = next[key];
          try {
            localStorage.setItem(`${storagePrefix}:${String(key)}`, String(val));
          } catch {
            /* ignore */
          }
          if (val === defaults[key] || val === "") params.delete(String(key));
          else params.set(String(key), String(val));
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        return next;
      });
    },
    [defaults, pathname, router, searchParams, storagePrefix]
  );

  return [state, patch];
}
