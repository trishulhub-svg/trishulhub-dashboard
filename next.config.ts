import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "trishulhub.com" },
      { protocol: "https", hostname: "*.trishulhub.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "cdn.jsdelivr.net" },
      { protocol: "https", hostname: "ui-avatars.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  serverExternalPackages: ["@prisma/adapter-libsql", "@libsql/client", "@react-pdf/renderer"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "sonner", "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
  },
  turbopack: {},
};

export default nextConfig;
