import type { IProductModuleService, Logger } from "@medusajs/framework/types";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows";
import { deleteSanityDocument } from "../../../utils/sanity-document-delete";
import { syncLock } from "../../../utils/sync-lock";

deleteProductsWorkflow.hooks.productsDeleted(async ({ ids }, { container }) => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const productService = container.resolve(
    Modules.PRODUCT,
  ) as IProductModuleService;

  for (const medusaId of ids) {
    try {
      const isLockedBySanity = await syncLock.isLocked(
        `sanity-delete:${medusaId}`,
      );
      if (isLockedBySanity) {
        await syncLock.release(`sanity-delete:${medusaId}`);
        logger.info(
          `[Sanity Product Delete Hook] Deletion for [${medusaId}] was initiated by Sanity. Loop bypassed.`,
        );
        continue;
      }

      const product = await productService.retrieveProduct(medusaId, {
        select: ["id", "metadata"],
        withDeleted: true,
      });

      const rawSanityId =
        product.metadata && typeof product.metadata.sanity_id === "string"
          ? product.metadata.sanity_id
          : undefined;

      if (!rawSanityId) {
        logger.info(
          `[Sanity Product Delete Hook] Product [${medusaId}] has no sanity_id metadata; skipping outbound deletion.`,
        );
        continue;
      }

      const cleanSanityId = rawSanityId.replace(/^drafts\./, "");

      // LOCK SANITY ID (15s) SO SANITY'S DELETE WEBHOOK IS DROPPED BY MEDUSA
      await syncLock.acquire(`medusa-delete:${cleanSanityId}`, 15);
      await syncLock.acquire(`medusa-delete:${rawSanityId}`, 15);

      // DELETE FROM SANITY
      await deleteSanityDocument({
        documentId: cleanSanityId,
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
