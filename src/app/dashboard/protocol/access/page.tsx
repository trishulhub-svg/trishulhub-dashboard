"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ShieldCheck,
  Key,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Cpu,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  UserCheck,
} from "lucide-react";
import { cn, safeText, safeNumber, safeArray, safeJsonParse } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// ── Types ──
interface StageDesc {
  stage: number;
  title: string;
  description: string;
  deliverables: string;
}

interface AgentSkill {
  agentType: string;
  name: string;
  skills: string[];
}

interface ProtocolData {
  version: string;
  title: string;
  content: string;
  stageDescriptions: StageDesc[];
  agentSkills: AgentSkill[];
}

type Step = "check" | "invite_code" | "otp_sent" | "otp_verify" | "verified" | "error";

const AGENT_COLORS: Record<string, string> = {
  DEV: "text-blue-500 border-blue-500/30 bg-blue-500/5",
  CLIENT_HUNTER: "text-green-500 border-green-500/30 bg-green-500/5",
  FINANCE: "text-yellow-500 border-yellow-500/30 bg-yellow-500/5",
  PROJECT_MANAGER: "text-purple-500 border-purple-500/30 bg-purple-500/5",
  HR: "text-pink-500 border-pink-500/30 bg-pink-500/5",
  CONTENT: "text-orange-500 border-orange-500/30 bg-orange-500/5",
  SUPPORT: "text-teal-500 border-teal-500/30 bg-teal-500/5",
};

