"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ShieldCheck,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Clock,
  Lock,
  Key,
  Cpu,
  FileText,
} from "lucide-react";
import { cn, safeText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Step = "check" | "upload" | "otp_sent" | "otp_verify" | "verified" | "error";

const AGENT_COLORS: Record<string, string> = {
  DEV: "text-blue-500 border-blue-500/30 bg-blue-500/5",
  CLIENT_HUNTER: "text-green-500 border-green-500/30 bg-green-500/5",
  FINANCE: "text-yellow-500 border-yellow-500/30 bg-yellow-500/5",
  PROJECT_MANAGER: "text-purple-500 border-purple-500/30 bg-purple-500/5",
  HR: "text-pink-500 border-pink-500/30 bg-pink-500/5",
  CONTENT: "text-orange-500 border-orange-500/30 bg-orange-500/5",
  SUPPORT: "text-teal-500 border-teal-500/30 bg-teal-500/5",
};

const AGENT_LABELS: Record<string, string> = {
  DEV: "Dev Agent",
  CLIENT_HUNTER: "Client Hunter",
  FINANCE: "Finance Agent",
  PROJECT_MANAGER: "Project Manager",
  HR: "HR Agent",
  CONTENT: "Content Agent",
  SUPPORT: "Support Agent",
};

export default function ProtocolAccessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SUPER_ADMIN should use the management panel, not this page
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "SUPER_ADMIN") {
      router.replace("/dashboard/protocol");
    }
  }, [status, session, router]);

  const [step, setStep] = useState<Step>("check");
  const [inviteCode, setInviteCode] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [userAgentAccess, setUserAgentAccess] = useState<string[]>([]);
  const [protocolVersion, setProtocolVersion] = useState("");

  // On mount, check if user already has active protocol access
  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.role === "SUPER_ADMIN") return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/protocol/verify");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.hasAccess) {
            setUserAgentAccess(data.agentAccess || []);
            setProtocolVersion(data.protocolVersion || "");
            setStep("verified");
            return;
          }
        }
      } catch {
        // Non-critical
      }
      if (!cancelled) {
        setStep("upload");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [status, session]);

  // ── Read file and extract invite code ──
  const processFile = async (file: File) => {
    if (file.size > 1024 * 100) {
      toast.error("File is too large. Maximum size is 100KB.");
      return;
    }

    const text = await file.text();
    setFileName(file.name);

    // Extract TRISHUL-XXXXXX code from file content
    const match = text.match(/TRISHUL-[A-Z2-9]{6}/i);
    if (match) {
      setInviteCode(match[0].toUpperCase());
      submitAccessToken(match[0].toUpperCase());
    } else {
      // No code found in file — show error
      setErrorMsg("This file does not contain a valid TrishulHub access code. Please use the document provided by your administrator.");
      setStep("error");
    }
  };

  // Step 1: Submit access token
  const submitAccessToken = async (code: string) => {
    if (!code.trim()) {
      toast.error("Please upload the access document or enter the code");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/protocol/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok && data.step === "otp_sent") {
        setStep("otp_sent");
      } else {
        setErrorMsg(safeText(data.error, "Invalid access token"));
        setStep("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStep("error");
    }
    setLoading(false);
  };

  // Step 2: Submit OTP
  const submitOtp = async () => {
    if (!otp.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    if (otp.trim().length !== 6) {
      toast.error("OTP must be 6 digits");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/protocol/verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.trim().toUpperCase(),
          otp: otp.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserAgentAccess(data.agentAccess || []);
        setProtocolVersion(data.protocolVersion || "");
        setStep("verified");
      } else {
        setErrorMsg(safeText(data.error, "Verification failed"));
        setStep("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStep("error");
    }
    setLoading(false);
  };

  // File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Manual code entry
  const handleManualSubmit = () => {
    submitAccessToken(inviteCode);
  };

  // Reset flow
  const resetFlow = () => {
    setStep("upload");
    setInviteCode("");
    setOtp("");
    setFileName("");
    setErrorMsg("");
    setUserAgentAccess([]);
    setProtocolVersion("");
  };

  // ── Initial loading ──
  if (status === "loading" || (loading && step === "check")) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-3">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Protocol Access</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {step === "verified"
            ? "Protocol Access — Verified"
            : "Upload your access document to connect to the Trishul Protocol"}
        </p>
      </div>

      {/* Step Indicators (hidden when verified) */}
      {step !== "verified" && step !== "check" && (
        <div className="flex items-center justify-center gap-2">
          {[
            { label: "Upload", key: "upload" },
            { label: "OTP", key: "otp_sent" },
            { label: "Done", key: "verified" },
          ].map((s, idx) => (
            <div key={s.key} className="flex items-center gap-2">
              {idx > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  step === s.key || step === "otp_verify"
                    ? idx === 1
                      ? "bg-primary text-primary-foreground"
                      : step === s.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : step === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <span className="font-bold">{idx + 1}</span>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ STEP: Upload Document ═══════════ */}
      {step === "upload" && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-5 w-5" /> Upload Access Document
            </CardTitle>
            <CardDescription>
              Upload the access document provided by your administrator, or enter the access code manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drag & Drop Area */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-accent/30"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className={cn("h-8 w-8 mx-auto mb-2", dragOver ? "text-primary" : "text-muted-foreground")} />
              <p className="text-sm font-medium">
                {dragOver ? "Drop file here" : "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .txt files — the document from your administrator
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.text"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">or enter code manually</span>
              <div className="flex-1 border-t" />
            </div>

            {/* Manual Code Entry */}
            <div className="flex gap-2">
              <Input
                placeholder="TRISHUL-XXXXXX"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="font-mono tracking-wider text-center text-lg"
                maxLength={14}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              />
              <Button onClick={handleManualSubmit} disabled={loading || !inviteCode.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </Button>
            </div>
            {fileName && (
              <p className="text-xs text-muted-foreground text-center">
                File: {safeText(fileName)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ STEP: OTP Sent ═══════════ */}
      {(step === "otp_sent" || step === "otp_verify") && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> OTP Verification Required
            </CardTitle>
            <CardDescription>
              A 6-digit OTP has been sent to your administrator&apos;s email.
              Contact your administrator to get the OTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Do NOT refresh this page
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  The OTP expires in 5 minutes. Contact your administrator, get the OTP, and enter it below.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono tracking-widest text-center text-2xl"
                maxLength={6}
                onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                autoFocus
              />
              <Button onClick={submitOtp} disabled={loading || otp.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify OTP"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Enter the 6-digit OTP your administrator shared with you
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ STEP: Error ═══════════ */}
      {step === "error" && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <div>
              <h3 className="text-lg font-semibold">Verification Failed</h3>
              <p className="text-sm text-muted-foreground mt-1">{safeText(errorMsg)}</p>
            </div>
            <Button variant="outline" onClick={resetFlow}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ STEP: Verified — Access Granted ═══════════ */}
      {step === "verified" && (
        <div className="space-y-4">
          {/* Success Banner */}
          <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Protocol Access Granted</CardTitle>
                    <CardDescription>
                      Trishul Protocol {protocolVersion ? `v${safeText(protocolVersion)}` : ""} is now active in your workspace
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Verified
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Your Agent Access */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-5 w-5" /> Your Agent Access
              </CardTitle>
              <CardDescription>
                These are the agents you can use in your workspace. Your administrator controls this list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userAgentAccess.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {userAgentAccess.map((agentType) => (
                    <div
                      key={agentType}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border",
                        AGENT_COLORS[agentType] || "border-border"
                      )}
                    >
                      <div className="h-8 w-8 rounded-full bg-current/10 flex items-center justify-center shrink-0">
                        <Cpu className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {AGENT_LABELS[agentType] || safeText(agentType)}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{safeText(agentType)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">No agent access configured</p>
                  <p className="text-xs text-muted-foreground mt-1">Contact your administrator</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* How to use */}
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" /> How to Use
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                  Go to your Workspace and start a conversation with any available agent
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                  The Trishul Protocol is automatically applied to your agent sessions
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                  Your administrator can change your agent access at any time
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Security Notice */}
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground">
              Protocol access is controlled by TrishulHub administration.
              Unauthorized access attempts are logged and monitored.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
