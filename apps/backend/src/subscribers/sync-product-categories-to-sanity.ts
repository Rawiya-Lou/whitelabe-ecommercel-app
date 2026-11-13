import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";

import {
  syncProductToSanityWorkflow,
  deleteProductFromSanityWorkflow,
} from "../workflows/sanity-sync/forward-sync-workflows";
import {
  deleteCategoryFromSanityWorkflow,
  syncCategoryToSanityWorkflow,
} from "../workflows/sanity-sync/category-forward-workflow";
import { syncLock } from "../utils/sync-lock";

interface EventPayload {
  id?: string;
  product_id?: string;
  productId?: string;
  product_ids?: string[];
  category_id?: string;
  product_category_id?: string;
  category_ids?: string[];
}

export default async function productSanitySyncSubscriber({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<EventPayload>): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);

  const isCategoryEvent =
    eventName === "product-category.created" ||
    eventName === "product-category.updated" ||
    eventName === "product-category.deleted";

  const categoryId =
    data?.category_id ||
    data?.product_category_id ||
    (isCategoryEvent ? data?.id : undefined);

  const productIds: string[] = [];
  if (Array.isArray(data?.product_ids)) {
    productIds.push(...data.product_ids);
  } else if (data?.product_id || data?.productId) {
    productIds.push(data.product_id || data.productId!);
  } else if (!isCategoryEvent && data?.id) {
    productIds.push(data.id);
  }

  if (isCategoryEvent && categoryId) {
    logger.info(`[Sanity Sync] Processing ${eventName} for category ${categoryId}`);
    try {
      if (eventName === "product-category.deleted") {
        await deleteCategoryFromSanityWorkflow(container).run({
          input: { categoryId },
        });
      } else {
        await syncCategoryToSanityWorkflow(container).run({
          input: { categoryId },
        });
      }
      logger.info(`[Sanity Sync] Completed ${eventName} for category ${categoryId}`);
    } catch (error) {
      logger.error(`[Sanity Sync] Category sync failed for ${categoryId}: ${error}`);
      throw error;
    }
    return;
  }

  if (productIds.length > 0) {
    for (const targetId of productIds) {
      if (await syncLock.consume(`sanity-inbound-product:${targetId}`)) {
        logger.info(
          `[Sanity Sync] Skipping inbound-originated ${eventName} event for ${targetId}.`,
        );
        continue;
      }

      logger.info(
        `[Sanity Sync] Triggering forward product sync for ${targetId} due to ${eventName}.`,
      );

      try {
        if (eventName === "product.deleted") {
          await deleteProductFromSanityWorkflow(container).run({
            input: { productId: targetId },
          });
        } else {
          await syncProductToSanityWorkflow(container).run({
            input: { productId: targetId },
          });
        }
        logger.info(`[Sanity Sync] Completed sync for product ${targetId}`);
      } catch (error) {
        logger.error(`[Sanity Sync] Product sync failed for ${targetId}: ${error}`);
        throw error;
      }
    }
    return;
  }

  if (categoryId) {
    try {
      await syncCategoryToSanityWorkflow(container).run({
        input: { categoryId },
      });
    } catch (error) {
      logger.error(`[Sanity Sync] Fallback category sync failed for ${categoryId}: ${error}`);
    }
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
    "product-category.attached",
    "product-category.detached",
    "product-category.products.batch",
  ],
};