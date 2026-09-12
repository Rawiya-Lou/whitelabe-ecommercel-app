import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocalizedHeroSection, getLocalizedFeatures, SanityLocalizedHero, SanityLocalizedFeatureBlock } from "../sanity/query";
import { LOCALS } from "@/i18n/constants";

const { mockSanityFetch } = vi.hoisted(() => {
  return {
    mockSanityFetch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
});

vi.mock("../sanity/client", () => {
  return {
    sanityClient: {
      fetch: mockSanityFetch,
    },
  };
});

describe("Sanity Localization GROQ Engine Proxy (query.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should forward the active Arabic locale parameter securely into the GROQ element selector string", async () => {
    const mockHeroPayload: SanityLocalizedHero = {
      _id: "hero_dz_01",
      title: "أهلاً بكم في متجرنا الرقمي",
      subtitle: "توصيل سريع إلى 58 ولاية جزائرية",
      ctaText: "اكتشف المنتجات",
      badgeText: "جديد 2026",
      heroImage: {
        asset: {
          _ref: "image-abc123dz-png",
          _type: "reference",
        },
      },
    };

    mockSanityFetch.mockResolvedValueOnce(mockHeroPayload as unknown);

    const result = await getLocalizedHeroSection(LOCALS.AR);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("أهلاً بكم في متجرنا الرقمي");
    expect(result?.badgeText).toBe("جديد 2026");
    expect(mockSanityFetch).toHaveBeenCalledWith(
      expect.stringContaining("title[$locale]"),
      { locale: LOCALS.AR },
      expect.objectContaining({
        next: expect.objectContaining({
          tags: [`sanity-hero-${LOCALS.AR}`],
        }),
      })
    );
  });

  it("should parse multiple promotional blocks from the structural features query array", async () => {
    const mockFeaturesPayload: SanityLocalizedFeatureBlock[] = [
      { _id: "f_1", heading: "Livraison Rapide", body: "Livraison disponible sur Alger, Oran, Constantine", tag: "logistics" },
      { _id: "f_2", heading: "Paiement à la livraison", body: "Payez en toute sécurité à la réception de votre colis", tag: "security" }
    ];

    mockSanityFetch.mockResolvedValueOnce(mockFeaturesPayload as unknown);

    const result = await getLocalizedFeatures(LOCALS.FR);

    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe("Livraison Rapide");
    expect(result[1].tag).toBe("security");

    expect(mockSanityFetch).toHaveBeenCalledWith(
      expect.stringContaining("heading[$locale]"),
      { locale: LOCALS.FR },
      expect.objectContaining({
        next: expect.objectContaining({
          tags: [`sanity-features-${LOCALS.FR}`],
        }),
      })
    );
  });
  it("should execute graceful array fallback handling when Sanity CDN edges encounter lookup rejections", async () => {
    mockSanityFetch.mockRejectedValueOnce(new Error("ECONNRESET: Sanity CDN connection dropped."));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getLocalizedFeatures(LOCALS.EN);

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
