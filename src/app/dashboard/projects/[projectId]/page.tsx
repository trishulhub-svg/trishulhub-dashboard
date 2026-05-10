"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DIAGNOSTIC v6: COMPLETELY MINIMAL PAGE
// This version removes ALL UI library components to isolate the issue.
// Using ONLY plain HTML elements — no Radix, no shadcn, no Lucide icons.
// If this works, the bug is in one of the UI components.
// If this STILL fails, the bug is in Next.js/React/data itself.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !isNaN(v)) return v;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();

  // Guard useParams()
  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === 'string'
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? '')
      : '';

  if (!projectId) {
    return <div style={{ padding: 24, textAlign: "center" }}><p>Invalid project ID</p>
      <button onClick={() => router.push("/dashboard/projects")}>Back</button></div>;
  }

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projectFound, setProjectFound] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  // ── Minimal state: only primitives ──
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectStatus, setProjectStatus] = useState("PLANNING");
  const [projectProgress, setProjectProgress] = useState(0);
  const [rawDataKeys, setRawDataKeys] = useState("");
  const [rawDataTypes, setRawDataTypes] = useState("");

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async () => {
    try {
      // ONLY fetch project — nothing else
      const projRes = await fetch(`/api/projects?projectId=${projectId}`, { credentials: 'include' });

      if (projRes.ok) {
        const projData = await projRes.json();
        console.log('[DIAG] Raw project response type:', typeof projData);
        console.log('[DIAG] Is array:', Array.isArray(projData));

        let raw: Record<string, unknown> | null = null;
        if (Array.isArray(projData) && projData.length > 0) {
          raw = projData[0];
        } else if (projData && typeof projData === "object" && projData.id) {
          raw = projData as Record<string, unknown>;
        }

        if (raw) {
          // LOG EVERYTHING about this object
          const keys = Object.keys(raw);
          const types = keys.map(k => `${k}=${typeof raw[k]}`).join(', ');
          console.log('[DIAG] Project keys:', keys);
          console.log('[DIAG] Project types:', types);
          setRawDataKeys(keys.join(', '));
          setRawDataTypes(types);

          // Check EVERY value for objects
          for (const key of keys) {
            const val = raw[key];
            if (val !== null && typeof val === 'object') {
              console.error('[DIAG] FOUND OBJECT IN PROJECT DATA:', key, val);
              console.error('[DIAG] Object keys:', Object.keys(val));
            }
          }

          setProjectFound(true);
          setProjectName(str(raw.name, "Unnamed"));
          setProjectDesc(str(raw.description));
          setProjectStatus(str(raw.status, "PLANNING"));
          setProjectProgress(num(raw.progress));
        } else {
          console.log('[DIAG] No project data found in response');
          setProjectFound(false);
        }
      } else {
        console.log('[DIAG] Project API returned status:', projRes.status);
        setProjectFound(false);
      }
    } catch (err) {
      console.error('[DIAG] Fetch error:', err);
      setDebugInfo(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Loading state: plain HTML only ──
  if (!mounted || loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ width: 200, height: 20, background: '#e5e7eb', borderRadius: 4 }} />
        <div style={{ width: '100%', height: 80, background: '#e5e7eb', borderRadius: 8, marginTop: 16 }} />
        <div style={{ width: '100%', height: 200, background: '#e5e7eb', borderRadius: 8, marginTop: 16 }} />
      </div>
    );
  }

  if (!projectFound) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p>Project not found</p>
        <button onClick={() => router.push("/dashboard/projects")} style={{ marginTop: 12, padding: '8px 16px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>
          Back to Projects
        </button>
      </div>
    );
  }

  // ── RENDER: 100% plain HTML — NO UI components at all ──
  return (
    <div style={{ padding: 16 }}>
      {/* Diagnostic info */}
      <details style={{ marginBottom: 16, border: '1px solid #fca5a5', borderRadius: 8, padding: 12, background: '#fef2f2' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: 14, color: '#dc2626' }}>
          [v6 DIAGNOSTIC] Minimal page — no UI components
        </summary>
        <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'monospace' }}>
          <p>Project ID: {String(projectId)}</p>
          <p>Found: {String(projectFound)}</p>
          <p>Data keys: {rawDataKeys}</p>
          <p>Data types: {rawDataTypes}</p>
          <p>Name: {String(projectName)}</p>
          <p>Status: {String(projectStatus)}</p>
          <p>Progress: {String(projectProgress)}</p>
          {debugInfo && <p>Error: {debugInfo}</p>}
        </div>
      </details>

      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/projects")}
        style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', marginBottom: 16 }}
      >
        ← Back to Projects
      </button>

      {/* Project header — plain HTML */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: '0 0 4px 0' }}>
          {String(projectName)}
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          {projectDesc || "No description"}
        </p>
      </div>

      {/* Project info — plain HTML */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Status</p>
          <p style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>
            {String(projectStatus).replace("_", " ")}
          </p>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Progress</p>
          <p style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>
            {String(projectProgress)}%
          </p>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Budget</p>
          <p style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>N/A</p>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Deadline</p>
          <p style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>No deadline</p>
        </div>
      </div>

      {/* Placeholder for tasks — no task board, just a message */}
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 8 }}>
        Task board will appear here. This is the minimal diagnostic page.
        <br />
        If you see this without error, the bug is in one of the UI components.
      </div>
    </div>
  );
}
