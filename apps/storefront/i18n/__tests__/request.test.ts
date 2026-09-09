import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import getRequestConfig from "../request";
import { routing } from "../routing";
import type { RequestConfig } from "next-intl/server";

vi.doMock("../messages/en.json", () => ({
  Common: {
    welcome: "Welcome to our store",
    currency: "DZD",
    wilayaNotice:
      "Delivery available across all Wilayas with Cash on Delivery support",
  },
  Navigation: {
    home: "Home",
    cart: "Cart",
  },
  HomePage: {
    title: "Storefront Homepage",
    seoTitle: "Home",
    seoDescription:
      "Welcome to DTC Storefront white-label e-commerce platform.",
  },
}));

const DEFAULT_MOCK_MESSAGES = {
  Common: {
    currency: "DZD",
    welcome: "Welcome to our store",
    wilayaNotice:
      "Delivery available across all Wilayas with Cash on Delivery support",
  },
  HomePage: {
    seoDescription:
      "Welcome to DTC Storefront white-label e-commerce platform.",
    seoTitle: "Home",
    title: "Storefront Homepage",
  },
  Navigation: {
    cart: "Cart",
    home: "Home",
  },
};

// Strongly Typed framework mocks
vi.mock("next-intl/server", () => ({
  getRequestConfig: (
    callback: (params: {
      locale: string;
      requestLocale?: Promise<string | undefined>;
    }) => Promise<RequestConfig>,
  ) => callback,
  hasLocale: (locales: readonly string[], locale: string) =>
    locales.includes(locale),
}));

// Create a typing interface that matches next-intl server parameters
interface RequestConfigParams {
  locale: string;
}

vi.mock("../app/env.mjs", () => ({
  env: { NEXT_PUBLIC_SANITY_PROJECT_ID: "mockid12", NEXT_PUBLIC_SANITY_DATASET: "testdataset" }
}));

vi.mock("@/app/env.mjs", () => ({
  env: { NEXT_PUBLIC_SANITY_PROJECT_ID: "mockid12", NEXT_PUBLIC_SANITY_DATASET: "testdataset" }
}));

vi.mock("@/env.mjs", () => ({
  env: { NEXT_PUBLIC_SANITY_PROJECT_ID: "mockid12", NEXT_PUBLIC_SANITY_DATASET: "testdataset" }
}));

describe("i18n request.ts", () => {
  const originalFetch = global.fetch;
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    global.fetch = vi.fn();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
   
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    
  });

  it("should merge local JSON messages with dynamic strings from Sanity", async () => {
    const mockSanityPayload = {
      result: {
        code: JSON.stringify({
          button: { save: "Save Overwritten by Sanity" },
          sanityOnly: { text: "Dynamic CMS text" },
        }),
      },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSanityPayload,
    } as Response);

    // Cast the function execution to its real programmatic structure
    const configFn = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;
    const result = await configFn({ locale: "en" });

    const [calledUrl, calledOptions] = vi.mocked(global.fetch).mock
      .calls[0] as [string, RequestInit];

    expect(calledUrl).toContain("mockid12.apicdn.sanity.io");
    expect(calledUrl).toContain("testdataset");

    const decodedUrl = decodeURIComponent(calledUrl);
    expect(decodedUrl).toContain(
      '*[_type == "uiTranslation" && locale == "en"][0].messages',
    );
    expect(calledOptions).toEqual(
      expect.objectContaining({
        next: { tags: ["translations_en"], revalidate: 3600 },
      }),
    );
    expect(result.locale).toBe("en");
    expect(result.messages).toEqual({
      Common: {
        welcome: "Welcome to our store",
        currency: "DZD",
        wilayaNotice:
          "Delivery available across all Wilayas with Cash on Delivery support",
      },
      Navigation: {
        home: "Home",
        cart: "Cart",
      },
      HomePage: {
        title: "Storefront Homepage",
        seoTitle: "Home",
        seoDescription:
          "Welcome to DTC Storefront white-label e-commerce platform.",
      },
      button: { save: "Save Overwritten by Sanity" },
      sanityOnly: { text: "Dynamic CMS text" },
    });
  });

  it("should gracefully handle Sanity API failures and fall back to local JSON files only", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(
      new Error("Sanity network timeout"),
    );

    const configFn = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;
    const result = await configFn({ locale: "en" });

    expect(result.locale).toBe("en");
    expect(result.messages).toEqual({
      Common: {
        welcome: "Welcome to our store",
        currency: "DZD",
        wilayaNotice:
          "Delivery available across all Wilayas with Cash on Delivery support",
      },
      Navigation: {
        home: "Home",
        cart: "Cart",
      },
      HomePage: {
        title: "Storefront Homepage",
        seoTitle: "Home",
        seoDescription:
          "Welcome to DTC Storefront white-label e-commerce platform.",
      },
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("should automatically resolve back to the default locale when an invalid locale is provided", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { code: "{}" } }),
    } as Response);

    const configFn = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;
    const result = await configFn({ locale: "invalid-locale-code" });

    expect(result.locale).toBe(routing.defaultLocale);
  });

  it("should log a warning and fallback gracefully when Sanity payload is completely missing a 'code' field", async () => {
    // 1. Return a valid Sanity response shell, but omit the code payload string
    const emptyPayload = {
      result: {},
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => emptyPayload,
    } as Response);

    const executionContext = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;

    // 2. Execute using a valid local locale so the JSON import succeeds smoothly
    const result = await executionContext({ locale: "en" });

    // 3. Verify that your baseline local JSON properties are preserved intact
    expect(result.messages).toEqual(DEFAULT_MOCK_MESSAGES);

    // 4. Assert that warnSpy caught your exact file string signature
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[Sanity] No translation payload string found for locale: en",
      ),
    );
  });
});

describe("i18n request.ts - New Robust Edge Cases", () => {
  const originalFetch = global.fetch;
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    global.fetch = vi.fn();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  it("should return empty object when Sanity returns non-200 HTTP response codes", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const executionContext = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;
    const result = await executionContext({ locale: "en" });

    // Sanity should contribute nothing, but it must still include our local base definitions without crashing
    expect(result.messages).toEqual(DEFAULT_MOCK_MESSAGES);
  });

  it("should log a warning and fallback gracefully when Sanity payload is completely missing a 'code' field", async () => {
    const emptyPayload = { result: {} }; // No code property returned from query entry

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => emptyPayload,
    } as Response);

    const executionContext = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;
    const result = await executionContext({ locale: "en" });

    expect(result.messages).toEqual(DEFAULT_MOCK_MESSAGES);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[Sanity] No translation payload string found for locale: en",
      ),
    );
  });

  it("should catch JSON syntax parsing exceptions cleanly if the Sanity code block contains malformed text strings", async () => {
    const invalidJsonPayload = {
      result: {
        code: "{ malformed: json, strings lacking quotes }",
      },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => invalidJsonPayload,
    } as Response);

    const executionContext = getRequestConfig as unknown as (
      params: RequestConfigParams,
    ) => Promise<RequestConfig>;
    const result = await executionContext({ locale: "en" });
    expect(result.messages).toEqual(DEFAULT_MOCK_MESSAGES);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch Sanity translations for en:"),
      expect.any(SyntaxError),
    );
  });
});
