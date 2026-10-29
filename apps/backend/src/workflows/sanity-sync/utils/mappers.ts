import { ProductStatus } from "@medusajs/framework/utils";
import { HttpTypes } from "@medusajs/framework/types";
import {
  SanityImagePayload,
  SanityProductPayload,
  SanitySEOPayload,
} from "../types";

export function mapSanityToMedusaProduct(
  product: SanityProductPayload & {
    images?: SanityImagePayload[];
    manage_inventory?: boolean;
    allow_backorder?: boolean;
    metadata: Record<string, any>;
  },
  categoryIds: string[],
  shippingProfileId?: string,
  salesChannelId?: string,
): HttpTypes.AdminCreateProduct {
  const prices = [
    {
      currency_code: "dzd",
      amount: product.basePriceDzd ? Math.round(product.basePriceDzd * 100) : 0,
    },
    {
      currency_code: "eur",
      amount: product.basePriceEur ? Math.round(product.basePriceEur * 100) : 0,
    },
    {
      currency_code: "usd",
      amount: product.basePriceUsd ? Math.round(product.basePriceUsd * 100) : 0,
    },
  ];
  const BASE_URL = process.env.BACKEND_URL || "http://localhost:9000";
  const brandedPlaceholder =
    process.env.SANITY_IMAGE_FALLBACK_URL ||
    `${BASE_URL}/static/placeholder.png`;

  const calculatedImageMetadata: Array<{
    url: string;
    sanity_asset_id: string;
    alt: { en: string; fr: string; ar: string };
  }> = [];

  const resolvedImages =
    product.images && product.images.length > 0
      ? product.images.map((img, index: number) => {
          const imageUrl = img.url || brandedPlaceholder;
          const sanity_asset_id = img.asset?._ref || img._key || `img_${index}`;

          const altMap = {
            en: String(img.alt_en || img.alt || "Product image").trim(),
            fr: String(img.alt_fr || "").trim(),
            ar: String(img.alt_ar || "").trim(),
          };

          calculatedImageMetadata.push({
            url: imageUrl,
            sanity_asset_id: sanity_asset_id,
            alt: altMap,
          });
          return { url: imageUrl, alt: altMap.en, metadata: null };
        })
      : [{ url: brandedPlaceholder, alt: "Product placeholder" }];

  const primaryThumbnail = resolvedImages[0]?.url || brandedPlaceholder;
  const extractTranslation = (
    field: any,
    metaPath:
      "title" | "description" | "material" | "seo_title" | "seo_description",
    lang: "en" | "fr" | "ar",
  ): string => {
    if (field && typeof field === "object") {
      if (field[lang]) return String(field[lang]).trim();
      if (field[`_${lang}`]) return String(field[`_${lang}`]).trim();
    }
    const metaTranslations =
      (product.metadata?.translations as Record<string, any>) || {};
    if (metaTranslations && metaTranslations[lang]) {
      const val = metaTranslations[lang][metaPath];
      if (val) return String(val).trim();
    }

    if (lang === "en" && typeof field === "string") {
      return field.trim();
    }

    return "";
  };

  const materialEn = extractTranslation(product.material, "material", "en");
  const materialFr = extractTranslation(product.material, "material", "fr");
  const materialAr = extractTranslation(product.material, "material", "ar");
  const rawTags: string[] = Array.isArray(
    product.tags && product.tags.length > 0
      ? product.tags
      : product.metadata?.tags,
  )
    ? (product.tags || product.metadata?.tags)
        .map((t: any) => (typeof t === "string" ? t.trim() : t?.value || ""))
        .filter(Boolean)
    : [];

  const rawHighlights = Array.isArray(
    product.highlights && product.highlights.length > 0
      ? product.highlights
      : product.metadata?.highlights,
  )
    ? product.highlights || product.metadata?.highlights
    : [];
  const highlights = {
    en: rawHighlights
      .map((h: any) => h?.en || (typeof h === "string" ? h : ""))
      .filter(Boolean),
    fr: rawHighlights.map((h: any) => h?.fr || "").filter(Boolean),
    ar: rawHighlights.map((h: any) => h?.ar || "").filter(Boolean),
  };

  const rawSeo: SanitySEOPayload = product.seo || product.metadata?.seo || {};
  const rawSeoTitle = rawSeo?.metaTitle || "";
  const rawSeoDesc = rawSeo?.metaDescription || "";
  const rawOg = rawSeo.openGraphImage || {};
  const openGraphImage = {
    url: rawOg.url || resolvedImages[0]?.url || "",
    assetId: rawOg.assetId || rawOg.asset?._ref || "",
  };

  const seo = {
    metaTitle: {
      en: extractTranslation(rawSeoTitle, "seo_title", "en"),
      fr: extractTranslation(rawSeoTitle, "seo_title", "fr"),
      ar: extractTranslation(rawSeoTitle, "seo_title", "ar"),
    },
    metaDescription: {
      en: extractTranslation(rawSeoDesc, "seo_description", "en"),
      fr: extractTranslation(rawSeoDesc, "seo_description", "fr"),
      ar: extractTranslation(rawSeoDesc, "seo_description", "ar"),
    },
    keywords: Array.isArray(rawSeo.keywords) ? rawSeo.keywords : [],
    openGraphImage,
  };

  const rawSlug =
    (product.slug as any)?.current || product.slug || `prod-${product._id}`;
  const handle = String(rawSlug)
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const translations: Record<string, any> = {
    en: {
      title:
        extractTranslation(product.title, "title", "en") ||
        (product.metadata?.translations?.en?.title as string) ||
        "",
      description:
        extractTranslation(product.description, "description", "en") ||
        (product.metadata?.translations?.en?.description as string) ||
        "",
      material:
        materialEn ||
        (product.metadata?.translations?.en?.material as string) ||
        "",
    },
    fr: {
      title:
        extractTranslation(product.title, "title", "fr") ||
        (product.metadata?.translations?.fr?.title as string) ||
        "",
      description:
        extractTranslation(product.description, "description", "fr") ||
        (product.metadata?.translations?.fr?.description as string) ||
        "",
      material:
        materialFr ||
        (product.metadata?.translations?.fr?.material as string) ||
        "",
    },
    ar: {
      title:
        extractTranslation(product.title, "title", "ar") ||
        (product.metadata?.translations?.ar?.title as string) ||
        "",
      description:
        extractTranslation(product.description, "description", "ar") ||
        (product.metadata?.translations?.ar?.description as string) ||
        "",
      material:
        materialAr ||
        (product.metadata?.translations?.ar?.material as string) ||
        "",
    },
  };

  const finalTitle =
    translations.en.title ||
    (typeof product.title === "string" ? product.title : "") ||
    "Untitled Product";
  const finalMaterial =
    translations.en?.material ||
    (typeof product?.material === "string" ? product?.material : "") ||
    "";

  const finalDescription =
    translations.en.description ||
    (typeof product.description === "string" ? product.description : "") ||
    "";
  const originCountry =
    product.originCountry?.trim().toUpperCase() || undefined;

  const metadata: Record<string, any> = {
    ...(product.metadata || {}),
    sanity_id: product._id || "",
    is_sync_origin: "sanity",
    product_type: product.productType || null,
    translations,
    highlights: highlights.en.length > 0 ? highlights : rawHighlights,
    seo: rawSeo,
    tags: rawTags,
    title_en: String(translations.en?.title) || finalTitle,
    title_fr: String(translations.fr?.title) || "",
    title_ar: String(translations.ar?.title) || "",
    description_en: String(translations.en?.description) || "",
    description_fr: String(translations.fr?.description) || "",
    description_ar: String(translations.ar?.description) || "",
    material_en: String(translations.en?.material) || finalMaterial,
    material_fr: String(translations.fr?.material) || "",
    material_ar: String(translations.ar?.material) || "",
    image_metadata: calculatedImageMetadata,
  };

  return {
    title: finalTitle,
    handle,
    description: finalDescription,
    material: finalMaterial,
    status: ProductStatus.DRAFT,
    thumbnail: primaryThumbnail,
    images: resolvedImages,
    subtitle: translations.fr.title || null,
    origin_country: originCountry,
    is_giftcard: false,
    discountable: true,
    shipping_profile_id: shippingProfileId || undefined,
    categories: categoryIds.map((id) => ({ id })),
    sales_channels: salesChannelId ? [{ id: salesChannelId }] : [],
    options: [{ title: "Variant Option", values: ["Standard"] }],
    metadata,
    variants: [
      {
        title: "Standard Edition",
        sku: `SANITY-${String(product._id || "").toUpperCase()}`,
        material: finalMaterial,
      
        barcode: product.barcode || null,
        options: { "Variant Option": "Standard" },
        prices,
        length: product.lengthMm ? parseFloat(product.lengthMm.toString()) : 0,
        width: product.widthMm ? parseFloat(product.widthMm.toString()) : 0,
        height: product.heightMm ? parseFloat(product.heightMm.toString()) : 0,
        origin_country: originCountry,
        hs_code: product.hsCode ? String(product.hsCode).trim() : null,
        mid_code: product.midCode ? String(product.midCode).trim() : null,
        weight: product.weightGrams
          ? parseFloat(product.weightGrams.toString())
          : 0,
        manage_inventory: product.manage_inventory ?? true,
        allow_backorder: product.allow_backorder ?? false,
      },
    ],
  };
}
