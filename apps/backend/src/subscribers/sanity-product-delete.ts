import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type { IProductModuleService, Logger } from "@medusajs/framework/types";

interface ProductDeletedEvent {
  id: string;
}

interface SanityMutationResponse {
  error?: { description?: string; message?: string };
}

export default async function syncDeletedProductToSanity({
  event: { data },
  container,
}: SubscriberArgs<ProductDeletedEvent>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const sanityToken = process.env.SANITY_API_TOKEN;
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID ||
    "4vzx52ot";
  const dataset =
    process.env.SANITY_STUDIO_DATASET ||
    "development";

  if (!sanityToken || !projectId || !dataset) {
    logger.warn(
      "[Sanity Delete Sync] Skipping outbound deletion: SANITY_API_TOKEN, SANITY_PROJECT_ID, and SANITY_DATASET must be configured.",
    );
    return;
  }

  const productService = container.resolve(
    Modules.PRODUCT,
  ) as IProductModuleService;
  let sanityId: string | undefined;

  try {
    const deletedProduct = await productService.retrieveProduct(data.id, {
      select: ["id", "metadata"],
      withDeleted: true,
    });
    const metadata = deletedProduct.metadata;
    if (metadata && typeof metadata.sanity_id === "string") {
      sanityId = metadata.sanity_id;
    }
  } catch (error: unknown) {
    logger.warn(
      `[Sanity Delete Sync] Could not read Sanity mapping for deleted Medusa product [${data.id}]: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (!sanityId) {
    logger.info(
      `[Sanity Delete Sync] Medusa product [${data.id}] has no Sanity document mapping; skipping outbound delete.`,
    );
    return;
  }

  const cleanSanityId = sanityId.startsWith("drafts.")
    ? sanityId.slice("drafts.".length)
    : sanityId;
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
          { delete: { id: cleanSanityId } },
          { delete: { id: `drafts.${cleanSanityId}` } },
        ],
      }),
    });

    if (!response.ok) {
      const responseBody = (await response.json()) as SanityMutationResponse;
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        responseBody.error?.description ||
          responseBody.error?.message ||
          `Sanity mutation failed with HTTP ${response.status}.`,
      );
    }

    logger.info(
      `[Sanity Delete Sync] Deleted Sanity document [${cleanSanityId}] after Medusa product deletion [${data.id}].`,
    );
  } catch (error: unknown) {
    logger.error(
      `[Sanity Delete Sync] Failed to delete Sanity document [${cleanSanityId}]: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export const config: SubscriberConfig = {
  event: "product.deleted",
};
