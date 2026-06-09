"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error] Unhandled error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 max-w-md text-center">
          <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            An unexpected error occurred. Please try again or sign in to your account.
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
            <a
              href="/login"
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              Go to Login
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
