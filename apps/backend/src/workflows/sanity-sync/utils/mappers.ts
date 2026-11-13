import { MedusaError, ProductStatus } from "@medusajs/framework/utils";
import { HttpTypes } from "@medusajs/framework/types";
import {
  SanityImagePayload,
  SanityProductPayload,
  SanitySEOPayload,
} from "../types";
import {
  SanityProductInputSchema,
  ValidatedSanityProduct,
  ValidatedSanityVariant
} from "../schemas/validators";
import { getSanityImageFallbackUrl } from "../../../utils/backend-url";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Strips HTML tags and caps length for untrusted text
 */
const getText = (value: unknown, maxLength = 1000): string => {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>?/gm, "")
    .trim()
    .slice(0, maxLength);
};

export type SanityMedusaCreateProduct = Omit<
  HttpTypes.AdminCreateProduct,
  "tags"
> & {
  tags?: Array<{ value: string }>;
};

export function mapSanityToMedusaProduct(
  product: SanityProductPayload & {
    images?: SanityImagePayload[];
    manage_inventory?: boolean;
    allow_backorder?: boolean;
    metadata: Record<string, any>;
  },
  categoryIds: string[] = [],
  shippingProfileId?: string,
  salesChannelId?: string,
): SanityMedusaCreateProduct {
  // =========================================================================
  // 1. PRE-NORMALIZE INPUT BEFORE ZOD PARSING (Prevents "Invalid URL" crash)
  // =========================================================================
  const rawSeo = isRecord(product.seo)
    ? (product.seo as Record<string, any>)
    : undefined;
  const rawOg =
    rawSeo && isRecord(rawSeo.openGraphImage)
      ? (rawSeo.openGraphImage as Record<string, any>)
      : undefined;
  const rawOgUrl =
    rawOg && typeof rawOg.url === "string" ? rawOg.url.trim() : "";
  const isValidHttpUrl = /^https?:\/\/.+/i.test(rawOgUrl);

  // If openGraphImage.url is empty string (""), convert it to undefined so Zod .optional() passes
  const normalizedSeo = rawSeo
    ? {
        ...rawSeo,
        openGraphImage: rawOg
          ? {
              ...rawOg,
              url: isValidHttpUrl ? rawOgUrl : undefined,
            }
          : undefined,
      }
    : undefined;

  const rawVariantOptions = Array.isArray(product.variantOptions)
    ? product.variantOptions
        .filter(isRecord)
        .map((opt) => ({
          title: typeof opt.title === "string" ? opt.title : "",
          values: Array.isArray(opt.values)
            ? opt.values.filter(
                (v): v is string => typeof v === "string" && v.trim().length > 0,
              )
            : [],
        }))
        .filter((opt) => opt.title.trim().length > 0 && opt.values.length > 0)
    : undefined;

  const rawVariants = Array.isArray(product.variants)
    ? product.variants.filter(isRecord).map((variant) => {
        const normalizedOptions: Record<string, string> = {};

        if (Array.isArray(variant.options)) {
          for (const item of variant.options) {
            if (
              isRecord(item) &&
              typeof item.option === "string" &&
              typeof item.value === "string"
            ) {
              const k = item.option.trim();
              const v = item.value.trim();
              if (k && v) normalizedOptions[k] = v;
            }
          }
        } else if (isRecord(variant.options)) {
          for (const [k, v] of Object.entries(variant.options)) {
            if (typeof v === "string") normalizedOptions[k] = v.trim();
          }
        }

        return {
          ...variant,
          title: typeof variant.title === "string" ? variant.title : undefined,
          barcode:
            typeof variant.barcode === "string" ? variant.barcode : undefined,
          options:
            Object.keys(normalizedOptions).length > 0
              ? normalizedOptions
              : undefined,
        };
      })
    : undefined;

  const normalizedForValidation = {
    ...product,
    _id:
      typeof product._id === "string" && product._id
        ? product._id
        : "fallback-doc-id",
    title: product.title === null ? undefined : product.title,
    subtitle:
      (product as any).subtitle === null ? undefined : (product as any).subtitle,
    description: product.description === null ? undefined : product.description,
    material: product.material === null ? undefined : product.material,
    slug:
      typeof product.slug === "string"
        ? product.slug
        : isRecord(product.slug)
          ? product.slug
          : "",
    seo: normalizedSeo,
    variantOptions: rawVariantOptions,
    variants: rawVariants,
  };

  // 2. ZOD RUNTIME GATE (Zero-Trust Validation)
  const parseResult = SanityProductInputSchema.safeParse(normalizedForValidation);
  if (!parseResult.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[Sanity-to-Medusa Mapper] Payload validation failed:\n${JSON.stringify(
        parseResult.error.format(),
        null,
        2,
      )}`,
    );
  }

  const validated: ValidatedSanityProduct = parseResult.data;
  const brandedPlaceholder = getSanityImageFallbackUrl();

  // 3. IMAGE EXTRACTION & RESOLUTION
  const calculatedImageMetadata: Array<{
    url: string;
    sanity_asset_id: string;
    alt: { en: string; fr: string; ar: string };
  }> = [];

  const rawImages: SanityImagePayload[] = [
    ...(Array.isArray(product.images) ? product.images : []),
    ...(Array.isArray(product.variants)
      ? product.variants.flatMap((v) => (Array.isArray(v.images) ? v.images : []))
      : []),
  ];

  const uniqueImageInputs = [
    ...new Map(
      rawImages.map((image, index) => [
        image.url || image.asset?._ref || image._key || `image-${index}`,
        image,
      ]),
    ).values(),
  ];

  // NOTE: Fallback placeholder array must NOT contain "metadata: null"
  const resolvedImages =
    uniqueImageInputs.length > 0
      ? uniqueImageInputs.map((img, index: number) => {
          const imageUrl = img.url || brandedPlaceholder;
          const sanity_asset_id =
            img.asset?._ref || img._key || `img_${index}`;

          const alt: Record<string, unknown> = isRecord(img.alt) ? img.alt : {};
          const altMap = {
            en:
              getText(alt.en, 150) ||
              getText(img.alt_en, 150) ||
              getText(img.alt, 150) ||
              "Product image",
            fr: getText(alt.fr, 150) || getText(img.alt_fr, 150),
            ar: getText(alt.ar, 150) || getText(img.alt_ar, 150),
          };

          calculatedImageMetadata.push({
            url: imageUrl,
            sanity_asset_id,
            alt: altMap,
          });

          return { url: imageUrl, alt: altMap.en, metadata: null };
        })
      : [
          {
            url: brandedPlaceholder,
            alt: "Product placeholder",
          },
        ];

  const primaryThumbnail = resolvedImages[0]?.url || brandedPlaceholder;

  // 4. CANONICAL TRANSLATION MATRIX
  const existingMeta = isRecord(product.metadata) ? product.metadata : {} as Record<string, any>;
  const existingMetaTranslations = isRecord(existingMeta.translations)
    ? (existingMeta.translations as Record<string, any>)
    : {};

  const extractTranslation = (
    fieldVal: any,
    metaPath: "title" | "description" | "material",
    lang: "en" | "fr" | "ar",
  ): string => {
    if (isRecord(fieldVal)) {
      const direct = fieldVal[lang] ?? fieldVal[`_${lang}`];
      if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
      }
    }
    if (existingMetaTranslations[lang]) {
      const val = existingMetaTranslations[lang][metaPath];
      if (typeof val === "string" && val.trim()) {
        return val.trim();
      }
    }
    if (lang === "en" && typeof fieldVal === "string" && fieldVal.trim()) {
      return fieldVal.trim();
    }
    return "";
  };

  const titleEn = extractTranslation(product.title, "title", "en");
  const titleFr = extractTranslation(product.title, "title", "fr");
  const titleAr = extractTranslation(product.title, "title", "ar");

  const descEn = extractTranslation(product.description, "description", "en");
  const descFr = extractTranslation(product.description, "description", "fr");
  const descAr = extractTranslation(product.description, "description", "ar");

  const matEn = extractTranslation(product.material, "material", "en");
  const matFr = extractTranslation(product.material, "material", "fr");
  const matAr = extractTranslation(product.material, "material", "ar");

  const translations = {
    en: {
      title: titleEn || "Untitled Product",
      description: descEn,
      material: matEn,
    },
    fr: {
      title: titleFr,
      description: descFr,
      material: matFr,
    },
    ar: {
      title: titleAr,
      description: descAr,
      material: matAr,
    },
  };

  const finalTitle =
    titleEn ||
    (typeof product.title === "string" ? product.title.trim() : "") ||
    "Untitled Product";
  const finalDescription =
    descEn ||
    (typeof product.description === "string" ? product.description.trim() : "") ||
    "";
  const finalMaterial =
    matEn ||
    (typeof product.material === "string" ? product.material.trim() : "") ||
    "";

  // 5. SEO & HIGHLIGHTS
  const rawHighlights = Array.isArray(product.highlights)
    ? product.highlights
    : Array.isArray(existingMeta.highlights)
      ? existingMeta.highlights
      : [];

  const highlights = {
    en: rawHighlights
      .map((h: any) => h?.en || (typeof h === "string" ? h.trim() : ""))
      .filter(Boolean),
    fr: rawHighlights.map((h: any) => h?.fr || "").filter(Boolean),
    ar: rawHighlights.map((h: any) => h?.ar || "").filter(Boolean),
  };

  const rawSeoTitle =
    (rawSeo as any)?.metaTitle || (product as any)?.seoTitle || "";
  const rawSeoDesc =
    (rawSeo as any)?.metaDescription || (product as any)?.seoDescription || "";

  const seo: SanitySEOPayload = {
    metaTitle: {
      en: extractTranslation(rawSeoTitle, "title" as any, "en"),
      fr: extractTranslation(rawSeoTitle, "title" as any, "fr"),
      ar: extractTranslation(rawSeoTitle, "title" as any, "ar"),
    },
    metaDescription: {
      en: extractTranslation(rawSeoDesc, "description" as any, "en"),
      fr: extractTranslation(rawSeoDesc, "description" as any, "fr"),
      ar: extractTranslation(rawSeoDesc, "description" as any, "ar"),
    },
    keywords: Array.isArray(rawSeo?.keywords) ? rawSeo.keywords : [],
    openGraphImage: {
      url: isValidHttpUrl ? rawOgUrl : primaryThumbnail,
      assetId: rawOg?.assetId || rawOg?.asset?._ref || "",
    },
  };

  // 6. HANDLE / SLUG RESOLUTION
  const rawSlug =
    (product.slug as any)?.current ||
    (typeof product.slug === "string" ? product.slug : "") ||
    (product._id ? `prod-${product._id}` : "");

  const handle = String(rawSlug)
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // 7. VARIANT OPTIONS & MATRIX
  const variantInputs =
    Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants
      : [
          {
            title: "Standard Edition",
            options: { "Variant Option": "Standard" },
            images: [],
          },
        ] as unknown as ValidatedSanityVariant[];

  const getVariantOptions = (variant: any): Record<string, string> => {
    const options: Record<string, string> = {};

    if (Array.isArray(variant.options)) {
      for (const item of variant.options) {
        if (!isRecord(item)) continue;
        const opt = getText(item.option);
        const val = getText(item.value);
        if (opt && val) options[opt] = val;
      }
    } else if (isRecord(variant.options)) {
      for (const [k, v] of Object.entries(variant.options)) {
        const opt = getText(k);
        const val = getText(v);
        if (opt && val) options[opt] = val;
      }
    }

    if (Array.isArray(variant.optionValues)) {
      for (const item of variant.optionValues) {
        if (!isRecord(item)) continue;
        const opt = getText(item.option);
        const val = getText(item.value);
        if (opt && val) options[opt] = val;
      }
    }

    return options;
  };

  const inferredOptionValues = new Map<string, Set<string>>();
  for (const variant of variantInputs) {
    const opts = getVariantOptions(variant);
    for (const [title, value] of Object.entries(opts)) {
      const values = inferredOptionValues.get(title) ?? new Set<string>();
      values.add(value);
      inferredOptionValues.set(title, values);
    }
  }

  const optionMatrix = rawVariantOptions ?? [];
  const resolvedOptionMatrix =
    optionMatrix.length > 0
      ? optionMatrix
      : [...inferredOptionValues.entries()].map(([title, values]) => ({
          title,
          values: [...values],
        }));

  const finalProductOptions =
    resolvedOptionMatrix.length > 0
      ? resolvedOptionMatrix
      : [{ title: "Variant Option", values: ["Standard"] }];

  const resolvedVariants = variantInputs.map((variant, index) => {
    const options = getVariantOptions(variant);
    const optionLabel = Object.values(options).join(" / ");
    const skuSuffix =
      optionLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || String(index + 1);

    const variantImages = (
      Array.isArray(variant.images) ? variant.images : []
    ).map((image: any) => {
      const alt: Record<string, unknown> = isRecord(image.alt) ? image.alt : {};
      return {
        url: image.url || brandedPlaceholder,
        sanity_asset_id: image.asset?._ref || image._key || "",
        alt: {
          en: getText(alt.en) || getText(image.alt_en) || getText(image.alt),
          fr: getText(alt.fr) || getText(image.alt_fr),
          ar: getText(alt.ar) || getText(image.alt_ar),
        },
      };
    });

    return {
      title: variant.title || optionLabel || "Standard Edition",
      sku: product.variants?.length
        ? `SANITY-${String(product._id || "").toUpperCase()}-${skuSuffix.toUpperCase()}`
        : `SANITY-${String(product._id || "").toUpperCase()}`,
      hs_code: product.hsCode || null,
      mid_code: product.midCode || null,
      weight: product.weightGrams
        ? parseFloat(product.weightGrams.toString())
        : 0,
      length: product.lengthMm ? parseFloat(product.lengthMm.toString()) : 0,
      width: product.widthMm ? parseFloat(product.widthMm.toString()) : 0,
      height: product.heightMm ? parseFloat(product.heightMm.toString()) : 0,
      options:
        Object.keys(options).length > 0
          ? options
          : { [finalProductOptions[0].title]: finalProductOptions[0].values[0] },
      prices: [],
      material: finalMaterial,
      manage_inventory: product.manage_inventory ?? true,
      allow_backorder: product.allow_backorder ?? false,
      thumbnail: variantImages[0]?.url,
      metadata: {
        sanity_variant_id:
          variant.medusa_variant_id || variant.variantId || variant._key || "",
        ...(variant.medusa_variant_id || variant.variantId
          ? {
              medusa_variant_id:
                variant.medusa_variant_id || variant.variantId,
            }
          : {}),
        sanity_variant_content: {
          description: variant.description,
          details: variant.details,
          badge: variant.badge,
          colorHex: variant.colorHex || "",
        },
        variant_images: variantImages,
      },
    };
  });

  const variantImagesMap = Object.fromEntries(
    resolvedVariants.map((variant, index) => [
      variantInputs[index].medusa_variant_id ||
        variantInputs[index].variantId ||
        variantInputs[index]._key ||
        variant.sku,
      variant.metadata?.variant_images ?? [],
    ]),
  );

  const rawTags: string[] = Array.isArray(product.tags)
    ? product.tags
        .map((t: any) => (typeof t === "string" ? t.trim() : t?.value || ""))
        .filter(Boolean)
    : [];

  const rawOriginCountry = product.originCountry?.trim().toUpperCase();
  const originCountry =
    rawOriginCountry && rawOriginCountry !== "DZ" ? rawOriginCountry : undefined;

  const metadata: Record<string, any> = {
    sanity_id: product._id || "",
    is_sync_origin: "sanity",
    product_type: product.productType || null,
    translations,
    highlights: highlights.en.length > 0 ? highlights : rawHighlights,
    seo,
    tags: rawTags,
    variant_images: variantImagesMap,
    image_metadata: calculatedImageMetadata,
    title_en: translations.en.title,
    title_fr: translations.fr.title,
    title_ar: translations.ar.title,
    description_en: translations.en.description,
    description_fr: translations.fr.description,
    description_ar: translations.ar.description,
    material_en: translations.en.material,
    material_fr: translations.fr.material,
    material_ar: translations.ar.material,
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
    tags: rawTags.map((value) => ({ value })),
    options: finalProductOptions,
    metadata,
    variants: resolvedVariants,
  };
}