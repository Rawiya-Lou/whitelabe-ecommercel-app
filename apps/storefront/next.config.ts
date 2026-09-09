import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { env } from "./app/env.mjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const SANITY_PROJECT_ID = env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4vzx52ot";

const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Explicitly type protocol as 'https' literal to satisfy NextConfig RemotePattern type
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: `/images/${SANITY_PROJECT_ID}/**`,
      },
      {
        protocol: "https",
        hostname: "stripe.com",
      },
      {
        protocol: "https",
        hostname: "js.stripe.com",
      },
      {
        protocol: "https",
        hostname: "chargily.com",
      },
      {
        protocol: "https",
        hostname: "pay.chargily.com",
      },
    ],
  },

  transpilePackages: ["@dtc/backend"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...(!isDevelopment
            ? [{ key: "X-Content-Type-Options", value: "nosniff" }]
            : []),
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
