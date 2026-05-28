"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function FinanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Finance Page Error]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full border-l-4 border-l-red-500">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                The finance page encountered an unexpected error.
              </p>
            </div>
          </div>
          {error.message && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-mono text-muted-foreground break-all">
                {error.message}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">
              <RotateCcw className="h-4 w-4 mr-2" /> Try Again
            </Button>
            <Button
              variant="ghost"
              onClick={() => (window.location.href = "/dashboard")}
              className="flex-1"
            >
              <Home className="h-4 w-4 mr-2" /> Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
