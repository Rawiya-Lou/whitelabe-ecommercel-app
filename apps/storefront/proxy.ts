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
  prefix: "@upstash/ratelimit/auth",
});

const checkoutRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  analytics: true,
  prefix: "@upstash/ratelimit/checkout",
});

const handleI18n = createMiddleware(routing);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";

  if (pathname.includes("/api/auth")) {
    const { success, limit, remaining, reset } = await authRatelimit.limit(
      `auth_${ip}`,
    );
    if (!success) {
      return withSecurityHeaders(
        new NextResponse(
          JSON.stringify({
            error: "Too many authentication attempts. Please try again later.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-RateLimit-Limit": limit.toString(),
              "X-RateLimit-Remaining": remaining.toString(),
              "X-RateLimit-Reset": reset.toString(),
            },
          },
        ),
        req,
      );
    }
  }

  if (pathname.includes("/checkout") || pathname.includes("/api/checkout")) {
    const { success, limit, remaining, reset } = await checkoutRatelimit.limit(
      `checkout_${ip}`,
    );
    if (!success) {
      return withSecurityHeaders(
        new NextResponse(
          JSON.stringify({
            error:
              "Too many checkout attempts. Please wait a moment before trying again.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-RateLimit-Limit": limit.toString(),
              "X-RateLimit-Remaining": remaining.toString(),
              "X-RateLimit-Reset": reset.toString(),
            },
          },
        ),
        req,
      );
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const sanityProjectId = env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4vzx52ot";
  const isDev = process.env.NODE_ENV !== "production";

  // Clean directives (no duplicates)
  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://cdn.sanity.io`
    : `'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://cdn.sanity.io`;

  const styleSrc = isDev
    ? `'self' 'unsafe-inline' https://fonts.googleapis.com`
    : `'self' 'nonce-${nonce}' https://fonts.googleapis.com`;

  const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc};
    style-src ${styleSrc};
    img-src 'self' blob: data: https://cdn.sanity.io https://*.chargily.com https://pay.chargily.com https://*.stripe.com;
    font-src 'self' https://fonts.gstatic.com;
    frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://pay.chargily.com;
    connect-src 'self' https://${sanityProjectId}.api.sanity.io https://${sanityProjectId}.apicdn.sanity.io https://sanity.io https://api.stripe.com https://*.upstash.io https://*.chargily.com https://*.onrender.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  req.headers.set("x-nonce", nonce);

  const response = handleI18n(req);

  return withSecurityHeaders(response, req, cspHeader, nonce);
}

function withSecurityHeaders(
  response: NextResponse,
  req: NextRequest,
  cspHeader?: string,
  nonce?: string,
) {
  if (cspHeader) {
    response.headers.set("Content-Security-Policy", cspHeader);
  }
  if (nonce) {
    response.headers.set("x-nonce", nonce);
  }

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
  matcher: ["/", "/(ar|en|fr)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
