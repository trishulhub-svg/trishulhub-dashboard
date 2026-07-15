"use client";

import Image from "next/image";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading application" className="animate-loading-fade-in fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background">
      {/* Quiet brand wash behind the logo */}
      <div className="pointer-events-none absolute h-40 w-40 rounded-full bg-primary/[0.06] blur-2xl" />

      <div className="relative flex flex-col items-center gap-5">
        {/* Logo */}
        <div className="relative h-16 w-40">
          <Image
            src="/200px.png"
            alt="TrishulHub"
            fill
            priority
            className="relative z-10 object-contain"
          />
        </div>

        {/* Brand name */}
        <h1 className="animate-loading-fade-in text-2xl font-semibold tracking-tight text-foreground [animation-delay:200ms]">
          TrishulHub
        </h1>

        {/* Optional message */}
        {message && (
          <p className="animate-loading-fade-in text-sm text-muted-foreground [animation-delay:400ms]">
            {message}
          </p>
        )}

        {/* Animated pulse dots */}
        <div className="mt-1 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary/50"
              style={{
                animation: `loading-dot-pulse 1s ease-in-out ${i * 120}ms infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Keyframe definitions injected once via style tag */}
      <style jsx>{`
        @keyframes loading-fade-in {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes loading-dot-pulse {
          0%,
          80%,
          100% {
            opacity: 0.25;
            transform: scale(0.85);
          }
          40% {
            opacity: 1;
            transform: scale(1.15);
          }
        }

        .animate-loading-fade-in {
          animation: loading-fade-in 0.3s ease-out both;
        }
      `}</style>
    </div>
  );
}

export default LoadingScreen;
