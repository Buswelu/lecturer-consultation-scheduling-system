import type { NextConfig } from "next";

const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  async headers() {
    // Baseline hardening headers (no behavior change to the app).
    // HSTS is production-build only: it would break plain-HTTP local dev.
    // A strict Content-Security-Policy is intentionally NOT enforced here:
    // Next.js flight payloads rely on inline scripts, so a naive CSP breaks
    // the app — see docs/DEPLOYMENT.md for the vetted opt-in policy.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isProductionBuild
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
