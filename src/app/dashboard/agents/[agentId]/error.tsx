"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft, Copy, Check } from "lucide-react";

export default function AgentChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("[AgentChatError]", error.message, error.stack);
  }, [error]);

  // Classify the error to give better user guidance
  const msg = error.message || "";
  const isAPIKeyError =
    msg.includes("API key") ||
    msg.includes("ZAI_API_KEY") ||
    msg.includes("apiKey") ||
    msg.includes("No active Z.ai");
  const isRateLimit =
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("busy");
  const isNetworkError =
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("ECONNREFUSED");
  const isDBError =
    msg.includes("prisma") ||
    msg.includes("database") ||
    msg.includes("P2025") ||
    msg.includes("P2002");
  const isRenderError =
    msg.includes("Cannot read properties") ||
    msg.includes("undefined") ||
    msg.includes("null") ||
    msg.includes("is not a function");

  let helpText = "An unexpected error occurred while loading the agent chat. This is usually temporary.";
  let actionSuggestion = "";

  if (isAPIKeyError) {
    helpText = "The API key is missing or invalid. This agent requires an API key (Z.ai, NVIDIA, or OpenRouter) to function.";
    actionSuggestion = "Go to Dashboard > API Keys and add a valid API key.";
  } else if (isRateLimit) {
    helpText = "The AI model is currently busy (rate limited). This is temporary and your data is safe.";
    actionSuggestion = "Wait 30-60 seconds and try again.";
  } else if (isNetworkError) {
    helpText = "A network error occurred. This could be a temporary connectivity issue.";
    actionSuggestion = "Check your internet connection and try again.";
  } else if (isDBError) {
    helpText = "A database error occurred. The chat data may be temporarily unavailable.";
    actionSuggestion = "Try refreshing the page. If the problem persists, contact support.";
  } else if (isRenderError) {
    helpText = "A rendering error occurred. This is likely a bug in the application.";
    actionSuggestion = "Try refreshing the page. The error has been logged for investigation.";
  }

  const copyErrorDetails = () => {
    const details = `Error: ${msg}\n\nStack: ${error.stack || "N/A"}\n\nDigest: ${error.digest || "N/A"}`;
    navigator.clipboard.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
          <p className="text-muted-foreground text-sm">{helpText}</p>
          {actionSuggestion && (
            <p className="text-amber-600 dark:text-amber-400 text-xs font-medium mt-2">
              {actionSuggestion}
            </p>
          )}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-3">
              <button
                className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 mx-auto"
                onClick={() => setShowDetails(!showDetails)}
                type="button"
              >
                {showDetails ? "Hide" : "Show"} error details
              </button>
              {showDetails && (
                <div className="mt-2 relative">
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 text-left text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
                    {msg || "No error message available"}
                  </pre>
                  {error.stack && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        Stack trace
                      </summary>
                      <pre className="mt-1 text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 text-left text-muted-foreground whitespace-pre-wrap break-all">
                        {error.stack}
                      </pre>
                    </details>
                  )}
                  <button
                    className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                    onClick={copyErrorDetails}
                    title="Copy error details"
                    aria-label="Copy error details"
                    type="button"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={reset}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // Hard refresh to clear any stale state
              window.location.reload();
            }}
            className="gap-2"
          >
            Hard Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/dashboard/agents")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Agents
          </Button>
        </div>
      </div>
    </div>
  );
}
