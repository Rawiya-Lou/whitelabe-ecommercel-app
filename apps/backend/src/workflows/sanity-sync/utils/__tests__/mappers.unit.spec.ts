import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProductStatus } from "@medusajs/framework/utils";
import { mapSanityToMedusaProduct } from "../mappers"; // adjust path as needed

describe("mapSanityToMedusaProduct", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BACKEND_URL: "http://localhost:9000",
      SANITY_IMAGE_FALLBACK_URL: "http://localhost:9000/static/custom-placeholder.png",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createBaseMockProduct = (overrides = {}) => ({
    _id: "sanity_prod_123",
    slug: { current: "heritage-kaftan" },
    title: {
      en: "Heritage Kaftan",
      fr: "Caftan Héritage",
      ar: "قفطان التراث",
    },
    description: {
      en: "Luxurious handcrafted kaftan.",
      fr: "Caftan luxueux fait à la main.",
      ar: "قفطان فاخر مصنوع يدوياً.",
    },
    material: {
      en: "100% Pure Silk",
      fr: "100% Soie Pure",
      ar: "100% حرير نقي",
    },
    metadata: {
      translations: {
        en: {},
        fr: {},
        ar: {},
      },
    },
    ...overrides,
  });

  describe("Happy Path & Full Payload Mapping", () => {
    it("should successfully map a comprehensive Sanity product into Medusa AdminCreateProduct format", () => {
      // Arrange
      const mockProduct = createBaseMockProduct({
        productType: "Apparel",
        originCountry: "DZ",
        tags: ["Handmade", "Traditional", "Luxury"],
        highlights: [
          { en: "Pure Silk", fr: "Soie Pure", ar: "حرير خالص" },
          { en: "Gold Embroidery", fr: "Broderie Or", ar: "تطريز ذهبي" },
        ],
        seoTitle: {
          en: "Buy Heritage Kaftan | Algerian Artisan",
          fr: "Acheter Caftan Héritage",
          ar: "شراء قفطان التراث الجزائري",
        },
        seoDescription: {
          en: "Exclusive handmade traditional kaftan.",
          fr: "Caftan traditionnel exclusif fait main.",
          ar: "قفطان تقليدي حصري مصنوع يدوياً.",
        },
        images: [
          {
            url: "https://cdn.sanity.io/images/proj/dataset/img1.jpg",
            asset: { _ref: "image-asset-1" },
            alt_en: "Front View",
            alt_fr: "Vue de face",
            alt_ar: "منظر أمامي",
          },
        ],
        manage_inventory: true,
        allow_backorder: false,
      });

      const categoryIds = ["pcat_cat1", "pcat_cat2"];
      const shippingProfileId = "sp_default";
      const salesChannelId = "sc_global";

      // Act
      const result = mapSanityToMedusaProduct(
        mockProduct as any,
        categoryIds,
        shippingProfileId,
        salesChannelId,
      );

      // Assert: Core Product Fields
      expect(result.title).toBe("Heritage Kaftan");
      expect(result.subtitle).toBe("Caftan Héritage");
      expect(result.description).toBe("Luxurious handcrafted kaftan.");
      expect(result.handle).toBe("heritage-kaftan");
      expect(result.status).toBe(ProductStatus.DRAFT);
      expect(result.material).toBe("100% Pure Silk");

      // Assert: Logistics & Shipping Specs
      expect(result.origin_country).toBe("DZ");
      expect(result.shipping_profile_id).toBe("sp_default");
      expect(result.sales_channels).toEqual([{ id: "sc_global" }]);
      expect(result.categories).toEqual([{ id: "pcat_cat1" }, { id: "pcat_cat2" }]);

      // Assert: Media
      expect(result.thumbnail).toBe("https://cdn.sanity.io/images/proj/dataset/img1.jpg");
      expect(result.images).toHaveLength(1);
      expect(result.images?.[0]).toEqual({
        url: "https://cdn.sanity.io/images/proj/dataset/img1.jpg",
        alt: "Front View",
        metadata: null,
      });

      // Assert: Metadata Structure
      expect(result.metadata?.sanity_id).toBe("sanity_prod_123");
      expect(result.metadata?.is_sync_origin).toBe("sanity");
      expect(result.metadata?.product_type).toBe("Apparel");
      expect(result.metadata?.tags).toEqual(["Handmade", "Traditional", "Luxury"]);
      expect(result.metadata?.translations).toEqual({
        en: {
          title: "Heritage Kaftan",
          description: "Luxurious handcrafted kaftan.",
          material: "100% Pure Silk",
        },
        fr: {
          title: "Caftan Héritage",
          description: "Caftan luxueux fait à la main.",
          material: "100% Soie Pure",
        },
        ar: {
          title: "قفطان التراث",
          description: "قفطان فاخر مصنوع يدوياً.",
          material: "100% حرير نقي",
        },
      });

      // Assert: Variant & Inventory
      expect(result.variants).toHaveLength(1);
      const variant = result.variants![0];
      expect(variant.title).toBe("Standard Edition");
      expect(variant.sku).toBe("SANITY-SANITY_PROD_123");
     
      expect(variant.manage_inventory).toBe(true);
      expect(variant.allow_backorder).toBe(false);
    
    });
  });

  describe("Pricing Conversions", () => {
    it("should correctly convert float currencies into minor integer cents and handle zeros", () => {
      const mockProduct = createBaseMockProduct({
        basePriceDzd: 1200.75,
        basePriceEur: 19.99,
        basePriceUsd: 0, // Unset/Free USD
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.variants![0].prices).toEqual([
        { currency_code: "dzd", amount: 120075 },
        { currency_code: "eur", amount: 1999 },
        { currency_code: "usd", amount: 0 },
      ]);
    });

    it("should default prices to 0 if price fields are undefined or null", () => {
      const mockProduct = createBaseMockProduct({
        basePriceDzd: undefined,
        basePriceEur: null,
        basePriceUsd: undefined,
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.variants![0].prices).toEqual([
        { currency_code: "dzd", amount: 0 },
        { currency_code: "eur", amount: 0 },
        { currency_code: "usd", amount: 0 },
      ]);
    });
  });

  describe("Multilingual Resolution & Fallbacks", () => {
    it("should fallback to plain strings when title, description, or material are not objects", () => {
      const mockProduct = createBaseMockProduct({
        title: "Simple T-Shirt",
        description: "100% Cotton daily shirt",
        material: "Cotton",
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.title).toBe("Simple T-Shirt");
      expect(result.description).toBe("100% Cotton daily shirt");
      expect(result.material).toBe("Cotton");
      expect(result.subtitle).toBeNull();

      expect(result.metadata?.translations).toEqual({
        en: {
          title: "Simple T-Shirt",
          description: "100% Cotton daily shirt",
          material: "Cotton",
        },
        fr: { title: "", description: "", material: "" },
        ar: { title: "", description: "", material: "" },
      });
    });

    it("should fallback to product.metadata.translations if root fields are empty", () => {
      const mockProduct = createBaseMockProduct({
        title: null,
        description: null,
        material: null,
        metadata: {
          translations: {
            en: {
              title: "Fallback Title EN",
              description: "Fallback Desc EN",
              material: "Fallback Mat EN",
            },
            fr: {
              title: "Titre FR",
              description: "Description FR",
              material: "Matière FR",
            },
            ar: {
              title: "العنوان بالعربية",
              description: "الوصف بالعربية",
              material: "المادة بالعربية",
            },
          },
        },
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.title).toBe("Fallback Title EN");
      expect(result.description).toBe("Fallback Desc EN");
      expect(result.subtitle).toBe("Titre FR");
      expect((result.metadata?.translations as Record<string, any>).fr.title).toBe("Titre FR");
      expect((result.metadata?.translations as Record<string, any>).ar.title).toBe("العنوان بالعربية");
    });

    it("should provide default 'Untitled Product' if all title candidates are missing", () => {
      const mockProduct = createBaseMockProduct({
        title: null,
        metadata: { translations: { en: {}, fr: {}, ar: {} } },
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.title).toBe("Untitled Product");
    });
  });

  describe("Handle / Slug Resolution", () => {
    it("should parse slug from Sanity object with current field", () => {
      const mockProduct = createBaseMockProduct({
        slug: { current: "  CUSTOM-SLUG-VALUE  " },
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);
      expect(result.handle).toBe("custom-slug-value");
    });

    it("should parse slug directly when passed as a string", () => {
      const mockProduct = createBaseMockProduct({
        slug: "Direct-String-Slug",
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);
      expect(result.handle).toBe("direct-string-slug");
    });

    it("should fallback to prod-ID when slug is missing", () => {
      const mockProduct = createBaseMockProduct({
        _id: "doc_999",
        slug: null,
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);
      expect(result.handle).toBe("prod-doc-999");
    });
  });

  describe("Images & Gallery Processing", () => {
    it("should fallback to the branded placeholder if images array is empty or undefined", () => {
      const mockProduct = createBaseMockProduct({
        images: [],
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.thumbnail).toBe("http://localhost:9000/static/custom-placeholder.png");
      expect(result.images).toEqual([
        { url: "http://localhost:9000/static/custom-placeholder.png", alt: "Product placeholder" },
      ]);
    });

    it("should map image keys, asset refs, and multilingual alt tags into metadata", () => {
      const mockProduct = createBaseMockProduct({
        images: [
          {
            url: "https://cdn.sanity.io/img1.png",
            asset: { _ref: "image-asset-reference-123" },
            alt_en: "Main image",
            alt_fr: "Image principale",
            alt_ar: "الصورة الرئيسية",
          },
          {
            url: "https://cdn.sanity.io/img2.png",
            _key: "manual-key-456",
            alt: "Fallback alt without language suffix",
          },
        ],
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.thumbnail).toBe("https://cdn.sanity.io/img1.png");
      expect(result.images).toHaveLength(2);

      const imgMeta = result.metadata?.image_metadata as Record<string, any> || {};
      expect(imgMeta).toHaveLength(2);
      expect((imgMeta[0] as Record<string, any> || {})).toEqual({
        url: "https://cdn.sanity.io/img1.png",
        sanity_asset_id: "image-asset-reference-123",
        alt: {
          en: "Main image",
          fr: "Image principale",
          ar: "الصورة الرئيسية",
        },
      });
      expect((imgMeta[1] as Record<string, any> || {})).toEqual({
        url: "https://cdn.sanity.io/img2.png",
        sanity_asset_id: "manual-key-456",
        alt: {
          en: "Fallback alt without language suffix",
          fr: "",
          ar: "",
        },
      });
    });
  });

  describe("Inventory & Backorder Defaults", () => {
    it("should default manage_inventory to true and allow_backorder to false when undefined", () => {
      const mockProduct = createBaseMockProduct({
        manage_inventory: undefined,
        allow_backorder: undefined,
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.variants![0].manage_inventory).toBe(true);
      expect(result.variants![0].allow_backorder).toBe(false);
    });

    it("should preserve explicit false for manage_inventory and true for allow_backorder", () => {
      const mockProduct = createBaseMockProduct({
        manage_inventory: false,
        allow_backorder: true,
      });

      const result = mapSanityToMedusaProduct(mockProduct as any, []);

      expect(result.variants![0].manage_inventory).toBe(false);
      expect(result.variants![0].allow_backorder).toBe(true);
    });
  });
});