import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { LiquidGlassFilter } from "@/components/liquid-glass-filter";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#12182a" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "TrishulHub — Dashboard",
    template: "%s | TrishulHub",
  },
  description: "Project management and team collaboration platform. Manage projects, clients, finance, and automate your workflow.",
  keywords: ["TrishulHub", "Project Management", "Web Development", "SaaS", "Dashboard"],
  authors: [{ name: "TrishulHub" }],
  creator: "TrishulHub",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TrishulHub",
  },
  openGraph: {
    type: "website",
    siteName: "TrishulHub",
    title: "TrishulHub — Dashboard",
    description: "Project management and team collaboration platform",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${plusJakarta.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={["light", "dark", "bluelight", "system"]}
          disableTransitionOnChange
        >
          <LiquidGlassFilter />
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster position="top-right" richColors />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
