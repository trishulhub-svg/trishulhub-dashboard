"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

export default function AgentChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AgentChatError]", error.message, error.stack);
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
          <h2 className="text-xl font-bold text-foreground">Agent Chat Error</h2>
          <p className="text-muted-foreground text-sm">
            The agent chat encountered an error. This is usually caused by a temporary issue. Please try again.
          </p>
          {error.message && (
            <details className="text-left mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Error details
              </summary>
              <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-auto max-h-32 text-red-600 dark:text-red-400">
                {error.message}
              </pre>
            </details>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard/agents")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Agents
          </Button>
        </div>
      </div>
    </div>
  );
}
