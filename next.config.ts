import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // 在生产构建时禁用ESLint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
