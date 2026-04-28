import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel handles serverless deployment automatically
  // No need for standalone output on Vercel
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Allow Prisma to work in Vercel serverless functions
  serverExternalPackages: ["@prisma/adapter-libsql", "@libsql/client"],
};

export default nextConfig;
