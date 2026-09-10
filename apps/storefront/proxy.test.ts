import { describe, expect, vi, it, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {LOCALS} from './i18n/constants';
import { proxy } from "./proxy";
import { Redis } from "@upstash/redis"; 

const { mockLimit, mockGet, mockSet, mockConstructorSpy} = vi.hoisted(() => {
  return {
    mockLimit: vi.fn(),

    mockGet: vi.fn().mockResolvedValue('cached-value'),
    mockSet: vi.fn().mockResolvedValue('OK'),
    mockConstructorSpy: vi.fn<(config: UpstashConfig) => void>(), 
  }
})

vi.mock("@upstash/ratelimit", () => {
  return {
    Ratelimit: class MockedRatelimit {
      static slidingWindow = vi.fn().mockReturnValue({});
      static fixedWindow = vi.fn().mockReturnValue({});
      static tokenBucket = vi.fn().mockReturnValue({});
      
      // Assigned via lookup context cleanly at instantiation time
      limit = mockLimit;
    },
  };
});
type UpstashConfig = ConstructorParameters<typeof Redis>[0];



vi.mock("@upstash/redis", () => {
  class MockedRedis {
    constructor(config: UpstashConfig) {
      mockConstructorSpy(config);
    }
    get = mockGet;
    set = mockSet;
  }

  return {
    Redis: MockedRedis,
  };
});

vi.mock("next-intl/middleware", () => {
  return {
    default: vi.fn().mockImplementation(() => {
      // Returns a fallback clean NextResponse to represent downstream middleware handlers
      return () => {
        const response = NextResponse.next();
        response.headers.set("x-mocked-next-intl", "true");
        return response;
      };
    }),
  };
});

vi.mock("./i18n/routing", () => ({
  routing: {
    locales: ['en', 'fr', 'ar'],
    defaultLocale: "en"

  },
}));

vi.mock("./app/env.mjs", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "mock-token",
    NEXT_PUBLIC_SANITY_PROJECT_ID: "mockid12",
  },
}));

describe("Proxy file E2E Unit Suit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

   it("should initialize Redis with correct mocked environment variables", async () => {
    mockLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 0,
    });
     const { proxy: dynamicProxy } = await import("./proxy");

     const req = new NextRequest("https://localhost/en/shop");
    await dynamicProxy(req);

    expect(mockConstructorSpy).toHaveBeenCalledWith(
      {
        url: "https://upstash.io",
        token: "mock-token",
      }

    )
    
    
   
  });

  it("should trigger HTTP 429 when Auth endpoint limits are broken", async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: 1600000000,
    });
    const req = new NextRequest("https://localhost/api/auth/login", {
      headers: { "cf-connecting-ip": "127.0.0.1" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many authentication attempts");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");

  });

  it("should trigger HTTP 429 when checkout endpoint limits are broken", async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 3,
      remaining: 0,
      reset: 1600000000,
    });
    const req = new NextRequest("https://localhost/api/checkout", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(429);
    expect(mockLimit).toHaveBeenCalledWith("checkout_127.0.0.1")
    const body = await res.json();
    expect(body.error).toContain("Too many checkout attempts");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
  });

  it("should issue a 307 redirect to /ar when an Algerian IP hits a root path", async () => {
    mockLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });

    const req = new NextRequest("https://localhost/shop", {
      headers: { "cf-ipcountry": "DZ" },
    });
    const res = await proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://localhost/ar/shop");
    expect(res.headers.get("x-user-country")).toBe("DZ");
    expect(res.headers.get("x-default-currency")).toBe("dzd");
    expect(res.headers.get("x-wilaya-shipping")).toBe("true");
  });

  it("should respect manual user selection via NEXT_LOCALE cookie over Geo-IP rules", async () => {
    mockLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });

    const req = new NextRequest("https://localhost/shop", {
      headers: { "cf-ipcountry": "DZ" }, // IP says Algeria (ar)
    });
    req.cookies.set("NEXT_LOCALE", LOCALS.FR); 

    const res = await proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://localhost/fr/shop");
  });

   it("should fall back to default language prefix when non-mapped country passes through gateway", async () => {
    mockLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });

    const req = new NextRequest("https://localhost/shop", {
      headers: { "cf-ipcountry": "US" },
    });
    const res = await proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://localhost/en/shop");
    expect(res.headers.get("x-user-country")).toBe("US");
    expect(res.headers.get("x-default-currency")).toBeNull();
  });

   it("should let next-intl take over cleanly when valid prefix path is provided", async () => {
    mockLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });

    const req = new NextRequest("https://localhost/ar/shop");
    const res = await proxy(req);

    expect(res.headers.get("x-mocked-next-intl")).toBe("true");
  });

  it("should inject standard secure header policies across routing frames", async () => {
    mockLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });

    const req = new NextRequest("https://localhost/en/shop");
    const res = await proxy(req);

    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });




  it("should return 307 when the url does not have a valid language path prefix", async () => {
    mockLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 0,
    });
    const req = new NextRequest("https://localhost/dashboard");
    const res = await proxy(req);

    expect(res.status).toBe(307);
 
  });

  it("should enforce Algerian DZD currency constraints and localized shipping configs when custom header evaluates to DZ", async () => {
    mockLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 0,
    });

    const req = new NextRequest("https://localhost/shop", {
      headers: { "cf-ipcountry": "DZ" },
    });
    const res = await proxy(req);

    expect(res.headers.get("x-user-country")).toBe("DZ");
    expect(res.headers.get("x-default-currency")).toBe("dzd");
    expect(res.headers.get("x-wilaya-shipping")).toBe("true");
  });

  it("should assign alternative default country metadata fallback contexts when headers evaluate non-DZ destinations", async () => {
    mockLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 0,
    });

    const req = new NextRequest("https://localhost/shop", {
      headers: { "cf-ipcountry": "FR" },
    });

    const res = await proxy(req);

    expect(res.headers.get("x-user-country")).toBe("FR");
    expect(res.headers.get("x-default-currency")).toBeNull();
    expect(res.headers.get("x-wilaya-shipping")).toBeNull();
  });
});
