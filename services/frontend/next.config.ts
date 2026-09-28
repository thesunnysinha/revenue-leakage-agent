import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js 16 requires an explicit Turbopack config when a dev-only webpack hook exists.
  turbopack: {},
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
