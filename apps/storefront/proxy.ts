import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { routing } from "./i18n/routing";
import { env } from "./app/env.mjs";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL || "",
  token: env.UPSTASH_REDIS_REST_TOKEN || "",
});

const authRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  analytics: true,
});

const checkoutRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  analytics: true,
});

const handleI18n = createMiddleware(routing);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";

  if (pathname.includes("/api/auth")) {
    const { success } = await authRatelimit.limit(`auth_${ip}`);
    if (!success) {
      return new NextResponse("Too many authentication attempts.", {
        status: 429,
      });
    }
  }

  if (pathname.includes("/checkout")) {
    const { success } = await checkoutRatelimit.limit(`checkout_${ip}`);
    if (!success) {
      return new NextResponse("Too many checkout attempts.", { status: 429 });
    }
  }
  // Cryptographic Nonce Generation
  // Generate a random 16-byte base64 token for this unique request

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const sanityProjectId = env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4vzx52ot";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://cdn.sanity.io;
    style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://cdn.sanity.io https://*.chargily.com https://*.stripe.com;
    font-src 'self' https://fonts.gstatic.com;
    frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://pay.chargily.com;
    connect-src 'self' https://${sanityProjectId}.api.sanity.io https://${sanityProjectId}.apicdn.sanity.io https://sanity.io https://api.stripe.com https://*.upstash.io https://*.chargily.com https://*.onrender.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  // Internal Request Header Injection
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  // i18n Handling
  const response = handleI18n(req);

  // Core Security Headers
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Geo-Routing Headers for Algeria
  const country =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    "DZ";
  response.headers.set("x-user-country", country);

  if (country === "DZ") {
    response.headers.set("x-default-currency", "dzd");
    response.headers.set("x-wilaya-shipping", "true");
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/auth/:path*"],
};
