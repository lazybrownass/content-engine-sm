import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// script-src/style-src need 'unsafe-inline' because Next.js's production hydration
// bootstrap injects inline <script> tags without a nonce, and Tailwind/Base UI apply
// some styles via inline style attributes — a nonce-based CSP would need additional
// middleware wiring beyond this task's scope. Even without blocking inline execution,
// this CSP still blocks the primary real-world threat for this app: loading a script
// or connecting to any origin other than this app and Supabase (no user content is
// ever rendered as raw HTML — confirmed no `dangerouslySetInnerHTML` anywhere).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Emits .next/standalone (a trimmed server + node_modules) for the production
  // Dockerfile's runner stage. Vercel builds ignore/handle this natively — no
  // effect on the Vercel deployment path.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // CSP only applied to production builds — `next dev`'s HMR/dev-overlay
          // inline scripts and websocket connections aren't accounted for above,
          // and this shouldn't affect the local dev workflow.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy", value: csp }]
            : []),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
