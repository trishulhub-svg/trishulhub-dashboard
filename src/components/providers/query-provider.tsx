"use client";

import React, { Component, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface QueryErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class QueryErrorBoundary extends Component<
  { children: React.ReactNode },
  QueryErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): QueryErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[200px] items-center justify-center p-6">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-red-600">
              Something went wrong.
            </p>
            <p className="text-xs text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 60s instead of 30s — reduces unnecessary refetches
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryErrorBoundary>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </QueryErrorBoundary>
  );
}
