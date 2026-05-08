"use client";

import Image from "next/image";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div className="animate-loading-fade-in fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background">
      {/* Subtle radial glow behind the logo */}
      <div className="pointer-events-none absolute flex flex-col items-center">
        <div className="absolute -inset-16 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -inset-6 rounded-full bg-primary/[0.08] blur-2xl" />
      </div>

      <div className="relative flex flex-col items-center gap-5">
        {/* Logo */}
        <div className="relative h-16 w-40">
          <div className="animate-logo-glow absolute -inset-2 rounded-xl bg-gradient-to-br from-primary/20 via-transparent to-primary/10 opacity-0 blur-xl" />
          <Image
            src="/200px.png"
            alt="TrishulHub"
            fill
            priority
            className="relative z-10 object-contain"
          />
        </div>

        {/* Brand name */}
        <h1 className="animate-loading-fade-in text-2xl font-bold tracking-tight text-primary [animation-delay:200ms]">
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
              className="h-1.5 w-1.5 rounded-full bg-primary/60"
              style={{
                animation: `loading-dot-pulse 1.4s ease-in-out ${i * 180}ms infinite`,
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

        @keyframes logo-glow {
          0%,
          100% {
            opacity: 0;
            transform: scale(0.95);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
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
          animation: loading-fade-in 0.6s ease-out both;
        }

        .animate-logo-glow {
          animation: logo-glow 2.4s ease-in-out 0.3s infinite;
        }
      `}</style>
    </div>
  );
}

export default LoadingScreen;
