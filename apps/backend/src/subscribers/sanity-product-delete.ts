import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import { deleteSanityDocument } from "../utils/sanity-document-delete";

interface ProductDeletedEvent {
  ids: string[];
}

export default async function syncDeletedProductToSanity({
  event: { data },
  container,
}: SubscriberArgs<ProductDeletedEvent>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const targetIds = data?.ids;

  if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
    logger.warn(
      "[Sanity Delete Sync] Received product.deleted event, but no valid target IDs were provided in the payload.",
    );
    return;
  }

  logger.info(
    `[Sanity Delete Sync] Processing outbound deletion sequence for Medusa IDs: ${JSON.stringify(targetIds)}`,
  );

  for (const medusaId of targetIds) {
    let sanityId: string | undefined;

    try {
      // Query the database graph using 'withDeleted: true' context to scan historically soft-deleted rows
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "metadata"],
        filters: { id: medusaId },
        withDeleted: true,
      });

      // Safely ensure data returned records before destructuring array items
      const softDeletedProduct =
        products && products.length > 0 ? products[0] : null;

      if (!softDeletedProduct) {
        logger.warn(
          `[Sanity Delete Sync] Medusa entity metadata mapping row [${medusaId}] was completely missing from database indexes.`,
        );
        continue;
      }
      const metadata = softDeletedProduct.metadata;
      if (metadata && typeof metadata.sanity_id === "string") {
        sanityId = metadata.sanity_id;
      }
    } catch (error: unknown) {
      logger.warn(
        `[Sanity Delete Sync] Could not read Sanity mapping for deleted Medusa product [${medusaId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (!sanityId) {
      logger.info(
        `[Sanity Delete Sync] Medusa product [${medusaId}] has no Sanity document mapping; skipping outbound delete.`,
      );
      continue;
    }
    try {
      await deleteSanityDocument({
        documentId: sanityId,
        logger,
        context: `Medusa product deletion [${medusaId}]`,
      });
    } catch (error: unknown) {
      logger.error(
        `[Sanity Delete Sync] Could not synchronize deleted product [${medusaId}] to Sanity: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

export const config: SubscriberConfig = {
  event: "product.deleted",
};
