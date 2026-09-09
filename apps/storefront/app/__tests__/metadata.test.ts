import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { generateMetadata } from "../[locale]/metadata";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation(({ locale, namespace }) => {
    // If namespace isn't "Metadata", simulate a failure to trigger the code's fallback logic
    if (namespace !== "Metadata") {
      throw new Error(`Namespace ${namespace} not found`);
    }

    // Return a mocked translator function matching your storefront configuration
    return (key: string) => {
      const translations: Record<string, string> = {
        siteName: `DTC Storefront (${locale})`,
        defaultTitle: `Home Title (${locale})`,
        defaultDescription: `SEO Description (${locale})`,
      };
      return translations[key] || "";
    };
  }),
}));

vi.mock("@/i18n/routing", () => ({
  routing: {
    locales: ["en", "ar", "fr"],
    defaultLocale: "en",
  },
}));

describe("Layout SEO Metadata Builder Suite", () => {
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_STOREFRONT_URL = "https://my-production-shop.com";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully build SEO configurations using translation namespaces", async () => {
    // Layout parameters match the Next.js Promise requirement
    const mockParams = Promise.resolve({ locale: "en" });

    const metadata = await generateMetadata({ params: mockParams });

    // Validate absolute base parameters and alternates logic rules
    expect(metadata.metadataBase?.toString()).toBe(
      "https://my-production-shop.com/",
    );
    expect(metadata.alternates?.canonical).toBe("/en");
    expect(metadata.alternates?.languages).toEqual({
      en: "/en",
      ar: "/ar",
      fr: "/fr",
    });

    // Validate templates parameters mapping logic structures
    expect(metadata.title).toEqual({
      template: "%s | DTC Storefront (en)",
      default: "Home Title (en)",
    });

    expect(metadata.description).toBe("SEO Description (en)");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });

  it("should output Algerian OpenGraph parameters when the locale is set to 'ar'", async () => {
    const mockParams = Promise.resolve({ locale: "ar" });

    const metadata = await generateMetadata({ params: mockParams });

    expect(metadata.alternates?.canonical).toBe("/ar");
    expect(metadata.openGraph?.locale).toBe("ar_DZ"); // Verifies your custom DZ localization
    expect(metadata.title).toStrictEqual({
      default: "Home Title (ar)",
      template: "%s | DTC Storefront (ar)",
    });
  });

  it("should log warnings and revert back to fallback hardcoded dictionary objects if the namespace check crashes", async () => {
    const nextIntl = await import("next-intl/server");

    // Force the internal next-intl mock translator function layer to fail
    vi.mocked(nextIntl.getTranslations).mockRejectedValueOnce(
      new Error("Translations database missing error connection reference"),
    );

    const mockParams = Promise.resolve({ locale: "en" });
    const metadata = await generateMetadata({ params: mockParams });

    // Confirms that execution falls back seamlessly to code constants defaults without breaking
    expect(metadata.description).toBe(
      "Premium whitelabel e-commerce platform storefront.",
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Metadata Error] Namespace missing for locale: en. Falling back."),
      expect.any(Error)
    );
  });
});
