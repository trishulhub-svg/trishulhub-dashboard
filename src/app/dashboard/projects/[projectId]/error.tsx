"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

export default function ProjectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Layer 4: Detailed error diagnostics for React #310
    console.error("[ProjectDetailError] Full error info:", {
      message: error.message,
      digest: error.digest,
      name: error.name,
      stack: error.stack,
    });

    // Try to detect the specific cause
    if (error.message.includes("310") || error.message.includes("Objects are not valid")) {
      console.error("[ZAI #310] React rendering error detected. Common causes:");
      console.error("  1. A Prisma Date object was rendered directly in JSX");
      console.error("  2. A nested object (from include) was rendered instead of a scalar");
      console.error("  3. A JSON-parsed value that's still an object/array was passed to JSX");
      console.error("  4. A function, Symbol, or other non-serializable was in React state");
      console.error("  Check the component stack above for the exact JSX expression.");
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Project Error</h2>
          <p className="text-muted-foreground text-sm">
            Something went wrong loading this project. Try refreshing or go back to projects.
          </p>
          {error.message && (
            <details className="text-left mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Error details
              </summary>
              <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
                {error.message}
                {error.digest && `\n\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard/projects")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </Button>
        </div>
      </div>
    </div>
  );
}
