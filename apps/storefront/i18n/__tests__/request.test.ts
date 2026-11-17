import { describe, it, expect, vi, beforeEach } from "vitest";
import { LOCALS } from "../constants";

const mockGetUiTranslations = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sanity/query", () => ({
  getUiTranslations: mockGetUiTranslations,
}));

vi.mock("next-intl", () => ({
  hasLocale: (locales: readonly string[], locale?: string) =>
    Boolean(locale && locales.includes(locale)),
}));

vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));

import requestConfigFn, { deepMerge, type Messages } from "../request";

describe("i18n deepMerge", () => {
  it("deeply merges nested objects and ignores empty CMS strings", () => {
    const fallback: Messages = {
      common: { title: "Default Title", cart: "Cart" },
      footer: { copyright: "2026 Store" },
    };
    const cms: Messages = {
      common: { title: "Custom Client Title", cart: "" },
    };

    expect(deepMerge(fallback, cms)).toEqual({
      common: { title: "Custom Client Title", cart: "Cart" },
      footer: { copyright: "2026 Store" },
    });
  });

  it("returns target untouched when source is not a plain record", () => {
    const target: Messages = { hello: "world" };
    expect(deepMerge(target, null as unknown as Messages)).toEqual({
      hello: "world",
    });
  });
});

describe("next-intl getRequestConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves valid requestLocale and merges local JSON with Sanity CMS translations", async () => {
    mockGetUiTranslations.mockResolvedValue({
      HomePage: { heroTitle: "Livraison 69 Wilayas" },
    });

    const config = await (
      requestConfigFn as unknown as (ctx: {
        requestLocale?: Promise<string | undefined>;
      }) => Promise<{
        locale: string;
        messages: Messages;
        onError: (err: { code: string }) => void;
        getMessageFallback: (args: { namespace?: string; key: string }) => string;
      }>
    )({
      requestLocale: Promise.resolve("fr"),
    });

    expect(config.locale).toBe(LOCALS.FR);
    expect(mockGetUiTranslations).toHaveBeenCalledWith(LOCALS.FR);
    expect((config.messages.HomePage as Messages).heroTitle).toBe(
      "Livraison 69 Wilayas"
    );
  });

  it("falls back to defaultLocale ('en') when requestLocale is unsupported or missing", async () => {
    mockGetUiTranslations.mockResolvedValue({});

    const config = await (
      requestConfigFn as unknown as (ctx: {
        requestLocale?: Promise<string | undefined>;
      }) => Promise<{ locale: string }>
    )({
      requestLocale: Promise.resolve("de"),
    });

    expect(config.locale).toBe(LOCALS.EN);
    expect(mockGetUiTranslations).toHaveBeenCalledWith(LOCALS.EN);
  });

  it("continues gracefully with local fallback messages when Sanity CMS fetch fails", async () => {
    mockGetUiTranslations.mockRejectedValue(new Error("Sanity CDN timeout"));

    const config = await (
      requestConfigFn as unknown as (ctx: { locale?: string }) => Promise<{
        locale: string;
        messages: Messages;
        onError: (err: { code: string }) => void;
        getMessageFallback: (args: { namespace?: string; key: string }) => string;
      }>
    )({
      locale: LOCALS.AR,
    });

    expect(config.locale).toBe(LOCALS.AR);
    expect(config.messages).toBeTypeOf("object");
    expect(
      config.getMessageFallback({ namespace: "Checkout", key: "payNow" })
    ).toBe("Checkout.payNow");
    expect(config.getMessageFallback({ key: "submit" })).toBe("submit");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    config.onError({ code: "MISSING_MESSAGE" });
    expect(consoleSpy).not.toHaveBeenCalled();

    config.onError({ code: "FORMATTING_ERROR" });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});