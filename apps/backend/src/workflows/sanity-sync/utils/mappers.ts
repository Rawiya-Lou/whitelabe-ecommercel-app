import { ProductStatus } from "@medusajs/framework/utils";
import { SanityProductPayload } from "../types";

export interface MedusaCoreProductInput {
  title: string;
  handle: string;
  description: string;
  status: ProductStatus;
  weight: number;
  shipping_profile_id?: string;
  category_ids: string[];
  sales_channels: { id: string }[];
  options: { title: string; values: string[] }[];
  variants: {
    title: string;
    sku: string;
    options: Record<string, string>;
    prices: { currency_code: string; amount: number }[];
  }[];
}

export function mapSanityToMedusaProduct(
  product: SanityProductPayload,
  categoryIds: string[],
  shippingProfileId?: string,
  salesChannelId?: string
): MedusaCoreProductInput {
  return {
    title: product.title,
    handle: product.slug,
    description: product.description,
    status: ProductStatus.PUBLISHED,
    weight: product.weightGrams || 0,
    shipping_profile_id: shippingProfileId,
    category_ids: categoryIds,
    sales_channels: salesChannelId ? [{ id: salesChannelId }] : [],
    options: [{ title: "Variant Option", values: ["Standard"] }],
    variants: [
      {
        title: "Standard Edition",
        sku: `SANITY-${product._id.toUpperCase()}`,
        options: { "Variant Option": "Standard" },
        prices: [
          { currency_code: "dzd", amount: Math.round((product.basePriceDzd || 0) * 100) },
          { currency_code: "eur", amount: Math.round((product.basePriceEur || 0) * 100) },
          { currency_code: "usd", amount: Math.round((product.basePriceUsd || 0) * 100) },
        ],
      },
    ],
  };
}
