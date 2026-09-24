import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and data files; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // On Vercel getDb() only uses Postgres, so PGlite's 21 MB (and the link Turbopack
  // makes to it) stays out of every function there: smaller functions start faster.
  ...(process.env.VERCEL
    ? { outputFileTracingExcludes: { "/*": ["node_modules/@electric-sql/pglite/**", ".next/node_modules/@electric-sql/pglite-*"] } }
    : {}),
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Monthly progress photos are resized in the browser first (~300 KB each).
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
