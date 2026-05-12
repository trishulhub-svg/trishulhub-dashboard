"use client";

import { useSession } from "next-auth/react";
import { Rocket, Shield, Cpu, ArrowRight, Sparkles } from "lucide-react";

export default function TrishulWorkspacePage() {
  const { data: session } = useSession();
  const userName = session?.user?.name || "User";
  const userRole = session?.user?.role?.replace("_", " ") || "Developer";

  const features = [
    {
      icon: Cpu,
      title: "7 AI Agents",
      description:
        "Development, Sales, Finance, HR, Content, Support, and Project Management agents ready to collaborate.",
      gradient: "from-cyan-500/20 to-blue-500/20",
      iconColor: "text-cyan-400",
      borderColor: "border-cyan-500/20",
    },
    {
      icon: Shield,
      title: "OTP Authentication",
      description:
        "Secure email-based login via Trishulhub with 6-digit OTP and 5-minute expiry.",
      gradient: "from-emerald-500/20 to-teal-500/20",
      iconColor: "text-emerald-400",
      borderColor: "border-emerald-500/20",
    },
    {
      icon: Rocket,
      title: "Live Protocol",
      description:
        "Trishul Protocol v4.0 for structured development with 7-stage pipeline.",
      gradient: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-400",
      borderColor: "border-purple-500/20",
    },
  ];

  const handleLaunch = () => {
    window.open("https://chat.z.ai", "_blank");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a0e27]">
      {/* ── Animated Background ── */}
      <div className="absolute inset-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e27] via-[#1a1040] to-[#0d1b3e]" />

        {/* Floating orbs */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
          style={{
            background: "radial-gradient(circle, #6366f1 0%, transparent 70%)",
            top: "-10%",
            left: "-10%",
            animation: "floatOrb1 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-20 blur-[100px]"
          style={{
            background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
            bottom: "-5%",
            right: "-5%",
            animation: "floatOrb2 15s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[300px] h-[300px] rounded-full opacity-25 blur-[90px]"
          style={{
            background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
            top: "50%",
            left: "60%",
            animation: "floatOrb3 10s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[200px] h-[200px] rounded-full opacity-15 blur-[80px]"
          style={{
            background: "radial-gradient(circle, #ec4899 0%, transparent 70%)",
            top: "20%",
            right: "30%",
            animation: "floatOrb4 18s ease-in-out infinite",
          }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 py-16 md:py-24">
        {/* Logo Badge */}
        <div
          className="flex justify-center mb-8"
          style={{ animation: "fadeIn 0.8s ease-out" }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-white/70 uppercase tracking-widest">
              Trishul Protocol v4.0
            </span>
          </div>
        </div>

        {/* Title */}
        <div
          className="text-center mb-4"
          style={{ animation: "fadeIn 1s ease-out" }}
        >
          <h1
            className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-white"
            style={{
              textShadow:
                "0 0 40px rgba(99, 102, 241, 0.3), 0 0 80px rgba(99, 102, 241, 0.15)",
            }}
          >
            TRISHUL
          </h1>
          <h1
            className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
          >
            WORKSPACE
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="text-center text-lg md:text-xl text-white/50 font-light mb-16 max-w-lg mx-auto"
          style={{ animation: "fadeIn 1.2s ease-out" }}
        >
          AI-Powered Development Environment
        </p>

        {/* Feature Cards */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16"
          style={{ animation: "fadeIn 1.4s ease-out" }}
        >
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`relative group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06]`}
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div
                className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
              />
              <div className="relative z-10">
                <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                  <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Launch Button */}
        <div
          className="flex justify-center mb-16"
          style={{ animation: "fadeIn 1.6s ease-out" }}
        >
          <button
            onClick={handleLaunch}
            className="group relative inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-lg font-bold text-white transition-all duration-300 hover:scale-105 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-[#0a0e27]"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #8b5cf6, #ec4899)",
              backgroundSize: "200% 200%",
              animation: "pulseGlow 3s ease-in-out infinite, gradientShift 4s ease-in-out infinite",
              boxShadow:
                "0 0 30px rgba(6, 182, 212, 0.3), 0 0 60px rgba(139, 92, 246, 0.2)",
            }}
          >
            <Rocket className="h-6 w-6 transition-transform group-hover:translate-x-0.5" />
            <span>LAUNCH WORKSPACE</span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* User Greeting */}
        <div
          className="text-center"
          style={{ animation: "fadeIn 1.8s ease-out" }}
        >
          <p className="text-white/30 text-sm">
            Welcome back,{" "}
            <span className="text-white/60 font-semibold">{userName}</span>
          </p>
          <span className="inline-block mt-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/40 uppercase tracking-wider">
            {userRole}
          </span>
        </div>
      </div>

      {/* ── Inline Styles for Animations ── */}
      <style jsx global>{`
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, 40px) scale(1.1); }
          66% { transform: translate(-30px, 60px) scale(0.95); }
        }

        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-50px, -30px) scale(1.05); }
          66% { transform: translate(40px, -50px) scale(0.9); }
        }

        @keyframes floatOrb3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-80px, 40px) scale(1.15); }
        }

        @keyframes floatOrb4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -40px) scale(1.1); }
          50% { transform: translate(-60px, -20px) scale(0.95); }
          75% { transform: translate(20px, 50px) scale(1.05); }
        }

        @keyframes pulseGlow {
          0%, 100% {
            box-shadow:
              0 0 30px rgba(6, 182, 212, 0.3),
              0 0 60px rgba(139, 92, 246, 0.2),
              0 0 0px rgba(236, 72, 153, 0);
          }
          50% {
            box-shadow:
              0 0 40px rgba(6, 182, 212, 0.5),
              0 0 80px rgba(139, 92, 246, 0.3),
              0 0 120px rgba(236, 72, 153, 0.15);
          }
        }

        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
