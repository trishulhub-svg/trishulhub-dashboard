"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Key,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
  Upload,
} from "lucide-react";
import { cn, safeText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

type Step = "enter_code" | "otp_sent" | "enter_otp" | "activated" | "error";

const API_BASE = "https://trishulhub.com";

export default function ProtocolActivatePage() {
  const [step, setStep] = useState<Step>("enter_code");
  const [accessCode, setAccessCode] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [protocolData, setProtocolData] = useState<{
    protocol: string;
    version: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 1: Submit access code → request OTP
  const submitCode = async () => {
    const code = accessCode.trim().toUpperCase();
    if (!code) {
      toast.error("Please enter your access code");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/protocol/external/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStep("otp_sent");
      } else {
        setErrorMsg(safeText(data.error, "Invalid access code"));
        setStep("error");
      }
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setStep("error");
    }
    setLoading(false);
  };

  // Step 2: Submit OTP → verify and get protocol
  const submitOtp = async () => {
    const code = accessCode.trim().toUpperCase();
    if (!otp.trim() || otp.trim().length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/protocol/external/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code, otp: otp.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProtocolData({
          protocol: data.protocol,
          version: data.protocolVersion,
          title: data.protocolTitle,
        });
        setStep("activated");
      } else {
        setErrorMsg(safeText(data.error, "Verification failed"));
        setStep("error");
      }
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setStep("error");
    }
    setLoading(false);
  };

  const copyProtocol = () => {
    if (!protocolData) return;
    navigator.clipboard.writeText(protocolData.protocol);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    toast.success("Protocol copied to clipboard! Paste it into your GLM conversation.");
  };

  const resetFlow = () => {
    setStep("enter_code");
    setAccessCode("");
    setOtp("");
    setErrorMsg("");
    setProtocolData(null);
    setCopied(false);
  };

  // Handle file upload — extract TRISHUL-XXXXXX code
  const handleFileUpload = async (file: File) => {
    if (file.size > 100 * 1024) {
      toast.error("File too large (max 100KB)");
      return;
    }
    const text = await file.text();
    const match = text.match(/TRISHUL-[A-Z2-9]{6}/i);
    if (match) {
      setAccessCode(match[0].toUpperCase());
      toast.success(`Access code found: ${match[0].toUpperCase()}`);
    } else {
      toast.error("No access code found in this file. Use the document from your administrator.");
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-lg mb-4">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">TrishulHub Protocol</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activate your access to the Trishul Protocol workspace
          </p>
        </div>

        {/* ── Step: Enter Access Code ── */}
        {step === "enter_code" && (
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-5 w-5" /> Enter Access Code
              </CardTitle>
              <CardDescription>
                Enter the access code from your document, or upload the document file.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="TRISHUL-XXXXXX"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="font-mono tracking-wider text-center text-lg"
                maxLength={14}
                onKeyDown={(e) => e.key === "Enter" && submitCode()}
              />

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">or upload document</span>
                <div className="flex-1 border-t" />
              </div>

              <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Upload .txt file</span>
                <input
                  type="file"
                  accept=".txt,.text"
                  className="hidden"
                  onChange={onFileChange}
                />
              </label>

              <Button onClick={submitCode} disabled={loading || !accessCode.trim()} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                Request OTP
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step: OTP Sent ── */}
        {step === "otp_sent" && (
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
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                  Do NOT refresh this page. The OTP expires in 5 minutes.
                </p>
              </div>

              <Input
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono tracking-widest text-center text-2xl"
                maxLength={6}
                onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                autoFocus
              />

              <Button onClick={submitOtp} disabled={loading || otp.length !== 6} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Verify OTP
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step: Activated — Protocol Ready ── */}
        {step === "activated" && protocolData && (
          <Card className="border-2 border-green-500/30">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-lg text-green-700 dark:text-green-400">
                    Protocol Activated
                  </CardTitle>
                  <CardDescription>
                    {safeText(protocolData.title)} v{safeText(protocolData.version)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-2">
                  Your protocol is ready! Follow these steps:
                </p>
                <ol className="text-sm text-green-700 dark:text-green-400 space-y-1 list-decimal list-inside">
                  <li>Click &quot;Copy Protocol&quot; below</li>
                  <li>Open your GLM workspace (chat.z.ai)</li>
                  <li>Paste the protocol into a new conversation</li>
                  <li>Start working — the protocol will guide GLM</li>
                </ol>
              </div>

              <Button onClick={copyProtocol} className="w-full" size="lg">
                {copied ? (
                  <><Check className="h-4 w-4 mr-2" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" /> Copy Protocol to Clipboard</>
                )}
              </Button>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground text-center">
                  This protocol is authorized for your use only. Do not share, redistribute, or modify.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step: Error ── */}
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

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground mt-6">
          TrishulHub Protocol System &middot; Secure access management
        </p>
      </div>
    </div>
  );
}
