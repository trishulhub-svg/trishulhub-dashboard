import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", // Disabled for dev; re-enable only for Hostinger deployment
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
