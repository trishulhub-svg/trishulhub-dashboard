"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Maximize, Minimize, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingScreen from "@/components/ui/loading-screen";

export default function WorkspaceChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-5 md:-m-8">
      {/* Workspace Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/agents")}
            aria-label="Back to workspace"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <h1 className="text-sm font-semibold">TrishulHub AI Workspace</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize className="h-3.5 w-3.5" />
            ) : (
              <Maximize className="h-3.5 w-3.5" />
            )}
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </div>

      {/* iframe Container */}
      <div id="workspace-container" className="flex-1 relative bg-background">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary animate-pulse" />
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Connecting to AI Workspace...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Loading chat interface</p>
          </div>
        )}
        <iframe
          src="https://udify.app/chatbot/AQxG1N7NwRkQoBAf"
          className="w-full h-full border-0"
          style={{ minHeight: "700px" }}
          allow="microphone"
          onLoad={() => setIframeLoaded(true)}
          title="TrishulHub AI Workspace"
        />
      </div>
    </div>
  );
}
