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
import { Logger } from "@medusajs/framework/types";

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
  if (!targetId) {
    const logger = container.resolve<Logger>("ContainerRegestirationKeys");
    logger.warn(
      `[Sanity Sync] Ignoring ${eventName} event without a resolvable entity ID.`,
    ) 
    return;
  }

  if (
    eventName.startsWith("product.") &&
    (await syncLock.consume(`sanity-inbound-product:${targetId}`))
  ) {
    return;
  }

  if (eventName === "product-category.deleted") {
    await deleteCategoryFromSanityWorkflow(container).run({
      input: { categoryId: targetId },
    });
    return;
  }

  if (
    eventName === "product-category.created" ||
    eventName === "product-category.updated"
  ) {
    await syncCategoryToSanityWorkflow(container).run({
      input: { categoryId: targetId },
    });
    return;
  }

  if (isCategoryMembershipEvent) {
    await syncProductToSanityWorkflow(container).run({
      input: { productId: targetId },
    });
    return;
  }

  if (eventName === "product.deleted") {
    await deleteProductFromSanityWorkflow(container).run({
      input: { productId: targetId },
    });
    return;
  }

  await syncProductToSanityWorkflow(container).run({
    input: { productId: targetId },
  });
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