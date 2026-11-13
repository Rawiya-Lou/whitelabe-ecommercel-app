import { z } from "@medusajs/framework/zod";

export const cleanString = (max = 1000) =>
  z
    .unknown()
    .transform((val) => {
      if (typeof val !== "string") return "";
      return val.replace(/<[^>]*>?/gm, "").trim().slice(0, max);
    });

/**
 * Handles polymorphic Sanity localized inputs:
 * Accepts: "Text" | { en: "Text", fr: "...", ar: "..." } | { _en: "Text", ... }
 */
export const LocalizedStringSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .optional()
  .transform((val) => {
    if (!val) return { en: "", fr: "", ar: "" };
    if (typeof val === "string") {
      const clean = val.replace(/<[^>]*>?/gm, "").trim();
      return { en: clean, fr: "", ar: "" };
    }
    const cleanField = (key: string) => {
      const item = val[key] || val[`_${key}`];
      return typeof item === "string"
        ? item.replace(/<[^>]*>?/gm, "").trim()
        : "";
    };
    return {
      en: cleanField("en"),
      fr: cleanField("fr"),
      ar: cleanField("ar"),
    };
  });

export const SanityImageSchema = z.object({
  url: z.url().optional(),
  _key: cleanString(50).optional(),
  _type: cleanString(50).optional(),
  id: cleanString(50).optional(),
  asset: z
    .object({
      _ref: z.string().optional(),
      _type: z.string().optional(),
    })
    .optional(),
  alt: LocalizedStringSchema,
  alt_en: cleanString(150).optional(),
  alt_fr: cleanString(150).optional(),
  alt_ar: cleanString(150).optional(),
});

export const SanityVariantSchema = z.object({
  _key: cleanString(50).optional(),
  variantId: cleanString(100).optional(),
  medusa_variant_id: cleanString(100).optional(),
  title: cleanString(150).optional(),
  sku: cleanString(100).optional(),
  barcode: cleanString(100).optional(),
  ean: cleanString(100).optional(),
  upc: cleanString(100).optional(),
  colorHex: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid Hex")
    .optional()
    .or(z.literal("")),
  images: z.array(SanityImageSchema).optional().default([]),
  options: z.record(z.string(), z.string()).optional(),
  optionValues: z
    .array(z.object({ option: z.string(), value: z.string() }))
    .optional(),
  description: LocalizedStringSchema,
  details: LocalizedStringSchema,
  badge: LocalizedStringSchema,
  swatchImage: SanityImageSchema.optional(),
});

export const SanitySEOSchema = z.object({
  metaTitle: LocalizedStringSchema,
  metaDescription: LocalizedStringSchema,
  keywords: z.array(cleanString(50)).optional().default([]),
  openGraphImage: z
    .object({
      url: z.url().optional(),
      assetId: z.string().optional(),
      asset: z.object({ _ref: z.string().optional() }).optional(),
    })
    .optional(),
});

export const SanityProductInputSchema = z.object({
  _id: z.string().min(1, "Sanity Document ID is required"),
  title: LocalizedStringSchema,
  subtitle: LocalizedStringSchema,
  description: LocalizedStringSchema,
  material: LocalizedStringSchema,
  slug: z
    .union([z.string(), z.object({ current: z.string().optional() })])
    .transform((val) => {
      const raw = typeof val === "string" ? val : val?.current || "";
      return raw
        .toLowerCase()
        .trim()
        .replace(/_/g, "-")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 150);
    }),
  productType: cleanString(100).optional(),
  tags: z
    .array(z.union([z.string(), z.object({ value: z.string() })]))
    .optional()
    .transform((tags) =>
      (tags || [])
        .map((t) => (typeof t === "string" ? t : t?.value || ""))
        .map((s) => s.replace(/<[^>]*>?/gm, "").trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  highlights: z
    .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
    .optional()
    .transform((items) => {
      const result = {
        en: [] as string[],
        fr: [] as string[],
        ar: [] as string[],
      };
      (items || []).slice(0, 15).forEach((item) => {
        if (typeof item === "string") {
          const clean = item.replace(/<[^>]*>?/gm, "").trim();
          if (clean) result.en.push(clean);
        } else if (typeof item === "object" && item !== null) {
          const getLang = (k: string) =>
            typeof item[k] === "string"
              ? (item[k] as string).replace(/<[^>]*>?/gm, "").trim()
              : "";
          if (getLang("en")) result.en.push(getLang("en"));
          if (getLang("fr")) result.fr.push(getLang("fr"));
          if (getLang("ar")) result.ar.push(getLang("ar"));
        }
      });
      return result;
    }),
  seo: SanitySEOSchema.optional(),
  images: z.array(SanityImageSchema).optional().default([]),
  variants: z.array(SanityVariantSchema).optional().default([]),
  variantOptions: z
    .array(
      z.object({
        title: cleanString(100),
        values: z.array(cleanString(100)),
      }),
    )
    .optional(),
  weightGrams: z.coerce.number().nonnegative().optional(),
  lengthMm: z.coerce.number().nonnegative().optional(),
  widthMm: z.coerce.number().nonnegative().optional(),
  heightMm: z.coerce.number().nonnegative().optional(),
  hsCode: cleanString(50).optional(),
  midCode: cleanString(50).optional(),
  barcode: cleanString(100).optional(),
  manage_inventory: z.boolean().optional().default(true),
  allow_backorder: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Infer strict TypeScript types automatically
export type ValidatedSanityProduct = z.infer<typeof SanityProductInputSchema>;
export type ValidatedSanityVariant = z.infer<typeof SanityVariantSchema>;
export type ValidatedSanityImage = z.infer<typeof SanityImageSchema>;