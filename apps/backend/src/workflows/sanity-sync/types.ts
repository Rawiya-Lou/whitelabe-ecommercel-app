import { HttpTypes } from "@medusajs/framework/types";

export interface SanityLocalizedString {
  en: string;
  fr?: string;
  ar?: string;
}

export interface SanityCategoryPayload extends Partial<HttpTypes.AdminProductCategory> {
  _id: string;
  title: string;
  slug: string;
}

export interface SanityImagePayload extends Partial<HttpTypes.AdminProductImage> {
  url: string;
  altText?: string;
}

export interface SanityProductPayload {
  _id: string;
  title: SanityLocalizedString;
  description: SanityLocalizedString;
  slug: string;
  basePriceDzd: number; 
  basePriceEur: number;
  basePriceUsd: number;
  thumbnail?: string; 
  images?: SanityImagePayload[];
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  originCountry?: string;
  stockCount: number; 
  categories: SanityCategoryPayload[];
  manage_inventory?: boolean;
  allow_backorder?: boolean;
}

export interface SanityRawProductInput extends Omit<Partial<SanityProductPayload>, "images" | "categories" | "slug"> {
  _id: string;
  slug?: { current: string } | string;
  pricing?: {
    dzd?: number;
    eur?: number;
    usd?: number;
  };
  images?: { _type: "image"; asset: { _ref: string; _type: "reference" }; alt?: string }[];
  categories?: { _type: "reference"; _ref: string }[] | string[];
}

export interface SanitySyncWorkflowInput {
  operation: "create" | "update" | "delete" | "batch";
  documentType: "category" | "product";
  productData?: SanityProductPayload;
  batchProducts?: SanityProductPayload[];
}

export interface SystemDefaultsDTO {
  salesChannelId: string;
  shippingProfileId: string;
  stockLocationId: string;
}

export interface ProductInspectionDTO {
  productExists: boolean;
  productId?: string;
  inventoryItemId?: string;
  variantId?: string;
}

export interface SyncWorkflowResult {
  success: boolean;
  operation: "created" | "updated" | "deleted" | "batched" | "skipped";
  details?: unknown;
}

export interface LinkVariantInventoryCompensation {
  variantId: string;
  inventoryItemId: string;
  stockLocationId: string;
  levelCreatedByThisStep: boolean;
}

export interface CreateFreshInventoryInput {
  inventoryItemExists: boolean;
  preexistingInventoryItemId: string;
  sku: string;
  title: string;
  stockLocationId: string;
  quantity: number;
  originCountry?: string;
}

export interface CreateFreshInventoryOutput {
  inventoryItemId: string;
  wasCreated: boolean;
}


export interface LinkVariantInventoryInput {
  variantId: string;
  inventoryItemId: string;
  stockLocationId: string;
  stockedQuantity: number;
  shouldLink: boolean;
}


export interface WorkflowPriceDTO extends Partial<HttpTypes.AdminPrice> {
  currency_code: string;
  amount: number;
}

export interface WorkflowVariantDTO extends Omit<Partial<HttpTypes.AdminProductVariant>, "prices"> {
  id: string;
  sku: string;
  prices?: WorkflowPriceDTO[];
}

export interface WorkflowProductDTO extends Omit<Partial<HttpTypes.AdminProduct>, "variants"> {
  id: string;
  variants?: WorkflowVariantDTO[];
}

export interface WorkflowInventoryItemDTO extends Partial<HttpTypes.AdminInventoryItem> {
  id: string;
  sku: string;
}
