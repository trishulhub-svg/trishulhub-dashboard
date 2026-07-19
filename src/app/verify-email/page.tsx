"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import LoadingScreen from "@/components/ui/loading-screen"

function readTokenFromHash(): string | null {
  if (typeof window === "undefined") return null
  const hash = window.location.hash.replace(/^#/, "")
  const params = new URLSearchParams(hash)
  const t = params.get("t") || params.get("token")
  // Clear fragment so token is not kept in history / referrer
  if (t) {
    const clean = window.location.pathname + window.location.search
    window.history.replaceState(null, "", clean)
  }
  return t
}

function VerifyEmailForm() {
  const router = useRouter()
  const [status, setStatus] = useState<"working" | "ok" | "bad">("working")
  const [message, setMessage] = useState("Verifying your email...")

  useEffect(() => {
    const token = readTokenFromHash()
    if (!token) {
      setStatus("bad")
      setMessage("This verification link is invalid or has expired.")
      return
    }

    ;(async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          setStatus("ok")
          setMessage(data.message || "Email verified. You can now sign in.")
        } else {
          setStatus("bad")
          setMessage(data.error || "This verification link is invalid or has expired.")
        }
      } catch {
        setStatus("bad")
        setMessage("This verification link is invalid or has expired.")
      }
    })()
  }, [])

  if (status === "working") {
    return <LoadingScreen message={message} />
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
      <Card className="relative w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          {status === "ok" ? (
            <CheckCircle2 className="h-14 w-14 text-green-600 mb-4" />
          ) : (
            <XCircle className="h-14 w-14 text-red-500 mb-4" />
          )}
          <h2 className="text-xl font-semibold mb-2">
            {status === "ok" ? "Email verified" : "Verification failed"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">{message}</p>
          <Button onClick={() => router.push("/login")}>Go to Login</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <VerifyEmailForm />
    </Suspense>
  )
}
