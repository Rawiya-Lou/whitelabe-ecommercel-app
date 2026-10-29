import { HttpTypes } from "@medusajs/framework/types";

export interface SanityLocalizedString {
  en?: string;
  fr?: string;
  ar?: string;
}
export interface SanityOpenGraphImage {
  url?: string;
  assetId?: string;
  asset?: {
    _type: "reference";
    _ref: string;
  };
}

export interface SanitySEOPayload {
  metaTitle?: { en?: string; fr?: string; ar?: string };
  metaDescription?: { en?: string; fr?: string; ar?: string };
  keywords?: string[];
  openGraphImage?: SanityOpenGraphImage;
}

export interface SanityCategoryPayload extends Partial<HttpTypes.AdminProductCategory> {
  _id: string;
  title: string;
  slug: string;
}

export interface SanityImagePayload extends Partial<HttpTypes.AdminProductImage> {
  url: string;
  _key: string;
  _type?: string;
  id?: string;
  asset?: {
    _type: string;
    _ref: string;
  };
  alt?: string; // Clear string primitive required by Medusa API routes & custom mappers
  alt_en?: string; // Custom fields matching your Sanity Studio Schema defineField setup
  alt_fr?: string;
  alt_ar?: string;
}

export interface SanityRawImageInput {
  _type?: string;
  asset?: {
    _ref?: string;
    [key: string]: unknown;
  };
  _key?: string;
  url?: string;
  alt_en?: string;
  alt_fr?: string;
  alt_ar?: string;
  [key: string]: unknown;
}

export interface SanityRawCategoryInput {
  _type?: string;
  _ref?: string;
  _id?: string;
  slug?: string | { current?: string };
  title?: string | SanityLocalizedString;
  [key: string]: unknown;
}

export interface SanityProductPayload {
  _id: string;
  title: string | SanityLocalizedString;
  description?: string | SanityLocalizedString;
  subtitle?: string;
  material?: string | SanityLocalizedString; 
  slug: string;
  basePriceDzd?: number;
  basePriceEur?: number;
  basePriceUsd?: number;
  thumbnail?: string;
  images?: SanityImagePayload[];
  seoTitle?: string;
  barcode?: string | null;
  seoDescription?:string;
  tags?: string[];
  highlights?: [];
  hsCode?: string; 
  midCode?: string;
  productType?: string;
  seo?: SanitySEOPayload;
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  originCountry?: string;
  stockCount?: number;
  metadata: Record<string, unknown> & { sanity_id: string; is_sync_origin: "sanity" };
  categories: SanityCategoryPayload[];
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  inspection?: {
    productId?: string;
    variantId?: string;
    inventoryItemId?: string;
  };
  resolvedCategoryIds?: string[];
}

export interface SanityRawProductInput extends Omit<  
  Partial<SanityProductPayload>,
  "images" | "categories" | "slug"
> {
  _id: string;
  slug?: { current: string } | string;
  pricing?: {
    dzd?: number;
    eur?: number;
    usd?: number;
  };
  weightGrams?: number,
  lengthMm?: number,
  widthMm?: number,
  heightMm?: number,
  updatedBy?: string;
  images?: SanityRawImageInput[];
  categories?: (SanityRawCategoryInput | string)[];
}

export interface SanitySyncWorkflowInput {
  operation: "create" | "update" | "delete" | "batch";
  documentType: "category" | "product";
  productData: SanityProductPayload;
  batchProducts?: SanityProductPayload[];
  categoryIds?: string[];
  deletionTargetId?: string;
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
  stockLocationId?: string;
  stockedQuantity?: number;
  shouldLink?: boolean;
  sku: string;
}



export interface WorkflowPriceDTO extends Partial<HttpTypes.AdminPrice> {
  currency_code: string;
  amount: number;
}

export interface WorkflowVariantDTO extends Omit<
  Partial<HttpTypes.AdminProductVariant>,
  "prices"
> {
  id: string;
  sku: string;
  prices?: WorkflowPriceDTO[];
  thumbnail?: string
}

export interface WorkflowProductDTO extends Omit<
  Partial<HttpTypes.AdminProduct>,
  "variants"
> {
  id: string;
  variants?: WorkflowVariantDTO[];
}

export interface WorkflowInventoryItemDTO extends Partial<HttpTypes.AdminInventoryItem> {
  id: string;
  sku: string;
}
