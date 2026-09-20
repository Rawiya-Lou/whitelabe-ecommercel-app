import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
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
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;
    const categoryIds: string[] = [];

    if (!input?.categories || input.categories.length === 0) {
      return new StepResponse([]);
    }

    for (const cat of input.categories) {
      if (!cat?.slug) {
        logger.warn(
          "[Sanity Sync] JIT categories: Skipping empty or malformed category node.",
        );
        continue;
      }

      const normalizedHandle = cat.slug.toLowerCase().trim();
      const normalizedTitle = cat.title || cat.slug || "Category Reference";

      logger.info(
        `[Sanity Sync] 🔍 Validating database index for category handle: [${normalizedHandle}]`,
      );

      const { data: existing } = await query.graph({
        entity: "product_category",
        fields: ["id", "handle"],
        filters: { handle: [normalizedHandle] },
      });

      if (existing && existing.length > 0) {
        const matchingCategory = existing[0];
        categoryIds.push(matchingCategory.id);
        logger.info(
          `[Sanity Sync] ℹ️ Found matching database category ID: [${matchingCategory.id}]`,
        );
      } else {
        logger.info(
          `[Sanity Sync] JIT Categories System: Provisioning missing structural category row [${normalizedTitle}]`,
        );

        const { result } = await createProductCategoriesWorkflow(container).run(
          {
            input: {
              product_categories: [
                {
                  name: normalizedTitle,
                  handle: normalizedHandle,
                  is_active: true,
                },
              ],
            },
          },
        );

        if (result && Array.isArray(result) && result.length > 0) {
          categoryIds.push(result[0].id);
        }
      }
    }

    return new StepResponse<string[]>(categoryIds);
  },
);
