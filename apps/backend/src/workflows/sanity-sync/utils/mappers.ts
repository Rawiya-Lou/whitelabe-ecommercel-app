import { ProductStatus } from "@medusajs/framework/utils";
import { HttpTypes } from "@medusajs/framework/types";
import {
  SanityImagePayload,
  SanityProductPayload,
  SanitySEOPayload,
  SanityVariantPayload,
} from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

type SanityMedusaCreateProduct = Omit<HttpTypes.AdminCreateProduct, "tags"> & {
  tags?: Array<{ value: string }>;
};

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
): SanityMedusaCreateProduct {
  const BASE_URL = process.env.BACKEND_URL || "http://localhost:9000";
  const brandedPlaceholder =
    process.env.SANITY_IMAGE_FALLBACK_URL ||
    `${BASE_URL}/static/placeholder.png`;

  const calculatedImageMetadata: Array<{
    url: string;
    sanity_asset_id: string;
    alt: { en: string; fr: string; ar: string };
  }> = [];

  const variantInputs: SanityVariantPayload[] = product.variants?.length
    ? product.variants
    : [
        {
          title: "Standard Edition",
          options: { "Variant Option": "Standard" },
          images: [],
        },
      ];
  const allImageInputs = [
    ...(product.images ?? []),
    ...variantInputs.flatMap((variant) => variant.images ?? []),
  ];
  const uniqueImageInputs = [
    ...new Map(
      allImageInputs.map((image, index) => [
        image.url || image.asset?._ref || image._key || `image-${index}`,
        image,
      ]),
    ).values(),
  ];
  const resolvedImages =
    uniqueImageInputs.length > 0
      ? uniqueImageInputs.map((img, index: number) => {
          const imageUrl = img.url || brandedPlaceholder;
          const sanity_asset_id = img.asset?._ref || img._key || `img_${index}`;

          const alt: Record<string, unknown> = isRecord(img.alt)
            ? img.alt
            : {};
          const altMap = {
            en:
              getText(alt.en) ||
              getText(img.alt_en) ||
              getText(img.alt) ||
              "Product image",
            fr: getText(alt.fr) || getText(img.alt_fr),
            ar: getText(alt.ar) || getText(img.alt_ar),
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
    if (isRecord(field)) {
      if (getText(field[lang])) return getText(field[lang]);
      if (getText(field[`_${lang}`])) return getText(field[`_${lang}`]);
    }
    const metaTranslations =
      (product.metadata?.translations as Record<string, any>) || {};
    if (metaTranslations && metaTranslations[lang]) {
      const val = metaTranslations[lang][metaPath];
      if (getText(val)) return getText(val);
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
      getText(product.metadata?.translations?.en?.title) ||
        "",
      description:
        extractTranslation(product.description, "description", "en") ||
        getText(product.metadata?.translations?.en?.description) ||
        "",
      material:
        materialEn ||
        getText(product.metadata?.translations?.en?.material) ||
        "",
    },
    fr: {
      title:
        extractTranslation(product.title, "title", "fr") ||
        getText(product.metadata?.translations?.fr?.title) ||
        "",
      description:
        extractTranslation(product.description, "description", "fr") ||
        getText(product.metadata?.translations?.fr?.description) ||
        "",
      material:
        materialFr ||
        getText(product.metadata?.translations?.fr?.material) ||
        "",
    },
    ar: {
      title:
        extractTranslation(product.title, "title", "ar") ||
        getText(product.metadata?.translations?.ar?.title) ||
        "",
      description:
        extractTranslation(product.description, "description", "ar") ||
        getText(product.metadata?.translations?.ar?.description) ||
        "",
      material:
        materialAr ||
        getText(product.metadata?.translations?.ar?.material) ||
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
  const rawOriginCountry = product.originCountry?.trim().toUpperCase();
  const originCountry =
    rawOriginCountry && rawOriginCountry !== "DZ"
      ? rawOriginCountry
      : undefined;
  const inferredOptionValues = new Map<string, Set<string>>();
  const getVariantOptions = (
    variant: SanityVariantPayload,
  ): Record<string, string> => {
    const options: Record<string, string> = {};

    if (Array.isArray(variant.options)) {
      for (const optionValue of variant.options) {
        if (!isRecord(optionValue)) continue;
        const option = getText(optionValue.option);
        const value = getText(optionValue.value);
        if (option && value) options[option] = value;
      }
    } else if (isRecord(variant.options)) {
      for (const [option, rawValue] of Object.entries(variant.options)) {
        const title = getText(option);
        const value = getText(rawValue);
        if (title && value) options[title] = value;
      }
    }

    if (Array.isArray(variant.optionValues)) {
      for (const optionValue of variant.optionValues) {
        if (!isRecord(optionValue)) continue;
        const option = getText(optionValue.option);
        const value = getText(optionValue.value);
        if (option && value) options[option] = value;
      }
    }

    return options;
  };

  for (const variant of variantInputs) {
    const optionValues = getVariantOptions(variant);

    for (const [title, value] of Object.entries(optionValues)) {
      const values = inferredOptionValues.get(title) ?? new Set<string>();
      values.add(value);
      inferredOptionValues.set(title, values);
    }
  }

  const optionMatrix = (Array.isArray(product.variantOptions)
    ? product.variantOptions
    : []
  )
    .filter(isRecord)
    .map((option) => ({
      title: getText(option.title),
      values: Array.isArray(option.values)
        ? [...new Set(option.values.map(getText).filter(Boolean))]
        : [],
    }))
    .filter((option) => option.title && option.values.length > 0);
  const resolvedOptionMatrix =
    optionMatrix.length > 0
      ? optionMatrix
      : [...inferredOptionValues.entries()].map(([title, values]) => ({
          title,
          values: [...values],
        }));
  const productOptions =
    resolvedOptionMatrix.length > 0
      ? resolvedOptionMatrix
      : [{ title: "Variant Option", values: ["Standard"] }];
  const resolvedVariants = variantInputs.map((variant, index) => {
    const options = getVariantOptions(variant);
    const variantImages = (variant.images ?? []).map((image) => {
      const alt: Record<string, unknown> = isRecord(image.alt)
        ? image.alt
        : {};
      return {
        url: image.url,
        sanity_asset_id: image.asset?._ref || image._key,
        alt: {
          en: getText(alt.en) || getText(image.alt_en) || getText(image.alt),
          fr: getText(alt.fr) || getText(image.alt_fr),
          ar: getText(alt.ar) || getText(image.alt_ar),
        },
      };
    });
    const optionLabel = Object.values(options).join(" / ");
    const skuSuffix =
      optionLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || String(index + 1);

    return {
      title: variant.title || optionLabel || "Standard Edition",
      sku: product.variants?.length
        ? `SANITY-${String(product._id || "").toUpperCase()}-${skuSuffix.toUpperCase()}`
        : `SANITY-${String(product._id || "").toUpperCase()}`,
      options:
        Object.keys(options).length > 0
          ? options
          : { [productOptions[0].title]: productOptions[0].values[0] },
      metadata: {
        ...(variant.metadata ?? {}),
        sanity_variant_id:
          variant.medusa_variant_id || variant.variantId || variant._key || "",
        ...((variant.medusa_variant_id || variant.variantId)
          ? {
              medusa_variant_id:
                variant.medusa_variant_id || variant.variantId,
            }
          : {}),
        variant_images: variantImages,
      },
      prices: [],
      ...(variantImages.length > 0
        ? { thumbnail: variantImages[0].url }
        : {}),
    };
  });

  const variantImages = Object.fromEntries(
    resolvedVariants.map((variant, index) => [
      variantInputs[index].medusa_variant_id ||
        variantInputs[index].variantId ||
        variantInputs[index]._key ||
        variant.sku,
      variant.metadata?.variant_images ?? [],
    ]),
  );
  const metadata: Record<string, any> = {
    ...(product.metadata || {}),
    sanity_id: product._id || "",
    is_sync_origin: "sanity",
    product_type: product.productType || null,
    translations,
    highlights: highlights.en.length > 0 ? highlights : rawHighlights,
    seo,
    tags: rawTags,
    variant_images: variantImages,
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
    status: ProductStatus.PUBLISHED,
    thumbnail: primaryThumbnail,
    images: resolvedImages,
    subtitle: translations.fr.title || null,
    origin_country: originCountry,
    is_giftcard: false,
    discountable: true,
    shipping_profile_id: shippingProfileId || undefined,
    categories: categoryIds.map((id) => ({ id })),
    sales_channels: salesChannelId ? [{ id: salesChannelId }] : [],
    tags: rawTags.map((value) => ({ value })),
    options: productOptions,
    metadata,
    variants: resolvedVariants.map((variant) => ({
      ...variant,
      material: finalMaterial,
      barcode: product.barcode || null,
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
    })),
  };
}
