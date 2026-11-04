import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import {
  syncProductToSanityWorkflow,
  deleteProductFromSanityWorkflow,
} from "../../workflows/sanity-sync/forward-sync-workflows";
import {
  deleteCategoryFromSanityWorkflow,
  syncCategoryToSanityWorkflow,
} from "../../workflows/sanity-sync/category-forward-workflow";
import { syncLock } from "../../utils/sync-lock";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

interface EventPayload {
  id?: string;
  product_id?: string;
  productId?: string;
  category_id?: string;
  product_category_id?: string;
}

export default async function productSanitySyncSubscriber({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<EventPayload>): Promise<void> {
  const isCategoryEvent =
    eventName === "product-category.created" ||
    eventName === "product-category.updated" ||
    eventName === "product-category.deleted";
  const isCategoryMembershipEvent =
    eventName === "product-category.attached" ||
    eventName === "product-category.detached";
  const targetId = isCategoryEvent
    ? data?.category_id || data?.product_category_id || data?.id
    : isCategoryMembershipEvent
      ? data?.product_id || data?.productId || data?.id
      : data?.product_id || data?.id;
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  if (!targetId) {
    logger.warn(
      `[Sanity Sync] Ignoring ${eventName} event without a resolvable entity ID.`,
    );
    return;
  }

  logger.info(
    `[Sanity Sync] Received ${eventName} event for ${targetId}; starting outbound synchronization.`,
  );

  if (
    eventName.startsWith("product.") &&
    (await syncLock.consume(`sanity-inbound-product:${targetId}`))
  ) {
    logger.info(
      `[Sanity Sync] Skipping inbound-originated ${eventName} event for ${targetId}.`,
    );
    return;
  }

  try {
    if (eventName === "product-category.deleted") {
      await deleteCategoryFromSanityWorkflow(container).run({
        input: { categoryId: targetId },
      });
    } else if (
      eventName === "product-category.created" ||
      eventName === "product-category.updated"
    ) {
      await syncCategoryToSanityWorkflow(container).run({
        input: { categoryId: targetId },
      });
    } else if (isCategoryMembershipEvent) {
      await syncProductToSanityWorkflow(container).run({
        input: { productId: targetId },
      });
    } else if (eventName === "product.deleted") {
      await deleteProductFromSanityWorkflow(container).run({
        input: { productId: targetId },
      });
    } else {
      await syncProductToSanityWorkflow(container).run({
        input: { productId: targetId },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `[Sanity Sync] ${eventName} synchronization failed for ${targetId}: ${message}`,
    );
    throw error;
  }

  logger.info(
    `[Sanity Sync] Completed ${eventName} outbound synchronization for ${targetId}.`,
  );
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-category.attached",
    "product-category.detached",
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
  ],
};