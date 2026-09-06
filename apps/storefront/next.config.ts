import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { env } from './app/env.mjs'

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        
        pathname: `/images/${env.NEXT_PUBLIC_SANITY_PROJECT_ID || '4vzx52ot'}/**`,
      },
      {
        protocol: 'https',
        hostname: '*.stripe.com',
      },
      {
        protocol: 'https',
        hostname: '*.chargily.com',
      },
    ],
  },
};

// 2. Export the wrapped configuration object
export default withNextIntl(nextConfig);
