import type { IProductModuleService, Logger } from "@medusajs/framework/types";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { deleteProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import { deleteSanityDocument } from "../../../utils/sanity-document-delete";

deleteProductCategoriesWorkflow.hooks.categoriesDeleted(
  async ({ ids }, { container }) => {
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;
    const productService = container.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;

    for (const categoryId of ids) {
      try {
        const category = await productService.retrieveProductCategory(
          categoryId,
          {
            select: ["id", "metadata"],
            withDeleted: true,
          },
        );
        const sanityId =
          category.metadata && typeof category.metadata.sanity_id === "string"
            ? category.metadata.sanity_id
            : undefined;

        if (!sanityId) {
          logger.info(
            `[Sanity Category Delete Hook] Category [${categoryId}] has no sanity_id metadata; skipping outbound deletion.`,
          );
          continue;
        }

        await deleteSanityDocument({
          documentId: sanityId,
          logger,
          context: `Medusa category deletion [${categoryId}]`,
        });
      } catch (error: unknown) {
        logger.error(
          `[Sanity Category Delete Hook] Could not sync deleted category [${categoryId}] to Sanity: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return new StepResponse(null);
  },
);
