import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import { SanityCategoryPayload } from "../types";

interface SyncCategoriesInput {
  categories: SanityCategoryPayload[];
}

export const syncProductCategoriesStep = createStep(
  "sync-product-categories",
  async (
    input: SyncCategoriesInput,
    { container },
  ): Promise<StepResponse<string[]>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const categoryIds: string[] = [];

    if (!input || !input.categories || input.categories.length === 0) {
      return new StepResponse([]);
    }

    for (const cat of input.categories) {
      // 💡 FIXED: Safe fallback check to skip only missing or malformed entries
      if (!cat || !cat.slug) {
        logger.warn("JIT categories: Skipping empty or malformed category node.");
        continue;
      }

      const normalizedHandle = cat.slug.toLowerCase().trim();
      const normalizedTitle = cat.title || cat.slug || "Category Reference";

      logger.info(`🔍 Validating database index for handle: [${normalizedHandle}]`);

      // Query Central Graph Engine with the case-normalized handle parameters array
      const { data: existing } = await query.graph({
        entity: "product_category",
        fields: ["id", "handle"],
        filters: { handle: [normalizedHandle] },
      });

      // 💡 FIXED: Medusa Query Engine data outputs are arrays of records. 
      if (existing && existing.length > 0) {
        const matchingCategory = existing[0];
        categoryIds.push(matchingCategory.id);
        logger.info(`ℹ️ Found matching database category ID: [${matchingCategory.id}]`);
      } else {
        logger.info(
          `JIT Categories System: Provisioning missing structural category row [${normalizedTitle}]`,
        );
        
        const { result } = await createProductCategoriesWorkflow(container).run({
          input: {
            product_categories: [
              { name: normalizedTitle, handle: normalizedHandle, is_active: true },
            ],
          },
        });

        // FIXED: Safely verify result layout structure to append the fresh category UUID
        if (result && Array.isArray(result) && result.length > 0) {
          categoryIds.push(result[0].id);
        } else if (result && (result as any).id) {
          categoryIds.push((result as any).id);
        }
      }
    }

    return new StepResponse(categoryIds);
  },
);
