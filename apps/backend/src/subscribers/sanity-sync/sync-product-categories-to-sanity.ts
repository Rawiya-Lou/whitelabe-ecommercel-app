import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";

import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

interface ProductCategoryLinkPayload {
  id?: string; // Coming from product.updated
  product_id?: string; // Coming from product-category.attached / detached
}

export default async function syncProductCategoriesToSanity({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<ProductCategoryLinkPayload>): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const isTestEnvironment =
    process.env.NODE_ENV === "test" ||
    process.env.TEST_TYPE !== undefined ||
    typeof (global as any).it === "function";

  if (isTestEnvironment) {
    return;
  }
  const sanityToken = process.env.SANITY_API_TOKEN;
  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "development";

  if (!sanityToken || !projectId) {
    logger.warn(
      "[Sanity Category Sync] Integration credentials missing; skipping reverse mutation.",
    );
    return;
  }

  const targetProductId = data.product_id || data.id;

  if (!targetProductId) {
    logger.error(
      `[Sanity Category Sync] Could not resolve a valid product ID from event context [${eventName}].`,
    );
    return;
  }

  logger.info(
    `[Sanity Category Sync] Intercepted event [${eventName}] for Product [${targetProductId}]`,
  );

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "description",
      "metadata",
      "categories.id",
      "categories.name",
      "categories.handle",
      "categories.metadata",
    ],
    filters: { id: targetProductId },
  });

  const product = products?.[0];

  if (!product) {
    logger.warn(
      `[Sanity Category Sync] Product [${targetProductId}] was not found; skipping reverse mutation.`,
    );
    return;
  }

  const productMetadata = product.metadata ?? {};
  // IMPROVED SAFETY GUARD: Completely drop test-generated items or Sanity origins
  const isTestId =
    targetProductId.includes("vitest") ||
    String(productMetadata.sanity_id).includes("vitest");
  if (productMetadata.is_sync_origin === "sanity" || isTestId) {
    logger.info(
      `[Sanity Category Sync] Product [${targetProductId}] originated from Sanity or Test Suite; bypassing reverse mutation loop.`,
    );
    return;
  }

  const sanityProductId =
    typeof productMetadata.sanity_id === "string"
      ? productMetadata.sanity_id
      : product.id.replace("_", "-");

  const categories = (product.categories ?? []).flatMap((category) => {
    if (!category) return [];

    let resolvedSanityRef =
      typeof category.metadata?.sanity_id === "string"
        ? category.metadata.sanity_id
        : `category-${category.id.replace("_", "-")}`;

    if (!resolvedSanityRef) {
      logger.warn(
        `[Sanity Category Sync] Skipping category [${category.id}] - No valid sanity_id or handle resolved.`,
      );
      return [];
    }

    resolvedSanityRef = String(resolvedSanityRef).replace("drafts.", "");

    return [
      {
        _type: "reference",
        _ref: resolvedSanityRef, // Guarantees a matching structural key in Sanity
        _key: `cat_${category.id}`,
      },
    ];
  });

  const mutationUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`;
  const mutationPayload = {
    mutations: [
      {
        createIfNotExists: {
          _id: sanityProductId,
          _type: "product",
          medusaId: product.id,
          updatedBy: "medusa",
          title: {
            en: product.title,
          },
          slug: {
            _type: "slug",
            current: product.handle,
          },

          description: {
            en: product.description || "",
          },
          basePriceDzd: 0,
          basePriceEur: 0,
          basePriceUsd: 0,
          weightGrams: product.weight || 0,
          lengthMm: product.length || 0,
          widthMm: product.width || 0,
          heightMm: product.height || 0,
          stockCount: 0
        },
      },
      {
        patch: {
          id: sanityProductId,
          set: {
            medusaId: product.id,
            updatedBy: "medusa",
            title: {
              en: product.title,
            },
            slug: {
              _type: "slug",
              current: product.handle,
            },
            description: {
              en: product.description || "",
            },
            categories: categories,
            basePriceDzd: typeof productMetadata.basePriceDzd === "number" ? productMetadata.basePriceDzd : 0,
            basePriceEur: typeof productMetadata.basePriceEur === "number" ? productMetadata.basePriceEur : 0,
            basePriceUsd: typeof productMetadata.basePriceUsd === "number" ? productMetadata.basePriceUsd : 0,
            weightGrams: typeof product.weight === "number" ? product.weight : 0,
            lengthMm: typeof product.length === "number" ? product.length : 0,
            widthMm: typeof product.width === "number" ? product.width : 0,
            heightMm: typeof product.height === "number" ? product.height : 0
          
          },
        },
      },
      ...(product.categories ?? []).flatMap((category) => {
        if (!category) return [];

        const targetCategorySanityId =
          typeof category.metadata?.sanity_id === "string"
            ? category.metadata.sanity_id
            : `category-${category.id.replace("_", "-")}`;
        const cleanCategoryName = category.name || "Category";

        return [
          {
            createIfNotExists: {
              _id: targetCategorySanityId,
              _type: "category",
              medusaId: category.id, // Populates your custom metadata hidden input!
              title: { en: cleanCategoryName },
              slug: { _type: "slug", current: category.handle },
            },
          },
          {
            patch: {
              id: targetCategorySanityId,
              set: {
                medusaId: category.id,
                title: { en: cleanCategoryName },
                slug: { _type: "slug", current: category.handle },
              },
            },
          },
        ];
      }),
    ],
  };
  try {
    const response = await fetch(mutationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sanityToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mutationPayload),
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      logger.error(
        `[Sanity Category Sync] Content Lake rejected category sync for product [${sanityProductId}]: ${errorPayload}`,
      );
      return;
    }

    logger.info(
      `[Sanity Category Sync] Synchronized ${categories.length} category reference(s) for product [${sanityProductId}].`,
    );
  } catch (error) {
    logger.error(
      `[Sanity Category Sync] Could not sync categories for product [${sanityProductId}]: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product-category.attached",
    "product-category.detached",
  ],
};
