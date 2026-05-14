"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Sparkles,
  Bot,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LoadingScreen from "@/components/ui/loading-screen";

/* ─── Typewriter Loading Dots Text ─── */
const CONNECT_TEXT = "Connecting to workspace";
const CONNECT_SUFFIXES = ["", ".", "..", "..."];

function ConnectingLabel({ visible }: { visible: boolean }) {
  const [dotIdx, setDotIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setDotIdx((p) => (p + 1) % CONNECT_SUFFIXES.length);
    }, 500);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <span className="ws-connect-text">
      {CONNECT_TEXT}
      <span className="ws-connect-dots">{CONNECT_SUFFIXES[dotIdx]}</span>
    </span>
  );
}

/* ─── Component ─── */
export default function WorkspaceChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  // Prevent hydration mismatch
  useEffect(() => setMounted(true), []);

  // Derive mode: "dark", "light", or "bluelight"
  const mode = mounted
    ? resolvedTheme === "bluelight"
      ? "bluelight"
      : resolvedTheme === "dark"
        ? "dark"
        : "light"
    : "dark";

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Smooth fade-out for loading overlay
  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setShowLoading(false);
    }, 600);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const toggleFullscreen = () => {
    const container = document.getElementById("workspace-container");
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (status === "loading") {
    return <LoadingScreen message="Loading workspace..." />;
  }

  if (!session) return null;

  return (
    <>
      <div className={`ws-root ws-root--${mode}`}>
        {/* ─── Workspace Header Bar ─── */}
        <header className={`ws-header ws-header--${mode}`}>
          {/* Gradient bottom border */}
          <div
            className={`ws-header-border ws-header-border--${mode}`}
            aria-hidden
          />

          <div className="ws-header-inner">
            {/* Left: Back + Branding */}
            <div className="ws-header-left">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ws-back-btn"
                    onClick={() => router.push("/dashboard/agents")}
                    aria-label="Back to agents"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  Back to Agents
                </TooltipContent>
              </Tooltip>

              <div className="ws-brand">
                <Sparkles className={`ws-brand-icon ws-brand-icon--${mode}`} />
                <h1 className={`ws-brand-title ws-brand-title--${mode}`}>
                  Trishul 2nd Workspace
                </h1>
                <span className="ws-pulse-dot" aria-hidden>
                  <span className="ws-pulse-ring" />
                  <span className="ws-pulse-core" />
                </span>
              </div>
            </div>

            {/* Right: Status + Fullscreen */}
            <div className="ws-header-right">
              {/* Connection status */}
              <div className={`ws-status ws-status--${mode}`}>
                {iframeLoaded ? (
                  <Wifi className="ws-status-icon ws-status-icon--connected" />
                ) : (
                  <WifiOff className="ws-status-icon ws-status-icon--disconnected" />
                )}
                <span
                  className={`ws-status-text ws-status-text--${iframeLoaded ? "connected" : "disconnected"}`}
                >
                  {iframeLoaded ? "Connected" : "Connecting"}
                </span>
              </div>

              {/* Fullscreen toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`ws-fs-btn ws-fs-btn--${mode}`}
                    onClick={toggleFullscreen}
                    aria-label={
                      isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                    }
                  >
                    {isFullscreen ? (
                      <Minimize className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {isFullscreen ? "Exit" : "Fullscreen"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* ─── Iframe Container ─── */}
        <div
          id="workspace-container"
          className={`ws-iframe-wrap ws-iframe-wrap--${mode}`}
        >
          {/* Loading Overlay */}
          {showLoading && (
            <div
              className={`ws-loading-overlay ${
                iframeLoaded ? "ws-loading-overlay--fading" : ""
              } ws-loading-overlay--${mode}`}
            >
              {/* Animated spinner ring */}
              <div className="ws-spinner">
                <div className={`ws-spinner-ring ws-spinner-ring--${mode}`} />
                <div className="ws-spinner-ring ws-spinner-ring--outer" />
                <div className={`ws-spinner-center ws-spinner-center--${mode}`}>
                  <Bot className="ws-spinner-bot" />
                </div>
              </div>

              {/* Text */}
              <div className="ws-loading-text-wrap">
                <p className={`ws-loading-text ws-loading-text--${mode}`}>
                  <ConnectingLabel visible={!iframeLoaded} />
                </p>
                <p
                  className={`ws-loading-sub ws-loading-sub--${mode}`}
                >
                  Initializing TrishulHub AI
                </p>
              </div>

              {/* Bottom progress bar */}
              <div className="ws-progress-track">
                <div
                  className={`ws-progress-bar ws-progress-bar--${mode}`}
                />
              </div>
            </div>
          )}

          {/* The Iframe */}
          <iframe
            src="https://udify.app/chatbot/AQxG1N7NwRkQoBAf"
            className="ws-iframe"
            style={{ minHeight: "700px" }}
            allow="microphone"
            onLoad={handleIframeLoad}
            title="TrishulHub AI Workspace"
          />
        </div>
      </div>

      {/* ═══ Scoped Keyframes & Styles ═══ */}
      <style jsx global>{`
        /* ═══════════════════════════════════════════
           WORKSPACE PAGE — Premium SaaS Design
           DARK / LIGHT / BLUELIGHT
           ═══════════════════════════════════════════ */

        /* ─── KEYFRAMES ─── */
        @keyframes ws-header-enter {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes ws-pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(2.8);
            opacity: 0;
          }
        }
        @keyframes ws-spinner-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes ws-spinner-rotate-reverse {
          0% {
            transform: rotate(360deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }
        @keyframes ws-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes ws-progress-indeterminate {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(300%);
          }
        }
        @keyframes ws-spinner-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
        }
        @keyframes ws-float-subtle {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        /* ─── ROOT ─── */
        .ws-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 4rem);
          margin: -1.25rem;
          overflow: hidden;
          transition: background 0.4s ease;
        }
        @media (min-width: 768px) {
          .ws-root {
            margin: -2rem;
          }
        }
        .ws-root--dark {
          background: #09090b;
        }
        .ws-root--light {
          background: #ffffff;
        }
        .ws-root--bluelight {
          background: #0c0a09;
        }

        /* ─── HEADER ─── */
        .ws-header {
          position: relative;
          z-index: 20;
          flex-shrink: 0;
          animation: ws-header-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .ws-header-border {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          pointer-events: none;
        }
        .ws-header-border--dark {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.06) 20%,
            rgba(255, 255, 255, 0.12) 50%,
            rgba(255, 255, 255, 0.06) 80%,
            transparent 100%
          );
        }
        .ws-header-border--light {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(0, 0, 0, 0.04) 20%,
            rgba(0, 0, 0, 0.08) 50%,
            rgba(0, 0, 0, 0.04) 80%,
            transparent 100%
          );
        }
        .ws-header-border--bluelight {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(251, 191, 36, 0.08) 20%,
            rgba(251, 191, 36, 0.16) 50%,
            rgba(251, 191, 36, 0.08) 80%,
            transparent 100%
          );
        }

        .ws-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 54px;
          padding: 0 16px;
          transition: background 0.4s ease;
        }
        @media (min-width: 768px) {
          .ws-header-inner {
            padding: 0 24px;
          }
        }

        .ws-header--dark .ws-header-inner {
          background: rgba(24, 24, 27, 0.6);
          backdrop-filter: blur(20px) saturate(1.2);
          -webkit-backdrop-filter: blur(20px) saturate(1.2);
        }
        .ws-header--light .ws-header-inner {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px) saturate(1.2);
          -webkit-backdrop-filter: blur(20px) saturate(1.2);
        }
        .ws-header--bluelight .ws-header-inner {
          background: rgba(28, 25, 23, 0.7);
          backdrop-filter: blur(20px) saturate(1.2);
          -webkit-backdrop-filter: blur(20px) saturate(1.2);
        }

        /* Fullscreen overrides */
        :fullscreen .ws-header--dark .ws-header-inner {
          background: rgba(9, 9, 11, 0.85);
          backdrop-filter: blur(24px) saturate(1.3);
          -webkit-backdrop-filter: blur(24px) saturate(1.3);
        }
        :fullscreen .ws-header--light .ws-header-inner {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(24px) saturate(1.3);
          -webkit-backdrop-filter: blur(24px) saturate(1.3);
        }
        :fullscreen .ws-header--bluelight .ws-header-inner {
          background: rgba(12, 10, 9, 0.85);
          backdrop-filter: blur(24px) saturate(1.3);
          -webkit-backdrop-filter: blur(24px) saturate(1.3);
        }

        /* ─── Header Left ─── */
        .ws-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .ws-back-btn {
          height: 34px !important;
          width: 34px !important;
          border-radius: 10px !important;
          flex-shrink: 0;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .ws-back-btn:hover {
          transform: translateX(-2px);
        }
        .ws-back-btn:active {
          transform: scale(0.92) !important;
        }

        .ws-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .ws-brand-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          transition: color 0.4s ease;
        }
        .ws-brand-icon--dark {
          color: rgba(251, 191, 36, 0.85);
        }
        .ws-brand-icon--light {
          color: rgba(217, 119, 6, 0.85);
        }
        .ws-brand-icon--bluelight {
          color: rgba(251, 191, 36, 0.95);
        }

        .ws-brand-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.4s ease;
        }
        .ws-brand-title--dark {
          color: rgba(255, 255, 255, 0.88);
        }
        .ws-brand-title--light {
          color: rgba(24, 24, 27, 0.88);
        }
        .ws-brand-title--bluelight {
          color: rgba(255, 220, 150, 0.9);
        }

        /* ─── Pulse Dot ─── */
        .ws-pulse-dot {
          position: relative;
          width: 8px;
          height: 8px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ws-pulse-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.5);
          animation: ws-pulse-ring 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }
        .ws-pulse-core {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
        }

        /* ─── Header Right ─── */
        .ws-header-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .ws-status {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 500;
          transition: all 0.4s ease;
        }
        .ws-status--dark {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .ws-status--light {
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.06);
        }
        .ws-status--bluelight {
          background: rgba(251, 191, 36, 0.04);
          border: 1px solid rgba(251, 191, 36, 0.08);
        }

        .ws-status-icon {
          width: 12px;
          height: 12px;
        }
        .ws-status-icon--connected {
          color: #22c55e;
        }
        .ws-status-icon--disconnected {
          color: #f59e0b;
        }

        .ws-status-text {
          transition: color 0.4s ease;
        }
        .ws-status-text--connected {
          color: #22c55e;
        }
        .ws-status-text--disconnected {
          color: #f59e0b;
        }

        /* ─── Fullscreen Button ─── */
        .ws-fs-btn {
          height: 34px !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          gap: 5px !important;
          padding: 0 12px !important;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .ws-fs-btn:hover {
          transform: scale(1.03);
        }
        .ws-fs-btn:active {
          transform: scale(0.96) !important;
        }

        .ws-fs-btn--dark {
          background: rgba(255, 255, 255, 0.05) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          color: rgba(255, 255, 255, 0.7) !important;
        }
        .ws-fs-btn--dark:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          color: rgba(255, 255, 255, 0.9) !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
        }
        .ws-fs-btn--light {
          background: rgba(0, 0, 0, 0.04) !important;
          border: 1px solid rgba(0, 0, 0, 0.06) !important;
          color: rgba(0, 0, 0, 0.6) !important;
        }
        .ws-fs-btn--light:hover {
          background: rgba(0, 0, 0, 0.08) !important;
          color: rgba(0, 0, 0, 0.8) !important;
          border-color: rgba(0, 0, 0, 0.1) !important;
        }
        .ws-fs-btn--bluelight {
          background: rgba(251, 191, 36, 0.06) !important;
          border: 1px solid rgba(251, 191, 36, 0.1) !important;
          color: rgba(251, 191, 36, 0.7) !important;
        }
        .ws-fs-btn--bluelight:hover {
          background: rgba(251, 191, 36, 0.12) !important;
          color: rgba(251, 191, 36, 0.9) !important;
          border-color: rgba(251, 191, 36, 0.18) !important;
        }

        /* ─── IFRAME WRAPPER ─── */
        .ws-iframe-wrap {
          position: relative;
          flex: 1;
          min-height: 0;
          transition: background 0.4s ease;
        }
        .ws-iframe-wrap--dark {
          background: #09090b;
        }
        .ws-iframe-wrap--light {
          background: #f9fafb;
        }
        .ws-iframe-wrap--bluelight {
          background: #0c0a09;
        }

        .ws-iframe {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }

        /* ─── LOADING OVERLAY ─── */
        .ws-loading-overlay {
          position: absolute;
          inset: 0;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          animation: ws-fade-in 0.3s ease both;
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ws-loading-overlay--fading {
          opacity: 0 !important;
          pointer-events: none;
        }

        .ws-loading-overlay--dark {
          background: rgba(9, 9, 11, 0.97);
        }
        .ws-loading-overlay--light {
          background: rgba(249, 250, 251, 0.97);
        }
        .ws-loading-overlay--bluelight {
          background: rgba(12, 10, 9, 0.97);
        }

        /* ─── Spinner ─── */
        .ws-spinner {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ws-float-subtle 3s ease-in-out infinite;
        }

        .ws-spinner-ring {
          position: absolute;
          border-radius: 50%;
        }

        .ws-spinner-ring--dark {
          width: 72px;
          height: 72px;
          border: 2px solid transparent;
          border-top-color: rgba(251, 191, 36, 0.7);
          border-right-color: rgba(6, 182, 212, 0.4);
          animation: ws-spinner-rotate 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.15));
        }
        .ws-spinner-ring--light {
          width: 72px;
          height: 72px;
          border: 2px solid transparent;
          border-top-color: rgba(217, 119, 6, 0.7);
          border-right-color: rgba(6, 150, 180, 0.4);
          animation: ws-spinner-rotate 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          filter: drop-shadow(0 0 8px rgba(217, 119, 6, 0.1));
        }
        .ws-spinner-ring--bluelight {
          width: 72px;
          height: 72px;
          border: 2px solid transparent;
          border-top-color: rgba(251, 191, 36, 0.8);
          border-right-color: rgba(245, 158, 11, 0.4);
          animation: ws-spinner-rotate 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.2));
        }

        .ws-spinner-ring--outer {
          width: 60px;
          height: 60px;
          border: 1.5px solid transparent;
          border-bottom-color: rgba(168, 85, 247, 0.25);
          border-left-color: rgba(236, 72, 153, 0.15);
          animation: ws-spinner-rotate-reverse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .ws-spinner-center {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ws-spinner-pulse 2.5s ease-in-out infinite;
          z-index: 1;
        }
        .ws-spinner-center--dark {
          background: rgba(251, 191, 36, 0.08);
          border: 1px solid rgba(251, 191, 36, 0.15);
        }
        .ws-spinner-center--light {
          background: rgba(217, 119, 6, 0.06);
          border: 1px solid rgba(217, 119, 6, 0.12);
        }
        .ws-spinner-center--bluelight {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.2);
        }

        .ws-spinner-bot {
          width: 18px;
          height: 18px;
          transition: color 0.4s ease;
        }
        .ws-spinner-center--dark .ws-spinner-bot {
          color: rgba(251, 191, 36, 0.85);
        }
        .ws-spinner-center--light .ws-spinner-bot {
          color: rgba(217, 119, 6, 0.85);
        }
        .ws-spinner-center--bluelight .ws-spinner-bot {
          color: rgba(251, 191, 36, 0.95);
        }

        /* ─── Loading Text ─── */
        .ws-loading-text-wrap {
          text-align: center;
        }
        .ws-loading-text {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          transition: color 0.4s ease;
        }
        .ws-loading-text--dark {
          color: rgba(255, 255, 255, 0.55);
        }
        .ws-loading-text--light {
          color: rgba(0, 0, 0, 0.4);
        }
        .ws-loading-text--bluelight {
          color: rgba(251, 191, 36, 0.55);
        }

        .ws-connect-dots {
          display: inline-block;
          width: 1.4em;
          text-align: left;
        }

        .ws-loading-sub {
          font-size: 11px;
          font-weight: 400;
          margin-top: 6px;
          letter-spacing: 0.02em;
          transition: color 0.4s ease;
        }
        .ws-loading-sub--dark {
          color: rgba(255, 255, 255, 0.25);
        }
        .ws-loading-sub--light {
          color: rgba(0, 0, 0, 0.2);
        }
        .ws-loading-sub--bluelight {
          color: rgba(251, 191, 36, 0.25);
        }

        /* ─── Progress Bar ─── */
        .ws-progress-track {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          width: 160px;
          height: 2px;
          border-radius: 2px;
          overflow: hidden;
          transition: background 0.4s ease;
        }
        .ws-progress-track--dark {
          background: rgba(255, 255, 255, 0.06);
        }
        .ws-progress-track--light {
          background: rgba(0, 0, 0, 0.06);
        }
        .ws-progress-track--bluelight {
          background: rgba(251, 191, 36, 0.08);
        }

        .ws-progress-bar {
          width: 40%;
          height: 100%;
          border-radius: 2px;
          animation: ws-progress-indeterminate 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .ws-progress-bar--dark {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(251, 191, 36, 0.6),
            rgba(6, 182, 212, 0.6),
            transparent
          );
        }
        .ws-progress-bar--light {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(217, 119, 6, 0.5),
            rgba(6, 150, 180, 0.5),
            transparent
          );
        }
        .ws-progress-bar--bluelight {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(251, 191, 36, 0.7),
            rgba(245, 158, 11, 0.5),
            transparent
          );
        }

        /* ─── Responsive Tweaks ─── */
        @media (max-width: 480px) {
          .ws-brand-title {
            font-size: 11.5px;
          }
          .ws-status-text {
            display: none;
          }
          .ws-status {
            padding: 4px 8px;
          }
          .ws-header-inner {
            padding: 0 12px;
          }
        }
      `}</style>
    </>
  );
}
