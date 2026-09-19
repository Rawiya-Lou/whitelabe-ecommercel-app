export interface SanityLocalizedString {
  en: string;
  fr?: string;
  ar?: string;
}

export interface SanityCategoryPayload {
  _id: string;
  title: string;
  slug: string;
}

export interface SanityProductPayload {
  _id: string;
  title: SanityLocalizedString;
  description: SanityLocalizedString;
  slug: string;
  basePriceDzd: number; 
  basePriceEur: number;
  basePriceUsd: number;
  weightGrams?: number;
  stockCount: number; 
  categories: SanityCategoryPayload[];
}

export interface SanitySyncWorkflowInput {
  operation: "create" | "update" | "delete";
  documentType: "category" | "product";
  categoryData?: SanityCategoryPayload;
  productData?: SanityProductPayload;
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
  operation: "created" | "updated" | "skipped";
}

// Structural type assertions to guarantee type safety without 'any' leakage
export interface WorkflowVariantDTO  {
  id: string;
  sku: string;
}

export interface WorkflowProductDTO {
  id: string;
  variants?: WorkflowVariantDTO[];
}

export interface WorkflowInventoryItemDTO {
  id: string;
  sku: string;
}