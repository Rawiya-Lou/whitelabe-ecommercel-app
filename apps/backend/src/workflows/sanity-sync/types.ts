export interface SanityCategoryPayload {
  _id: string;
  title: string;
  slug: string;
}

export interface SanityProductPayload {
  _id: string;
  title: string;
  description: string;
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

// Structural type assertions to guarantee type safety without 'any' leakage
export interface MedusaCreatedVariantResult {
  id: string;
  sku: string;
}

export interface MedusaCreatedProductResult {
  id: string;
  variants: MedusaCreatedVariantResult[];
}

export interface MedusaCreatedInventoryItemResult {
  id: string;
  sku: string;
}