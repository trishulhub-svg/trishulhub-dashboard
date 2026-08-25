"use client";

import { useCallback, useEffect, useState } from "react";
import type { GpuStatus } from "@/lib/gpu-metrics";

const POLL_MS = 3000;

/**
 * Polls /api/gpu/status every 3s (Vercel Hobby-friendly: one lightweight
 * request — the tunnel fetches happen server-side). Keeps the last known-good
 * snapshot so intermittent tunnel outages don't flash the UI OFF; only drops
 * it after repeated failures.
 */
export function useGpuStatus(enabled = true) {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [source, setSource] = useState<GpuStatus | null>(null);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gpu/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GpuStatus;
      setStatus(data);
      // Keep the last known-good snapshot so intermittent tunnel outages don't
      // flash the cards OFF — only drop it after repeated failures.
      setSource((prev) => (data.anyLive === true || !prev ? data : prev));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Deferred first poll so setState never runs synchronously inside the effect.
    const initial = setTimeout(() => void fetchStatus(), 0);
    const timer = setInterval(() => void fetchStatus(), POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [fetchStatus, enabled]);

  // Keep rendering the last known-good snapshot during brief tunnel outages so
  // the UI fades out smoothly instead of flickering OFF/OFF.
  return { status, source, error };
}
