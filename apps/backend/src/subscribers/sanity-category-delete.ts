import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IProductModuleService, Logger } from "@medusajs/framework/types";
import { deleteSanityDocument } from "../utils/sanity-document-delete";

interface ProductCategoryDeletedEvent {
  id: string;
}

export default async function syncDeletedCategoryToSanity({
  event: { data },
  container,
}: SubscriberArgs<ProductCategoryDeletedEvent>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const productService = container.resolve(
    Modules.PRODUCT,
  ) as IProductModuleService;

  try {
    const category = await productService.retrieveProductCategory(data.id, {
      select: ["id", "metadata"],
      withDeleted: true,
    });
    const sanityId = category.metadata?.sanity_id;

    if (typeof sanityId !== "string" || sanityId.length === 0) {
      logger.info(
        `[Sanity Delete Sync] Medusa category [${data.id}] has no Sanity mapping; skipping outbound delete.`,
      );
      return;
    }

    await deleteSanityDocument({
      documentId: sanityId,
      logger,
      context: `Medusa category deletion [${data.id}]`,
    });
  } catch (error: unknown) {
    logger.error(
      `[Sanity Delete Sync] Could not synchronize deleted category [${data.id}]: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export const config: SubscriberConfig = {
  event: "product-category.deleted",
};
