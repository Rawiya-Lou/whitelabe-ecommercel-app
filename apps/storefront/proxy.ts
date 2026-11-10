import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { routing } from "./i18n/routing";
import { LOCALS } from "./i18n/constants";
import { getRecommendedLocale } from "./utils/geo";
import {env} from "./app/env.mjs";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL || "",
  token: env.UPSTASH_REDIS_REST_TOKEN || "",
});

const authRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  prefix: "rl:auth",
});

const checkoutRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  prefix: "rl:checkout",
});


const COUNTRY_TO_LOCALE_MAP: Record<string, LOCALS> = {
  DZ: LOCALS.AR,
  FR: LOCALS.FR,
  US: LOCALS.EN,
};


const handleI18n = createMiddleware(routing);


export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  // Rate limits execute over standard HTTPS (zero IP blocks)
  if (pathname.includes("/api/auth") && env.UPSTASH_REDIS_REST_URL) {
    const { success, limit, remaining, reset } = await authRatelimit.limit(ip);
    if (!success) {
      return buildRateLimitResponse(req, limit, remaining, reset, "Too many authentication attempts.");
    }
  }

  if ((pathname.includes("/checkout") || pathname.includes("/api/checkout")) && env.UPSTASH_REDIS_REST_URL) {
    const { success, limit, remaining, reset } = await checkoutRatelimit.limit(ip);
    if (!success) {
      return buildRateLimitResponse(req, limit, remaining, reset, "Too many checkout attempts.");
    }
  }

  // Edge geolocation resolution
  const detectedCountry = (
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    "DZ"
  ).toUpperCase();

  const savedCountry = req.cookies.get("_medusa_country")?.value;
  const targetCountry = (savedCountry || detectedCountry).toUpperCase();

  const hasLocalePrefix = routing.locales.some(
    (loc) => pathname.startsWith(`/${loc}/`) || pathname === `/${loc}`
  );

  if (!hasLocalePrefix) {
    const userLangCookie = req.cookies.get("NEXT_LOCALE")?.value as LOCALS | undefined;
    const geoMatchedLocale = COUNTRY_TO_LOCALE_MAP[targetCountry];
    const recommendedLocale = getRecommendedLocale(targetCountry);

    const acceptLanguage = req.headers.get("accept-language") || "";
    const parsedBrowserLocale = acceptLanguage.split(",")[0]?.split("-")[0] as LOCALS;

    const isBrowserLocaleSupported = Object.values(LOCALS).includes(parsedBrowserLocale);
    const determinedLocale = userLangCookie || recommendedLocale || geoMatchedLocale|| (isBrowserLocaleSupported ? parsedBrowserLocale : LOCALS.EN);
 

    req.nextUrl.pathname = `/${determinedLocale}${pathname === "/" ? "" : pathname}`;
    const redirectResponse = NextResponse.redirect(req.nextUrl);

    if (!savedCountry) {
      redirectResponse.cookies.set("_medusa_country", targetCountry, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }

    return applySecurityAndContextHeaders(redirectResponse, req, targetCountry);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  req.headers.set("x-nonce", nonce);

  const response = handleI18n(req);

  if (!savedCountry) {
    response.cookies.set("_medusa_country", targetCountry, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  const cspHeader = buildCspHeader(nonce);
  return applySecurityAndContextHeaders(response, req, targetCountry, cspHeader, nonce);
}


function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4vzx52ot";

  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://cdn.sanity.io`
    : `'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://cdn.sanity.io`;

  const styleSrc = isDev
    ? `'self' 'unsafe-inline' https://fonts.googleapis.com`
    : `'self' 'nonce-${nonce}' https://fonts.googleapis.com`;

  return `
    default-src 'self';
    script-src ${scriptSrc};
    style-src ${styleSrc};
    img-src 'self' blob: data: https://cdn.sanity.io https://*.chargily.com https://pay.chargily.com https://*.stripe.com;
    font-src 'self' https://fonts.gstatic.com;
    frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://pay.chargily.com;
    connect-src 'self' https://${sanityProjectId}.api.sanity.io https://${sanityProjectId}.apicdn.sanity.io https://sanity.io https://api.stripe.com https://*.chargily.com https://*.onrender.com https://*.upstash.io;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applySecurityAndContextHeaders(
  response: NextResponse,
  req: NextRequest,
  country: string,
  cspHeader?: string,
  nonce?: string
): NextResponse {
  if (cspHeader) response.headers.set("Content-Security-Policy", cspHeader);
  if (nonce) response.headers.set("x-nonce", nonce);

  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  response.headers.set("x-user-country", country);
  if (country === "DZ") {
    response.headers.set("x-default-currency", "dzd");
    response.headers.set("x-wilaya-shipping", "true");
  }

  return response;
}

function buildRateLimitResponse(
  req: NextRequest,
  limit: number,
  remaining: number,
  reset: number,
  message: string
): NextResponse {
  const res = new NextResponse(
    JSON.stringify({ error: `${message} Please wait a moment before trying again.` }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": remaining.toString(),
        "X-RateLimit-Reset": reset.toString(),
      },
    }
  );
  return applySecurityAndContextHeaders(res, req, "DZ");
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|studio|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};