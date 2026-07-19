"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { Shield, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import LoadingScreen from "@/components/ui/loading-screen"
import { TurnstileCaptcha } from "@/components/auth/turnstile-captcha"

function readAndClearToken(): string | null {
  if (typeof window === "undefined") return null
  // Prefer fragment (#t=) — never sent to servers on navigation
  const hash = window.location.hash.replace(/^#/, "")
  const hashParams = new URLSearchParams(hash)
  let t = hashParams.get("t") || hashParams.get("token")

  // Legacy query support: migrate into memory and strip from URL immediately
  if (!t) {
    const q = new URLSearchParams(window.location.search)
    t = q.get("token") || q.get("t")
  }

  if (t) {
    window.history.replaceState(null, "", window.location.pathname)
  }
  return t
}

function ResetPasswordForm() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [siteKey, setSiteKey] = useState<string | null>(null)
  const [captchaRequired, setCaptchaRequired] = useState(false)

  useEffect(() => {
    const t = readAndClearToken()
    setToken(t)
    setReady(true)
    fetch("/api/auth/challenge")
      .then((r) => r.json())
      .then((data) => {
        if (data.siteKey) setSiteKey(data.siteKey)
        if (data.captchaRequired) setCaptchaRequired(true)
      })
      .catch(() => {})
  }, [])

  const handleReset = async () => {
    if (!token) {
      setError("This reset link is invalid or has expired. Please request a new one.")
      return
    }
    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields")
      return
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setResetting(true)
    setError("")
    try {
      const res = await fetch("/api/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, captchaToken }),
      })
      const data = await res.json()
      if (data.captchaRequired) {
        setCaptchaRequired(true)
      }
      if (res.ok && data.success) {
        setSuccess(true)
        setToken(null)
      } else {
        setError(data.error || "This reset link is invalid or has expired. Please request a new one.")
      }
    } catch {
      setError("This reset link is invalid or has expired. Please request a new one.")
    } finally {
      setResetting(false)
      setCaptchaToken(null)
    }
  }

  if (!ready) {
    return <LoadingScreen message="Loading..." />
  }

  if (success) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
        <Card className="relative w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-14 w-14 text-green-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Password Reset Successful!</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              Your password has been reset. You can now log in with your new password.
            </p>
            <Button onClick={() => router.push("/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
        <Card className="relative w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-14 w-14 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Reset Link</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <Button variant="outline" onClick={() => router.push("/forgot-password")}>
              Request a new link
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
      <Card className="relative w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="relative h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="relative h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Reset Your Password</CardTitle>
          <CardDescription>Choose a strong new password for your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleReset()
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">New Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setError("")
                  }}
                  placeholder="Min. 8 chars, mixed case + number/symbol"
                  className="pr-10"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1 mt-3">
              <Label className="text-xs">Confirm New Password *</Label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setError("")
                  }}
                  placeholder="Confirm your new password"
                  className="pr-10"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {(captchaRequired || siteKey) && siteKey && (
              <div className="mt-3">
                <TurnstileCaptcha siteKey={siteKey} onToken={setCaptchaToken} />
              </div>
            )}
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
            <Button
              type="submit"
              className="w-full mt-4"
              disabled={resetting || Boolean(captchaRequired && siteKey && !captchaToken)}
            >
              {resetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
