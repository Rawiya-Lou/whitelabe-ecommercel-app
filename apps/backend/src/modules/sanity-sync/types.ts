export interface MedusaVariantOptionInput {
  value?: string | null;
  option?: string | { title?: string | null } | null;
}

export interface MedusaVariantInput {
  id: string;
  sanity_variant_id?: string | null;
  title?: string | null;
  sku?: string | null;
  options?: MedusaVariantOptionInput[] | null;
}

export interface SanityVariantOption {
  _type?: "object";
  _key?: string;
  option: string;
  value: string;
}

export interface SanityVariantDocument {
  _type?: string;
  _key?: string;
  sanity_variant_id?: string;
  variantId?: string;
  medusa_variant_id?: string;
  sku?: string;
  title?: string;
  options?: SanityVariantOption[];
  optionValues?: SanityVariantOption[];
  images?: unknown;
  [key: string]: unknown;
}
