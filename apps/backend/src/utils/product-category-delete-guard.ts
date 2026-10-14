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
    MedusaError.Types.NOT_ALLOWED,
    `Cannot delete category "${category.name}" while it contains ${productCount} product(s). Remove or reassign those products first.`,
  );
}
