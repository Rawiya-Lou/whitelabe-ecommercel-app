import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LOCALS } from "@/i18n/constants";

const mockGetTranslations = vi.hoisted(() => vi.fn());
const mockGetLocalizedSiteSeo = vi.hoisted(() => vi.fn());
const mockUrlFor = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}));

vi.mock("@/lib/sanity/query", () => ({
  getLocalizedSiteSeo: mockGetLocalizedSiteSeo,
}));

vi.mock("@/lib/sanity/images", () => ({
  urlFor: mockUrlFor,
}));

import { generateMetadata } from "../[locale]/metadata";

describe("Layout SEO Metadata Builder Suite (metadata.ts)", () => {
  const makeImageBuilder = (url: string) => {
    const builder = {
      width: vi.fn().mockReturnThis(),
      height: vi.fn().mockReturnThis(),
      quality: vi.fn().mockReturnThis(),
      url: vi.fn().mockReturnValue(url),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.client.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("successfully builds SEO configurations using Sanity CMS priority over translation namespaces", async () => {
    mockGetLocalizedSiteSeo.mockResolvedValue({
      siteName: "Client Luxury Store",
      defaultTitle: "Client Hero Title",
      defaultDescription: "Client CMS SEO description.",
      ogImage: { asset: { _ref: "image-og" } },
      favicon: { asset: { _ref: "image-fav" } },
    });

    mockGetTranslations.mockResolvedValue((key: string) => `i18n_${key}`);

    const ogBuilder = makeImageBuilder("https://cdn.sanity.io/og-1200x630.jpg");
    const fav64Builder = makeImageBuilder("https://cdn.sanity.io/fav-64.png");
    const fav180Builder = makeImageBuilder("https://cdn.sanity.io/fav-180.png");

    mockUrlFor
      .mockReturnValueOnce(ogBuilder)
      .mockReturnValueOnce(fav64Builder)
      .mockReturnValueOnce(fav180Builder);

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: LOCALS.EN }),
    });

    expect(mockGetLocalizedSiteSeo).toHaveBeenCalledWith(LOCALS.EN);
    expect(mockGetTranslations).toHaveBeenCalledWith({
      locale: LOCALS.EN,
      namespace: "metadata",
    });

    expect(metadata.metadataBase?.toString()).toBe("https://shop.client.com/");
    expect(metadata.title).toEqual({
      template: "%s | Client Luxury Store",
      default: "Client Hero Title",
    });
    expect(metadata.description).toBe("Client CMS SEO description.");
    expect(metadata.openGraph).toMatchObject({
      siteName: "Client Luxury Store",
      locale: "en_US",
      images: [{ url: "https://cdn.sanity.io/og-1200x630.jpg", width: 1200, height: 630 }],
    });
    expect(metadata.icons).toEqual({
      icon: [{ url: "https://cdn.sanity.io/fav-64.png" }],
      shortcut: ["https://cdn.sanity.io/fav-64.png"],
      apple: [{ url: "https://cdn.sanity.io/fav-180.png", sizes: "180x180" }],
    });
  });

  it("uses next-intl translations when Sanity SEO is unavailable and sets ar_DZ OpenGraph for 'ar'", async () => {
    mockGetLocalizedSiteSeo.mockResolvedValue(null);
    mockGetTranslations.mockImplementation(async ({ namespace }) => {
      if (namespace !== "metadata") {
        throw new Error(`Namespace ${namespace} not found`);
      }
      const dict: Record<string, string> = {
        siteName: "متجر النخبة",
        defaultTitle: "تشكيلة حصرية",
        defaultDescription: "وصف مترجم من next-intl",
      };
      return (key: string) => dict[key];
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: LOCALS.AR }),
    });

    expect(metadata.title).toEqual({
      template: "%s | متجر النخبة",
      default: "تشكيلة حصرية",
    });
    expect(metadata.description).toBe("وصف مترجم من next-intl");
    expect(metadata.openGraph).toMatchObject({
      locale: "ar_DZ",
      url: "/ar",
      images: [{ url: "https://shop.client.com/images/default-og.jpg" }],
    });
    expect(metadata.alternates).toEqual({
      canonical: "/ar",
      languages: {
        en: "/en",
        fr: "/fr",
        ar: "/ar",
      },
    });
  });

  it("reverts seamlessly to hardcoded fallback dictionary when both Sanity and translations crash", async () => {
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "");
    vi.stubEnv("VERCEL_URL", "preview-branch.vercel.app");

    mockGetLocalizedSiteSeo.mockRejectedValue(new Error("Sanity unreachable"));
    mockGetTranslations.mockRejectedValue(new Error("Missing namespace"));

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "unsupported-locale" }),
    });

    expect(metadata.metadataBase?.toString()).toBe(
      "https://preview-branch.vercel.app/"
    );
    expect(metadata.title).toEqual({
      template: "%s | Official Store",
      default: "Curated Collections & Premium Essentials",
    });
    expect(metadata.description).toBe(
      "Explore our exclusive catalog of authentic products with fast international shipping and secure checkout."
    );
    expect(metadata.icons).toEqual({
      icon: [{ url: "/favicon.ico" }],
      shortcut: ["/favicon.ico"],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    });
  });
});