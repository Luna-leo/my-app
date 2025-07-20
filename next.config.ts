import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Suppress specific warnings if needed
  typescript: {
    // Allow production builds to succeed even if there are type errors
    ignoreBuildErrors: false,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
