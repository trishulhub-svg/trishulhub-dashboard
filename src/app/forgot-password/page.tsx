"use client"

import { useEffect, useState, Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import LoadingScreen from "@/components/ui/loading-screen"
import { TurnstileCaptcha } from "@/components/auth/turnstile-captcha"

function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [siteKey, setSiteKey] = useState<string | null>(null)
  const [captchaRequired, setCaptchaRequired] = useState(false)

  useEffect(() => {
    fetch("/api/auth/challenge")
      .then((r) => r.json())
      .then((data) => {
        if (data.siteKey) setSiteKey(data.siteKey)
        if (data.captchaRequired) setCaptchaRequired(true)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      })
      const data = await res.json()
      if (data.captchaRequired) {
        setCaptchaRequired(true)
      }
      setDone(true)
      toast.success(
        data.message ||
          "If an account exists for that email, you will receive reset instructions shortly."
      )
    } catch {
      // Same message even on network blip — avoid oracle
      setDone(true)
      toast.success(
        "If an account exists for that email, you will receive reset instructions shortly."
      )
    } finally {
      setLoading(false)
      setCaptchaToken(null)
    }
  }

  return (
    <div className="login-page-wrapper">
      <div className="login-bg-mesh" aria-hidden="true">
        <div className="login-bg-orb login-bg-orb-1" />
        <div className="login-bg-orb login-bg-orb-2" />
        <div className="login-bg-orb login-bg-orb-3" />
      </div>
      <div className="login-grid-pattern" aria-hidden="true" />
      <div className="login-bottom-fade" aria-hidden="true" />

      <div className="login-content">
        <div className="login-card-area">
          <div className="login-brand animate-login-fade-up">
            <div className="login-logo-wrap">
              <div className="login-logo-glow" />
              <Image
                src="/200px.png"
                alt="TrishulHub"
                fill
                className="login-logo-img"
                priority
                sizes="140px"
              />
            </div>
            <div className="login-brand-text">
              <h1 className="login-title">TrishulHub</h1>
              <p className="login-subtitle">Technology</p>
            </div>
          </div>

          <Card className="login-main-card animate-login-scale-in">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="login-card-heading">Forgot password</CardTitle>
              <CardDescription className="login-card-desc">
                Enter your email. We will send reset instructions if an account exists.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {done ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    If an account exists for that email, you will receive reset instructions
                    shortly. Check your inbox and spam folder.
                  </p>
                  <Button asChild className="w-full">
                    <Link href="/login">Back to sign in</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="login-input h-10 text-sm"
                    />
                  </div>
                  {(captchaRequired || siteKey) && siteKey && (
                    <TurnstileCaptcha siteKey={siteKey} onToken={setCaptchaToken} />
                  )}
                  <Button
                    type="submit"
                    className="login-submit-btn w-full h-10 text-sm font-semibold"
                    disabled={loading || Boolean(captchaRequired && siteKey && !captchaToken)}
                  >
                    {loading ? "Sending..." : "Send reset link"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    <Link href="/login" className="underline underline-offset-2">
                      Back to sign in
                    </Link>
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
