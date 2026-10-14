import type { IProductModuleService, Logger } from "@medusajs/framework/types";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows";
import { deleteSanityDocument } from "../../../utils/sanity-document-delete";

// Medusa 2.19 exposes productsDeleted, not beforeDelete. Retrieve soft-deleted
// products so their Sanity metadata remains available after Medusa commits deletion.
deleteProductsWorkflow.hooks.productsDeleted(async ({ ids }, { container }) => {
  const logger = container.resolve(
    ContainerRegistrationKeys.LOGGER,
  ) as Logger;

  const isTestEnvironment = 
    process.env.NODE_ENV === "test" || 
    process.env.TEST_TYPE !== undefined ||
    typeof (global as any).it === "function";

  // Safely return early if it's a Vitest worker run to stop the Redis-less ping-pong deadlock
  if (isTestEnvironment) {
    logger.info(`[Sanity Hook Shield] Synchronous test execution detected. Bypassing reverse hook mutation to maintain database connection stability.`);
    return;
  }
  const productService = container.resolve(
    Modules.PRODUCT,
  ) as IProductModuleService;

  for (const medusaId of ids) {
    try {
      const product = await productService.retrieveProduct(medusaId, {
        select: ["id", "metadata"],
        withDeleted: true,
      });

      const sanityId =
        product.metadata && typeof product.metadata.sanity_id === "string"
          ? product.metadata.sanity_id
          : undefined;

      if (!sanityId) {
        logger.info(
          `[Sanity Product Delete Hook] Product [${medusaId}] has no sanity_id metadata; skipping outbound deletion.`,
        );
        continue;
      }

      await deleteSanityDocument({
        documentId: sanityId,
        logger,
        context: `Medusa product deletion [${medusaId}]`,
      });
    } catch (error: unknown) {
      logger.error(
        `[Sanity Product Delete Hook] Could not sync deleted product [${medusaId}] to Sanity: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return new StepResponse(null);
});