export default function ProtocolAccessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

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
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // On mount, check if user already has active protocol access
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/protocol/verify");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.hasAccess && data.protocol) {
            setProtocol(data.protocol as ProtocolData);
            setStep("verified");
            return;
          }
        }
      } catch {
        // Non-critical — just show the token entry form
      }
      if (!cancelled) {
        setStep("invite_code");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [status]);

  // Step 1: Submit access token
  const submitAccessToken = async () => {
    if (!inviteCode.trim()) {
      toast.error("Please enter your access token");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/protocol/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
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
        setProtocol(data.protocol as ProtocolData);
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

  // Reset flow
  const resetFlow = () => {
    setStep("invite_code");
    setInviteCode("");
    setOtp("");
    setProtocol(null);
    setErrorMsg("");
    setExpandedStage(null);
    setExpandedAgent(null);
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
    <div className="max-w-3xl mx-auto space-y-6">
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
            ? "Trishul Protocol — Secure Access Granted"
            : "Verify your access token to view the Trishul Protocol"}
        </p>
      </div>

      {/* Step Indicators (hidden when verified) */}
      {step !== "verified" && step !== "check" && (
        <div className="flex items-center justify-center gap-2">
          {[
            { label: "Token", key: "invite_code" },
            { label: "OTP", key: "otp_sent" },
            { label: "Access", key: "verified" },
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

      {/* ── STEP: Invite Code ── */}
      {step === "invite_code" && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-5 w-5" /> Enter Your Protocol Access Token
            </CardTitle>
            <CardDescription>
              Enter the token provided by your TrishulHub administrator
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="TRISHUL-XXXXXX"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="font-mono tracking-wider text-center text-lg"
                maxLength={14}
                onKeyDown={(e) => e.key === "Enter" && submitAccessToken()}
              />
              <Button onClick={submitAccessToken} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              The token format is TRISHUL- followed by 6 characters
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── STEP: OTP Sent to Administrator ── */}
      {(step === "otp_sent" || step === "otp_verify") && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> OTP Sent to Administrator
            </CardTitle>
            <CardDescription>
              A 6-digit OTP has been sent to your administrator&apos;s email.
              Please contact them to get the OTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning banner */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Do NOT refresh this page
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  The OTP expires in 5 minutes. Contact your administrator to get the OTP, then enter it below.
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
              Enter the 6-digit OTP your administrator shared with you verbally
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── STEP: Error ── */}
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

      {/* ── STEP: Verified — Protocol Content ── */}
      {step === "verified" && protocol && (
        <div className="space-y-6">
          {/* Protocol Header */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{safeText(protocol.title)}</CardTitle>
                  <CardDescription className="mt-1">
                    Version {safeText(protocol.version)} &middot; Secure Access Granted
                  </CardDescription>
                </div>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verified
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Linked account notice */}
          <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <UserCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Protocol access linked to your account. Your administrator controls which agents you can access.
            </p>
          </div>

          {/* Protocol Content */}
          {protocol.content && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Protocol Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {protocol.content.split("\n").map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <br key={i} />;
                    if (trimmed.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-6 mb-3">{trimmed.slice(2)}</h1>;
                    if (trimmed.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold mt-5 mb-2">{trimmed.slice(3)}</h2>;
                    if (trimmed.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-4 mb-2">{trimmed.slice(4)}</h3>;
                    if (trimmed.startsWith("- ")) return <li key={i} className="ml-4 list-disc">{trimmed.slice(2)}</li>;
                    return <p key={i} className="my-1">{trimmed}</p>;
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stage Descriptions */}
          {protocol.stageDescriptions && protocol.stageDescriptions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Development Stages</CardTitle>
                <CardDescription>The 7-stage development lifecycle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {protocol.stageDescriptions.map((stage, idx) => (
                  <div key={idx} className="border rounded-lg overflow-hidden transition-colors hover:border-primary/30">
                    <button
                      type="button"
                      className="flex items-center justify-between w-full p-4 hover:bg-accent/30 transition-colors text-left"
                      onClick={() => setExpandedStage(expandedStage === idx ? null : idx)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {safeNumber(stage.stage)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{safeText(stage.title)}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{safeText(stage.description)}</p>
                        </div>
                      </div>
                      {expandedStage === idx ? <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                    </button>
                    {expandedStage === idx && (
                      <div className="px-4 pb-4 pt-0 border-t">
                        <p className="text-sm mt-3 leading-relaxed">{safeText(stage.description)}</p>
                        {stage.deliverables && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Deliverables</p>
                            <div className="flex flex-wrap gap-1.5">
                              {stage.deliverables.split(",").map((d, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{safeText(d.trim())}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Agent Skills */}
          {protocol.agentSkills && protocol.agentSkills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-5 w-5" /> Your Agent Capabilities
                </CardTitle>
                <CardDescription>
                  AI agents you have access to based on your permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {protocol.agentSkills.map((agent) => (
                  <div
                    key={safeText(agent.agentType)}
                    className={cn("border rounded-lg overflow-hidden", AGENT_COLORS[agent.agentType] || "border-border")}
                  >
                    <button
                      type="button"
                      className="flex items-center justify-between w-full p-4 hover:bg-accent/30 transition-colors text-left"
                      onClick={() => setExpandedAgent(expandedAgent === agent.agentType ? null : agent.agentType)}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">{safeText(agent.agentType)}</Badge>
                        <div>
                          <p className="font-semibold text-sm">{safeText(agent.name)}</p>
                          <p className="text-xs text-muted-foreground">{safeNumber(agent.skills.length)} capabilities</p>
                        </div>
                      </div>
                      {expandedAgent === agent.agentType ? <ChevronUp className="h-5 w-5 shrink-0" /> : <ChevronDown className="h-5 w-5 shrink-0" />}
                    </button>
                    {expandedAgent === agent.agentType && (
                      <div className="px-4 pb-4 pt-0 border-t">
                        <ul className="space-y-1.5 mt-3">
                          {agent.skills.map((skill, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-current mt-1.5 shrink-0" />
                              {safeText(skill)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Security Notice */}
          <Card className="bg-muted/30">
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground text-center">
                This protocol document is controlled and distributed by TrishulHub administration.
                Unauthorized distribution, modification, or sharing of this document is strictly prohibited.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
