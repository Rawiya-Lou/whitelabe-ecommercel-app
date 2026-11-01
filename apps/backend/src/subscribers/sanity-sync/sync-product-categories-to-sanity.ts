import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import {
  syncProductToSanityWorkflow,
  deleteProductFromSanityWorkflow,
} from "../../workflows/sanity-sync/forward-sync-workflows";

interface EventPayload {
  id?: string;
  product_id?: string;
}

export default async function productSanitySyncSubscriber({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<EventPayload>): Promise<void> {
  const targetId = data?.product_id || data?.id;
  if (!targetId) return;

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
  ],
};