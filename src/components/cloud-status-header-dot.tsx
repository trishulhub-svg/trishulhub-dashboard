"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type CloudStatus = {
  anyLive: boolean;
  nodeCount: number;
  enabledCount: number;
  lastChecked: number;
};

/** Lightweight poll — header is on every page, so keep it gentle (12s, pauses
 *  when the tab is hidden) to stay comfortably inside the Vercel Hobby plan. */
const POLL_MS = 12_000;

/**
 * Global header indicator for the Trishul Cloud Process (GPU/monitor URLs).
 * - Green blinking dot + "Cloud Active" when at least one configured URL is
 *   emitting live data.
 * - Amber/red + "Cloud Stopped" / "Cloud Off" when nothing is running.
 * Visible from every dashboard page, right next to the clock-in indicator.
 */
export function CloudStatusHeaderDot() {
  const router = useRouter();
  const [state, setState] = useState<CloudStatus | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gpu/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        anyLive?: boolean;
        results?: Array<{ ok?: boolean }>;
        enabled?: unknown[];
      };
      const results = Array.isArray(data?.results) ? data.results : [];
      const live = results.filter((r) => r.ok === true).length;
      if (!mountedRef.current) return;
      setState({
        anyLive: data?.anyLive === true || live > 0,
        nodeCount: live,
        enabledCount: Array.isArray(data?.enabled) ? data.enabled.length : 0,
        lastChecked: Date.now(),
      });
      setError(false);
      setLoaded(true);
    } catch {
      if (!mountedRef.current) return;
      setError(true);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Deferred first poll so setState never runs synchronously inside the effect.
    const initial = setTimeout(() => void fetchStatus(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchStatus();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchStatus]);

  if (!loaded) return null;

  const live = state?.anyLive === true;
  const hasSources = (state?.enabledCount ?? 0) > 0;

  let label = "Cloud Off";
  if (error) label = "Cloud Error";
  else if (live) label = "Cloud Active";
  else if (hasSources) label = "Cloud Stopped";

  const dotClass = live
    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]"
    : error
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]"
      : hasSources
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
        : "bg-zinc-400 dark:bg-zinc-500";

  const textClass = live
    ? "text-emerald-700 dark:text-emerald-300"
    : error
      ? "text-red-700 dark:text-red-300"
      : hasSources
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";

  const title = live
    ? `Trishul Cloud active — ${state?.nodeCount} node${state?.nodeCount === 1 ? "" : "s"} streaming · updated ${new Date(
        state?.lastChecked || Date.now()
      ).toLocaleTimeString()}`
    : hasSources
      ? "Trishul Cloud configured but not emitting data right now"
      : "Trishul Cloud — no monitor URLs configured (System → GPU)";

  return (
    <button
      type="button"
      onClick={() => router.push("/dashboard/workspace")}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 rounded-full",
        "h-9 px-2.5 sm:px-3 shrink-0",
        "border bg-background/60 backdrop-blur",
        live
          ? "border-emerald-500/30 hover:bg-emerald-500/10"
          : error
            ? "border-red-500/30 hover:bg-red-500/10"
            : hasSources
              ? "border-amber-500/30 hover:bg-amber-500/10"
              : "border-border hover:bg-muted/50",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      aria-label={title}
      title={title}
    >
      <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span className={cn("relative inline-flex h-3 w-3 rounded-full", dotClass)} />
      </span>
      <span className={cn("hidden sm:inline text-[11px] font-semibold tracking-wide", textClass)}>
        {label}
      </span>
    </button>
  );
}
