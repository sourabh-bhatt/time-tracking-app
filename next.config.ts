import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Next tracing/build resolution inside the Electron app folder.
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
