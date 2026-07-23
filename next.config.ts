import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone (a trimmed server + node_modules) for the production
  // Dockerfile's runner stage. Vercel builds ignore/handle this natively — no
  // effect on the Vercel deployment path.
  output: "standalone",
};

export default nextConfig;
