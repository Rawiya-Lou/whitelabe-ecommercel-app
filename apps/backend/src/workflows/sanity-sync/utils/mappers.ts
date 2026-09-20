import { ProductStatus } from "@medusajs/framework/utils";
import { HttpTypes } from "@medusajs/framework/types";
import { SanityImagePayload, SanityProductPayload } from "../types";

export function mapSanityToMedusaProduct(
  product: SanityProductPayload & { images?: SanityImagePayload[]; lengthMm?: number; widthMm?: number; heightMm?: number; originCountry?: string ;  manage_inventory?: boolean;
    allow_backorder?: boolean;},
  categoryIds: string[],
  shippingProfileId?: string,
  salesChannelId?: string
): HttpTypes.AdminCreateProduct {
  
  const prices = [
    { currency_code: "dzd", amount: Math.round(product.basePriceDzd * 100) },
    { currency_code: "eur", amount: Math.round(product.basePriceEur * 100) },
    { currency_code: "usd", amount: Math.round(product.basePriceUsd * 100) },
  ];

  // Resolves asset elements cleanly using fallback defaults
  const resolvedImages = product.images && product.images.length > 0
    ? product.images.map((img) => ({ url: img.url || "https://unsplash.com" }))
    : [{ url: "https://unsplash.com" }];

  const primaryThumbnail = resolvedImages[0].url;
    const metadata: Record<string, string> = {};
  if (product.title && typeof product.title === 'object') {
    Object.entries(product.title).forEach(([lang, val]) => {
      if(val)
      metadata[`title_${lang}`] = String(val).trim();
    });
  }

  return {
    title: product.title?.en?.trim() || "Untitled Product",
    handle: product.slug.toLowerCase().trim(),
    description: product.description?.en ? product.description.en.trim() : null,
    status: ProductStatus.PUBLISHED,
    
    // Media assignments
    thumbnail: primaryThumbnail,
    images: resolvedImages,
    subtitle: product.title.fr ? product.title.fr.trim() : null,

    weight: product.weightGrams ? parseFloat(product.weightGrams.toString()) : 0,
    length: product.lengthMm ? parseFloat(product.lengthMm.toString()) : 0,
    width: product.widthMm ? parseFloat(product.widthMm.toString()) : 0,
    height: product.heightMm ? parseFloat(product.heightMm.toString()) : 0,
    origin_country: product.originCountry ? product.originCountry.toLowerCase().trim() : "",
    
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
        sku: `SANITY-${product._id.toUpperCase().trim()}`,
        options: { "Variant Option": "Standard" },
        prices: prices,
         manage_inventory: product.manage_inventory ?? true,
        allow_backorder: product.allow_backorder ?? false,
      },
    ],
  };
}
