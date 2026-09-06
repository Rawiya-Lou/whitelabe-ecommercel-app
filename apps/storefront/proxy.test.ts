import { describe, expect, vi, it, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
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
  // 2. Define a standard mockable JavaScript class. 
  // This gives Vitest a real 'newable' prototype constructor while remaining strictly type-safe.
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
      return () => NextResponse.next();
    }),
  };
});

vi.mock("./i18n/routing", () => ({
  routing: {},
}));

vi.mock("./app/env.mjs", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "mock-token",
    NEXT_PUBLIC_SANITY_PROJECT_ID: "test-project-id",
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
     const { proxy } = await import("./proxy");

    
    const req = new NextRequest("https://localhost/api/cached-endpoint");
    await proxy(req);
    expect(mockConstructorSpy).toHaveBeenCalledWith(
      {
        url: "https://upstash.io",
        token: "mock-token",
      }
    );
    
   
  });
  it("should trigger HTTP 429 when Auth endpoint limits are broken", async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: 1600000000,
    });
    const req = new NextRequest("https://localhost/api/auth/login", {
      headers: { "cf-connecting-ip": "192.168.1.1" },
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
      headers: { "x-forwarded-for": "192.168.1.2" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many checkout attempts");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
  });

  it("should inject cryptographic nonces and standard security protocols", async () => {
    mockLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 0,
    });
    const req = new NextRequest("https://localhost/dashboard");
    const res = await proxy(req);

    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Strict-Transport-Security")).toContain(
      "max-age=63072000",
    );

    // Check Content-Security-Policy injection constraints
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("object-src 'none'");
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
