import { MedusaError } from "@medusajs/framework/utils";

export interface CategoryDeleteCheck {
  id: string;
  name: string;
  products?: Array<{ id: string }>;
}

export function assertCategoryCanBeDeleted(
  category: CategoryDeleteCheck,
): void {
  const productCount = category.products?.length ?? 0;
  if (productCount === 0) return;

  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "Cannot delete a category with assigned products",
  );
}
