"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft, Bug } from "lucide-react";

export default function ProjectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // FIX v4: Capture ALL error info including type-specific details
  const [errorDetails, setErrorDetails] = useState<string>("");

  useEffect(() => {
    console.group("[ProjectDetailError] Full Error Details");
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    console.error("Error digest:", error?.digest);
    // Log all enumerable properties on the error object
    if (error) {
      try {
        Object.keys(error).forEach((key) => {
          const val = (error as unknown as Record<string, unknown>)[key];
          console.error(`Error.${key}:`, val);
          console.error(`Error.${key} type:`, typeof val);
          if (val !== null && typeof val === 'object') {
            console.error(`Error.${key} keys:`, Object.keys(val));
          }
        });
      } catch { /* ignore */ }
    }
    console.groupEnd();

    // Build a detailed error summary for display
    const details: string[] = [];
    if (error) {
      details.push("Name: " + String(error.name ?? "unknown"));
      details.push("Message: " + String(error.message ?? "no message"));
      // Try to extract info from error object properties
      try {
        const errObj = error as unknown as Record<string, unknown>;
        for (const key of Object.keys(errObj)) {
          const val = errObj[key];
          if (key === 'name' || key === 'message' || key === 'stack' || key === 'digest') continue;
          if (val !== null && typeof val === 'object') {
            details.push(key + ": [object with keys: " + Object.keys(val).join(', ') + "]");
          } else {
            details.push(key + ": " + String(val));
          }
        }
      } catch { /* ignore */ }
    }
    setErrorDetails(details.join("\n"));
  }, [error]);

  // Safely extract error info — NEVER render raw objects
  const errorName = typeof error?.name === "string" ? error.name : "UnknownError";
  const errorMessage = typeof error?.message === "string" ? error.message : "An unexpected error occurred";
  const errorDigest = typeof error?.digest === "string" ? error.digest : "";
  const errorStack = typeof error?.stack === "string" ? error.stack : "";

  // Parse React #310 message to extract the object keys
  // React #310: "Objects are not valid as a React child (found: object with keys {key1, key2, ...})"
  const keyMatch = errorMessage.match(/object with keys?\s*\{([^}]+)\}/);
  const objectKeys = keyMatch ? keyMatch[1].trim() : null;

  // Try to extract component stack from React error
  const componentStack = (error as Error & { componentStack?: string })?.componentStack || "";

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-bold text-foreground text-center">Project Error</h2>
          <p className="text-muted-foreground text-sm text-center">
            Something went wrong loading this project.
          </p>
        </div>

        {/* ── FULL ERROR DETAILS (always visible) ── */}
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">Error Details</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Hide" : "Show"}
            </Button>
          </div>

          {expanded && (
            <div className="space-y-2">
              {/* Error type */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-red-500 dark:text-red-400 font-semibold mb-1">Type</p>
                <p className="text-sm font-mono text-red-700 dark:text-red-300">{errorName}</p>
              </div>

              {/* Error message */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-red-500 dark:text-red-400 font-semibold mb-1">Message</p>
                <p className="text-sm font-mono text-red-700 dark:text-red-300 break-all">{errorMessage}</p>
              </div>

              {/* Additional error details (v4 diagnostic) */}
              {errorDetails && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-blue-500 dark:text-blue-400 font-semibold mb-1">Diagnostic Details</p>
                  <pre className="text-xs font-mono text-blue-700 dark:text-blue-300 bg-white dark:bg-black/20 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                    {errorDetails}
                  </pre>
                </div>
              )}

              {/* If React #310, show the object keys prominently */}
              {objectKeys && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-orange-500 dark:text-orange-400 font-semibold mb-1">
                    Object Keys Found (React #310)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {objectKeys.split(",").map((key) => (
                      <span key={key.trim()} className="inline-block px-2 py-0.5 text-xs font-mono bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded">
                        {key.trim()}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    One of these object keys contains a value being rendered as a React child.
                  </p>
                </div>
              )}

              {/* Component stack (if available) */}
              {componentStack && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-500 dark:text-red-400 font-semibold mb-1">Component Stack</p>
                  <pre className="text-xs font-mono text-red-600 dark:text-red-400 bg-white dark:bg-black/20 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                    {componentStack}
                  </pre>
                </div>
              )}

              {/* Error stack */}
              {errorStack && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-500 dark:text-red-400 font-semibold mb-1">Stack Trace</p>
                  <pre className="text-xs font-mono text-red-600 dark:text-red-400 bg-white dark:bg-black/20 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                    {errorStack}
                  </pre>
                </div>
              )}

              {/* Digest */}
              {errorDigest && (
                <p className="text-xs text-muted-foreground">Digest: {errorDigest}</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = "/dashboard/projects"; }} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </Button>
        </div>
      </div>
    </div>
  );
}
