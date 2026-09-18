import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import { SanityCategoryPayload } from "../types";

interface SyncCategoriesInput {
  categories: SanityCategoryPayload[];
}

export const syncProductCategoriesStep = createStep(
  "sync-product-categories",
  async (input: SyncCategoriesInput, { container }): Promise<StepResponse<string[]>> => {
    if (!input.categories || input.categories.length === 0) {
      return new StepResponse([]);
    }

    const productModuleService = container.resolve(Modules.PRODUCT);
    const slugs = input.categories.map((cat) => cat.slug);

    // Fetch categories that already exist in Medusa
    const existingCategories = await productModuleService.listProductCategories({
      handle: slugs,
    });

    const existingHandles = new Set(existingCategories.map((c) => c.handle));
    const finalCategoryIds = existingCategories.map((c) => c.id);

    // 2. Identify which categories are missing
    const missingCategories = input.categories.filter((cat) => !existingHandles.has(cat.slug));

    // 3. Create missing categories using Medusa's internal category workflow
    if (missingCategories.length > 0) {
      const categoriesToCreate = missingCategories.map((cat) => ({
        name: cat.title,
        handle: cat.slug,
        is_active: true,
      }));

      const { result } = await createProductCategoriesWorkflow(container).run({
        input: { product_categories: categoriesToCreate },
      });

      if (result && result.length > 0) {
        result.forEach((newCat) => finalCategoryIds.push(newCat.id));
      }
    }

    return new StepResponse(finalCategoryIds);
  }
);
