"use client"

import { useState, type ReactNode } from "react"
import Image from "next/image"
import {
  BookOpen,
  Download,
  QrCode,
  Smartphone,
  ScanLine,
  Info,
  ExternalLink,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.skillsoft.Percipio"
const IOS_URL =
  "https://apps.apple.com/gb/app/skillsoft-percipio/id1240149414"

const STEPS = [
  {
    num: "01",
    title: "Download the Percipio app",
    body: "Install Skillsoft Percipio on your phone from the official store for your device.",
    icon: Download,
  },
  {
    num: "02",
    title: "Select Login with QR code",
    body: "Open the app and choose the option to log in with a QR code.",
    icon: Smartphone,
  },
  {
    num: "03",
    title: "Open the QR code and scan",
    body: "Tap the button below to reveal the login QR, then scan it with your phone.",
    icon: ScanLine,
  },
] as const

function StoreButton({
  href,
  label,
  sublabel,
  icon,
}: {
  href: string
  label: string
  sublabel: string
  icon: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-border bg-foreground text-background px-4 py-3 min-w-[168px] transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="shrink-0 opacity-95">{icon}</span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          {sublabel}
        </span>
        <span className="text-sm font-semibold tracking-tight">{label}</span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
    </a>
  )
}

export default function LearningPage() {
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <div className="th-page-enter space-y-8 max-w-3xl">
      <PageHeader
        title="Learning"
        description="Access Percipio training on your phone in three steps."
        showBack={false}
      />

      {/* Intro */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 0% 0%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, color-mix(in oklch, var(--info) 12%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="th-stat-icon shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
              Percipio training login
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Download the app, choose QR login, then scan the code here to get
              into training quickly.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <ol className="space-y-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          return (
            <li
              key={step.num}
              className="rounded-2xl border border-border bg-card p-5 sm:p-6 animate-login-fade-up"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="flex gap-4 sm:gap-5">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wide">
                    {step.num}
                  </span>
                  {index < STEPS.length - 1 && (
                    <span className="hidden sm:block w-px flex-1 min-h-[12px] bg-border" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="text-base font-semibold tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-6">
                      {step.body}
                    </p>
                  </div>

                  {step.num === "01" && (
                    <div className="flex flex-wrap gap-3 pl-0 sm:pl-6">
                      <StoreButton
                        href={ANDROID_URL}
                        sublabel="Get it on"
                        label="Google Play"
                        icon={
                          <svg
                            viewBox="0 0 24 24"
                            className="h-7 w-7"
                            aria-hidden
                          >
                            <path
                              fill="currentColor"
                              d="M3.6 2.3c-.3.2-.6.6-.6 1.1v17.2c0 .5.3.9.6 1.1l9.8-9.7L3.6 2.3zm12.1 7.1L5.1 20.8l9.6-5.4 1-5.99zm.7-.4l1.9 1.1c.9.5.9 1.4 0 1.9l-1.9 1.1-1.2-1.2 1.2-1.2zm-1.5-.4L5.1 3.2l10.8 6.05z"
                            />
                          </svg>
                        }
                      />
                      <StoreButton
                        href={IOS_URL}
                        sublabel="Download on the"
                        label="App Store"
                        icon={
                          <svg
                            viewBox="0 0 24 24"
                            className="h-7 w-7"
                            aria-hidden
                          >
                            <path
                              fill="currentColor"
                              d="M16.5 3.2c.9-1.1 1.5-2.6 1.3-4.1-1.3.1-2.8.9-3.7 2-.8.9-1.6 2.4-1.4 3.8 1.5.1 2.9-.7 3.8-1.7zM20.8 17.4c-.6 1.3-.9 1.9-1.7 3-.1.2-1.1 1.6-2.4 1.6-1.1 0-1.4-.7-2.9-.7s-1.9.7-2.9.7c-1.3 0-2.2-1.5-3.1-2.9-1.8-2.7-3.2-7.6-1.3-10.9.9-1.6 2.5-2.6 4.2-2.6 1.2 0 2.3.8 2.9.8s2-.9 3.5-.8c.6 0 2.3.2 3.4 1.8-3 1.7-2.5 6.1.3 7.3z"
                            />
                          </svg>
                        }
                      />
                    </div>
                  )}

                  {step.num === "03" && (
                    <div className="pl-0 sm:pl-6">
                      <Button
                        type="button"
                        size="lg"
                        className="gap-2 shadow-sm"
                        onClick={() => setQrOpen(true)}
                      >
                        <QrCode className="h-4 w-4" />
                        Open QR code
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 space-y-2">
            <DialogTitle className="text-xl tracking-tight">
              Smart App Login
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Scan this code using your device to quickly log in to the Percipio
              app.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 flex justify-center">
            <div className="rounded-xl border border-border bg-white p-4 sm:p-5 shadow-sm animate-login-scale-in">
              <Image
                src="/learning/percipio-qr.png"
                alt="Percipio Smart App Login QR code"
                width={280}
                height={280}
                className="h-[220px] w-[220px] sm:h-[280px] sm:w-[280px] object-contain"
                priority
                unoptimized
              />
            </div>
          </div>

          <div className="px-6 pb-6 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-info" />
            <p>
              This QR code grants access to your training account. Please
              don&apos;t share it with anyone outside your team.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
