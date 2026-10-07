import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

interface ProductCategoryLinkPayload {
  id?: string;             // Coming from product.updated
  product_id?: string;     // Coming from product-category.attached / detached
}

export default async function syncProductCategoriesToSanity({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<ProductCategoryLinkPayload>): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const sanityToken = process.env.SANITY_API_TOKEN;
  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "development";

  if (!sanityToken || !projectId) {
    logger.warn(
      "[Sanity Category Sync] Integration credentials missing; skipping reverse mutation."
    );
    return;
  }

  const targetProductId = data.product_id || data.id;

  if (!targetProductId) {
    logger.error(`[Sanity Category Sync] Could not resolve a valid product ID from event context [${eventName}].`);
    return;
  }

  logger.info(`[Sanity Category Sync] Intercepted event [${eventName}] for Product [${targetProductId}]`);

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata", "categories.id", "categories.metadata"],
    filters: { id: targetProductId },
  });
  
  const product = products?.[0];

  if (!product) {
    logger.warn(
      `[Sanity Category Sync] Product [${targetProductId}] was not found; skipping reverse mutation.`
    );
    return;
  }

  const productMetadata = product.metadata ?? {};
  if (productMetadata.is_sync_origin === "sanity") {
    logger.info(
      `[Sanity Category Sync] Product [${targetProductId}] originated from Sanity; skipping reverse mutation loop.`
    );
    return;
  }

  const sanityProductId =
    typeof productMetadata.sanity_id === "string"
      ? productMetadata.sanity_id
      : product.id;

  const categories = (product.categories ?? []).flatMap((category) =>
    category
      ? [
          {
            _type: "reference",
            _ref:
              typeof category.metadata?.sanity_id === "string"
                ? category.metadata.sanity_id
                : category.id,
            _key: `cat_${category.id}`,
          },
        ]
      : []
  );
  
  const mutationUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`;

  try {
    const response = await fetch(mutationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sanityToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mutations: [
          {
            patch: {
              id: sanityProductId,
              set: { categories, _updatedBy: "medusa" },
            },
          },
            {
            patch: {
              id: sanityProductId,
              unset: ["_updatedBy"] // Clears it out for future human edits in Sanity Studio
            }
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      logger.error(
        `[Sanity Category Sync] Content Lake rejected category sync for product [${sanityProductId}]: ${errorPayload}`
      );
      return;
    }

    logger.info(
      `[Sanity Category Sync] Synchronized ${categories.length} category reference(s) for product [${sanityProductId}].`
    );
  } catch (error) {
    logger.error(
      `[Sanity Category Sync] Could not sync categories for product [${sanityProductId}]: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}


export const config: SubscriberConfig = {
  event: [
    "product.updated",
    "product-category.attached",
    "product-category.detached"
  ],
};
